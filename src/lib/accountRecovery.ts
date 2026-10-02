import {createHash,createHmac,randomBytes} from "node:crypto";
import bcrypt from "bcryptjs";
import twilio from "twilio";
import type {Prisma} from "@prisma/client";
import {prisma} from "./prisma";
import {voicePhone} from "./announcementVoice";
export const RECOVERY_COOKIE="mc_recovery";
export class RecoveryError extends Error {constructor(message:string,public status=400){super(message);}}
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
export function recoveryConfigured(){return process.env.SMS_RECOVERY_ENABLED === "true" && !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN && /^VA[0-9a-f]{32}$/i.test(process.env.TWILIO_VERIFY_SERVICE_SID || "");}
export function verifyProvider(){
  if(!recoveryConfigured())throw new RecoveryError("SMS recovery is not configured yet. Please contact your admin.",503);
  const service=twilio(process.env.TWILIO_ACCOUNT_SID,process.env.TWILIO_AUTH_TOKEN,{timeout:15000,autoRetry:false}).verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID!);
  return {send:async(phone:string)=>(await service.verifications.create({to:phone,channel:"sms"})).sid,
    check:async(sid:string,code:string)=>(await service.verificationChecks.create({verificationSid:sid,code})).status === "approved"};
}
type Provider=ReturnType<typeof verifyProvider>;
type Db=Prisma.TransactionClient;
async function uniqueEmployee(db:Db,phone:string){
  // Include all accounts in ambiguity checks; a shared number never selects one silently.
  const users=await db.user.findMany({where:{phone:{not:null}},select:{id:true,phone:true,role:true,active:true,approved:true,passwordHash:true,employeeCode:true}});
  const matches=users.filter(u=>voicePhone(u.phone)===phone);
  const user=matches.length===1 ? matches[0] : null;
  return user?.active && user.approved && user.role==="EMPLOYEE" ? user : null;
}
export async function recoveryLimit(scope:string,value:string,seconds:number,max:number,now=new Date()){
  const secret=process.env.JWT_SECRET;if(!secret)throw new RecoveryError("Recovery unavailable.",503);
  const hash=createHmac("sha256",secret).update(value).digest("hex");
  const bucket=Math.floor(+now/(seconds*1000)),key=`${scope}:${hash}:${bucket}`;
  const count=await prisma.$transaction(async tx=>{
    await tx.recoveryRateLimit.deleteMany({where:{expiresAt:{lte:now}}});
    return tx.recoveryRateLimit.upsert({where:{key},create:{key,count:1,expiresAt:new Date((bucket+1)*seconds*1000)},update:{count:{increment:1}}});
  });
  if(count.count>max)throw new RecoveryError("Too many attempts. Please wait before trying again.",429);
}
export async function beginRecovery(input:unknown,provider:Provider=verifyProvider(),now=new Date()){
  const phone=typeof input === "string" ? voicePhone(input) : null;
  if(!phone)throw new RecoveryError("Enter your registered mobile number, including its country code.");
  await recoveryLimit("phone-minute",phone,60,1,now);
  await recoveryLimit("phone-hour",phone,3600,5,now);
  await recoveryLimit("global-day","send",86400,200,now);
  const user=await uniqueEmployee(prisma,phone),token=randomBytes(32).toString("hex"),id=digest(token);
  await prisma.accountRecovery.deleteMany({where:{expiresAt:{lte:now}}});
  await prisma.accountRecovery.create({data:{id,phone,userId:user?.id,credentialStamp:user ? digest(user.passwordHash) : null,expiresAt:new Date(+now+10*60000)}});
  if(user){
    try {const sid=await provider.send(phone);await prisma.accountRecovery.update({where:{id},data:{verificationSid:sid}});}
    catch {await prisma.accountRecovery.update({where:{id},data:{consumedAt:now}});/* Generic response prevents account discovery. */}
  }
  return token;
}
async function challenge(token:string|undefined,now:Date){
  if(!token || !/^[a-f0-9]{64}$/.test(token))throw new RecoveryError("Start recovery again.",401);
  const row=await prisma.accountRecovery.findUnique({where:{id:digest(token)}});
  if(!row || row.consumedAt || row.expiresAt<=now)throw new RecoveryError("Recovery expired. Request a new code.",410);
  return row;
}
export async function checkRecovery(token:string|undefined,code:unknown,provider:Provider=verifyProvider(),now=new Date()){
  if(typeof code!=="string" || !/^\d{4,10}$/.test(code))throw new RecoveryError("Enter the code from your SMS.");
  const row=await challenge(token,now);
  const claimed=await prisma.accountRecovery.updateMany({where:{id:row.id,attempts:{lt:5},verifiedAt:null,consumedAt:null,expiresAt:{gt:now}},data:{attempts:{increment:1}}});
  if(!claimed.count)throw new RecoveryError("Code already verified or attempt limit reached. Start again.",429);
  let valid=false;
  if(row.verificationSid)try{valid=await provider.check(row.verificationSid,code);}catch{/* Invalid/expired provider code. */}
  if(!valid)throw new RecoveryError("Code is invalid or expired. If no SMS arrived, ask your admin to check your registered number.");
  return prisma.$transaction(async tx=>{
    const user=await uniqueEmployee(tx,row.phone);
    if(!user || user.id!==row.userId || digest(user.passwordHash)!==row.credentialStamp)throw new RecoveryError("Account changed. Start recovery again.",409);
    const changed=await tx.accountRecovery.updateMany({where:{id:row.id,consumedAt:null,verifiedAt:null,expiresAt:{gt:now}},data:{verifiedAt:now,expiresAt:new Date(+now+5*60000)}});
    if(!changed.count)throw new RecoveryError("Start recovery again.",409);
    return {employeeCode:user.employeeCode};
  });
}
export async function resetRecovery(token:string|undefined,password:unknown,now=new Date()){
  if(typeof password!=="string" || password.length<8 || Buffer.byteLength(password,"utf8")>72)throw new RecoveryError("Use at least 8 characters and no more than 72 bytes for your password.");
  const row=await challenge(token,now);
  if(!row.verifiedAt)throw new RecoveryError("Verify your SMS code first.",403);
  const passwordHash=await bcrypt.hash(password,12);
  return prisma.$transaction(async tx=>{
    const user=await uniqueEmployee(tx,row.phone);
    if(!user || user.id!==row.userId || digest(user.passwordHash)!==row.credentialStamp)throw new RecoveryError("Account changed. Start recovery again.",409);
    const consumed=await tx.accountRecovery.updateMany({where:{id:row.id,verifiedAt:{not:null},consumedAt:null,expiresAt:{gt:now}},data:{consumedAt:now}});
    if(!consumed.count)throw new RecoveryError("Recovery already used or expired.",409);
    await tx.user.update({where:{id:user.id},data:{passwordHash,authVersion:{increment:1}}});
    await tx.accountRecovery.updateMany({where:{userId:user.id,consumedAt:null},data:{consumedAt:now}});
    await tx.notification.create({data:{userId:user.id,kind:"PASSWORD_RESET",entityKey:row.id,title:"Your password was reset through SMS recovery. Contact your admin if this was not you.",href:"/account"}});
    return {ok:true};
  });
}
