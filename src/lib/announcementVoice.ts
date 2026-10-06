import twilio from "twilio";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export function voiceConfig() {
  const sid=process.env.TWILIO_ACCOUNT_SID, token=process.env.TWILIO_AUTH_TOKEN, from=process.env.TWILIO_VOICE_FROM;
  try {
    const origin=new URL(process.env.ANNOUNCEMENT_VOICE_BASE_URL || "");
    if(process.env.ANNOUNCEMENT_VOICE_ENABLED!=="true" || !sid || !token || !from || origin.protocol!=="https:" || origin.username || origin.password) return null;
    return {sid,token,from,origin:origin.origin};
  } catch {return null;}
}
export function voicePhone(value:string|null) {
  const phone=(value || "").replace(/[\s().-]/g,"");
  if(/^[6-9]\d{9}$/.test(phone)) return `+91${phone}`;
  if(/^91[6-9]\d{9}$/.test(phone)) return `+${phone}`;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}
export async function queueAnnouncementCalls(tx:Prisma.TransactionClient,announcementId:string, recipients?: {id:string;phone:string|null}[]) {
  const configured=!!voiceConfig();
  const employees=recipients ?? await tx.user.findMany({where:{role:"EMPLOYEE",active:true,approved:true},select:{id:true,phone:true}});
  for(const employee of employees) {
    const phone=voicePhone(employee.phone);
    await tx.announcementCall.create({data:{announcementId,userId:employee.id,phone,
      status:!phone ? "INVALID_NUMBER" : configured ? "QUEUED" : "NOT_CONFIGURED",
      error:!phone ? "Missing or invalid employee phone number." : configured ? null : "Voice calling was not configured when posted."}});
  }
}
export function voiceXml(message:string,action:string) {
  const response=new twilio.twiml.VoiceResponse();
  // Keep long announcements within provider Say limits without omitting content.
  for(let i=0;i<message.length;i+=3000) response.say({language:"en-IN",voice:"Polly.Aditi"},message.slice(i,i+3000));
  response.gather({input:["dtmf"],numDigits:1,timeout:10,action,method:"POST",actionOnEmptyResult:true})
    .say({language:"en-IN",voice:"Polly.Aditi"},"Press 1 to acknowledge this announcement.");
  response.hangup();
  return response.toString();
}
export function callOutcome(status:string,attempts:number,now:Date) {
  if(["busy","no-answer","failed","canceled"].includes(status)) return {
    status:attempts<2 ? "RETRY_WAIT" : status==="no-answer" || status==="busy" ? "UNANSWERED" : "FAILED",
    nextAttemptAt:new Date(+now+5*60000),
  };
  return status==="completed" ? {status:"NO_ACK",nextAttemptAt:now} : null;
}
export async function dispatchAnnouncementCalls(now=new Date(), send?: (options:Parameters<ReturnType<typeof twilio>["calls"]["create"]>[0])=>Promise<{sid:string}>) {
  const config=voiceConfig(); if(!config) return;
  const client=twilio(config.sid,config.token,{timeout:15000,autoRetry:false});
  // Do not redial an uncertain delivery after a process crash or a missing callback.
  await prisma.announcementCall.updateMany({where:{status:{in:["SENDING","CALLING"]},updatedAt:{lt:new Date(+now-30*60000)}},data:{status:"UNKNOWN",error:"Delivery status unknown. Check the provider call log; no automatic redial."}});
  const jobs=await prisma.announcementCall.findMany({where:{status:{in:["QUEUED","RETRY_WAIT"]},nextAttemptAt:{lte:now}},orderBy:{nextAttemptAt:"asc"},take:20,include:{user:{select:{active:true,approved:true,role:true,phone:true}},announcement:{select:{title:true,body:true,acknowledgements:{select:{userId:true}}}}}});
  for(const job of jobs) {
    const acknowledged=job.announcement.acknowledgements.some(a=>a.userId===job.userId);
    if(!job.user.active || !job.user.approved || job.user.role!=="EMPLOYEE" || acknowledged || voicePhone(job.user.phone)!==job.phone) {
      await prisma.announcementCall.updateMany({where:{id:job.id,status:job.status,attempts:job.attempts},data:{status:acknowledged ? "ACKNOWLEDGED_ON_WEB" : "SKIPPED",error:acknowledged ? null : "Employee eligibility or phone number changed."}});continue;
    }
    const key=randomUUID();
    const claimed=await prisma.announcementCall.updateMany({where:{id:job.id,status:job.status,attempts:job.attempts},data:{status:"SENDING",attempts:{increment:1},attemptKey:key,callSid:null,error:null}});
    if(!claimed.count) continue;
    const url=`${config.origin}/api/voice/announcements/${key}`;
    try {
      const call=await (send ?? (options=>client.calls.create(options)))({to:job.phone!,from:config.from,
        twiml:voiceXml(`Manipur Chapter announcement. ${job.announcement.title}. ${job.announcement.body}`,`${url}?event=ack`),
        statusCallback:`${url}?event=status`,statusCallbackMethod:"POST",statusCallbackEvent:["completed"],timeout:30,timeLimit:1200});
      await prisma.announcementCall.updateMany({where:{id:job.id,attemptKey:key,status:"SENDING"},data:{callSid:call.sid,status:"CALLING"}});
    } catch(error) {
      const status=(error as {status?:number}).status;
      await prisma.announcementCall.updateMany({where:{id:job.id,attemptKey:key,status:"SENDING"},data:{status:status && status>=400 && status<500 ? "FAILED" : "UNKNOWN",error:status ? `Calling provider rejected the request (HTTP ${status}).` : "Provider response uncertain; check provider logs before retrying."}});
    }
  }
}
export async function processVoiceCallback(key:string,event:string,params:Record<string,string>,now=new Date()) {
  return prisma.$transaction(async tx=>{
    const job=await tx.announcementCall.findUnique({where:{attemptKey:key}});
    if(!job || (job.callSid && job.callSid!==params.CallSid) || job.phone!==params.To) return false;
    if(event==="ack" && params.Digits==="1") {
      await tx.announcementCall.update({where:{id:job.id},data:{status:"ACKNOWLEDGED",callSid:params.CallSid,acknowledgedAt:job.acknowledgedAt ?? now,error:null}});
      await tx.announcementAck.upsert({where:{announcementId_userId:{announcementId:job.announcementId,userId:job.userId}},create:{announcementId:job.announcementId,userId:job.userId,acknowledgedAt:now},update:{}});
      await tx.notification.updateMany({where:{userId:job.userId,kind:"ANNOUNCEMENT",entityKey:job.announcementId,readAt:null},data:{readAt:now}});
    } else if(event==="status" && !job.acknowledgedAt && ["SENDING","CALLING","UNKNOWN"].includes(job.status)) {
      const outcome=callOutcome(params.CallStatus,job.attempts,now);
      if(outcome) await tx.announcementCall.update({where:{id:job.id},data:{...outcome,callSid:params.CallSid,error:null}});
    }
    return true;
  });
}
const state=globalThis as typeof globalThis & {announcementVoiceTimer?:ReturnType<typeof setInterval>};
export function startAnnouncementVoiceWorker() {
  if(state.announcementVoiceTimer || !voiceConfig()) return;
  let running=false;
  const tick=async()=>{if(running)return;running=true;try{await dispatchAnnouncementCalls();}catch{console.warn("Announcement voice check failed; will retry.");}finally{running=false;}};
  state.announcementVoiceTimer=setInterval(()=>void tick(),15000);state.announcementVoiceTimer.unref();void tick();
}
