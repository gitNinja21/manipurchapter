import twilio from "twilio";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { voicePhone } from "./announcementVoice";

export function announcementSmsConfig() {
  if (process.env.ANNOUNCEMENT_SMS_ENABLED !== "true") return null;
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = voicePhone(process.env.TWILIO_SMS_FROM ?? null);
  try {
    const url = new URL(process.env.ANNOUNCEMENT_SMS_BASE_URL || process.env.ANNOUNCEMENT_VOICE_BASE_URL || "");
    if (!sid || !token || url.protocol !== "https:" || url.username || url.password ||
        (messagingServiceSid ? !/^MG[0-9a-f]{32}$/i.test(messagingServiceSid) : !from)) return null;
    return { sid, token, origin: url.origin, sender: messagingServiceSid ? { messagingServiceSid } : { from: from! } };
  } catch { return null; }
}
export async function queueAnnouncementSms(tx: Prisma.TransactionClient, announcementId: string, recipients: {id:string;phone:string|null}[]) {
  const configured = !!announcementSmsConfig();
  for (const recipient of recipients) {
    const phone = voicePhone(recipient.phone);
    await tx.announcementSms.create({data:{announcementId,userId:recipient.id,phone,
      status:!phone ? "INVALID_NUMBER" : configured ? "QUEUED" : "NOT_CONFIGURED",
      error:!phone ? "Missing or invalid phone number." : configured ? null : "SMS was not configured when posted."}});
  }
}
type SendSms = (options: {to:string;body:string;statusCallback:string;from?:string;messagingServiceSid?:string})=>Promise<{sid:string}>;
export async function dispatchAnnouncementSms(now = new Date(), send?: SendSms) {
  const config = announcementSmsConfig(); if (!config) return;
  await prisma.announcementSms.updateMany({where:{status:"SENDING",updatedAt:{lt:new Date(+now-30*60000)}},data:{status:"UNKNOWN",error:"Provider status unknown; no automatic resend."}});
  const jobs = await prisma.announcementSms.findMany({where:{status:"QUEUED"},orderBy:{createdAt:"asc"},take:20,
    include:{user:{select:{active:true,approved:true,role:true,phone:true}},announcement:{select:{title:true,body:true}}}});
  const client = send ? null : twilio(config.sid,config.token,{timeout:15000,autoRetry:false});
  for (const job of jobs) {
    if (!job.user.active || !job.user.approved || job.user.role !== "EMPLOYEE" || voicePhone(job.user.phone) !== job.phone) {
      await prisma.announcementSms.updateMany({where:{id:job.id,status:"QUEUED"},data:{status:"SKIPPED",error:"Employee eligibility or phone number changed."}});
      continue;
    }
    const claim = await prisma.announcementSms.updateMany({where:{id:job.id,status:"QUEUED"},data:{status:"SENDING"}});
    if (!claim.count) continue;
    try {
      const result = await (send ?? (options=>client!.messages.create(options)))({to:job.phone!,...config.sender,
        body:`Manipur Chapter: ${job.announcement.title}\n${job.announcement.body}`,
        statusCallback:`${config.origin}/api/sms/announcements/${job.id}`});
      await prisma.announcementSms.updateMany({where:{id:job.id,status:"SENDING"},data:{status:"ACCEPTED",messageSid:result.sid}});
    } catch (error) {
      const status = (error as {status?:number}).status;
      await prisma.announcementSms.updateMany({where:{id:job.id,status:"SENDING"},data:{status:status && status>=400 && status<500 ? "FAILED" : "UNKNOWN",
        error:status ? `SMS provider error (HTTP ${status}); no automatic resend.` : "Provider response uncertain; no automatic resend."}});
    }
  }
}
export async function processAnnouncementSmsCallback(id: string, params: Record<string,string>) {
  const job = await prisma.announcementSms.findUnique({where:{id}});
  if (!job || job.phone !== params.To || (job.messageSid && job.messageSid !== params.MessageSid)) return false;
  const states: Record<string,number> = {SENDING:0,UNKNOWN:0,ACCEPTED:1,PROVIDER_QUEUED:2,SENDING_PROVIDER:3,SENT:4,FAILED:5,UNDELIVERED:5,DELIVERED:6};
  const status = params.MessageStatus === "sending" ? "SENDING_PROVIDER" : params.MessageStatus === "queued" ? "PROVIDER_QUEUED" : params.MessageStatus?.toUpperCase();
  if (!(status in states) || ["SENDING","UNKNOWN"].includes(status)) return true;
  // A signed callback may arrive before messages.create returns; never regress state.
  const allowed = Object.keys(states).filter(key=>states[key]<states[status]);
  // QUEUED is also our unsent state; only callbacks for jobs already claimed apply.
  if (!job.messageSid && job.status === "QUEUED") return false;
  await prisma.announcementSms.updateMany({where:{id,status:{in:allowed}},data:{status,messageSid:params.MessageSid,
    error:["FAILED","UNDELIVERED"].includes(status) ? `SMS provider delivery error ${/^\d+$/.test(params.ErrorCode || "") ? params.ErrorCode : "unknown"}.` : null}});
  return true;
}
const worker = globalThis as typeof globalThis & {announcementSmsTimer?:ReturnType<typeof setInterval>};
export function startAnnouncementSmsWorker() {
  if (worker.announcementSmsTimer || !announcementSmsConfig()) return;
  let running = false;
  const tick = async () => {if(running)return;running=true;try{await dispatchAnnouncementSms();}catch{console.warn("Announcement SMS check failed; claimed messages will not be resent.");}finally{running=false;}};
  worker.announcementSmsTimer=setInterval(()=>void tick(),15000);worker.announcementSmsTimer.unref();void tick();
}
