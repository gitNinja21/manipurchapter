import type {Prisma} from "@prisma/client";
import {prisma} from "./prisma";
import {todayWorkDate} from "./time";
import {isSelfieTheme,themeApplies,SelfieThemeError,type SelfieAction} from "./selfieThemes";
import {selfiePhotoHash,poseModel,posePasses,verifyPoseImage} from "./selfiePoseVision";
export async function themeForUser(db:Prisma.TransactionClient,userId:string,action:SelfieAction,date=todayWorkDate()){
 const [theme,exception]=await Promise.all([db.selfieTheme.findUnique({where:{date}}),db.selfieThemeException.findUnique({where:{userId_date_action:{userId,date,action}}})]);
 return {date,theme:themeApplies(theme,action)?theme:null,exception};
}
export async function issuePoseReceipt(userId:string,action:SelfieAction,photo:string){
 const photoHash=selfiePhotoHash(photo),now=new Date(),date=todayWorkDate();
 const {theme,exception}=await themeForUser(prisma,userId,action,date);
 if(!theme||exception)return {receipt:null,exempt:!!exception};
 if(!isSelfieTheme(theme.theme))throw new SelfieThemeError("Unknown theme. Ask an admin to correct it.",503);
 // Reserve a durable attempt before calling the paid provider; concurrent calls
 // cannot each bypass the limit by observing the same old count.
 const attempt=await prisma.$transaction(async tx=>{
  const recent=await tx.selfiePoseAttempt.count({where:{userId,createdAt:{gte:new Date(+now-10*60000)}}});
  const daily=await tx.selfiePoseAttempt.count({where:{userId,date}});
  if(recent>=8||daily>=40)throw new SelfieThemeError("Too many pose checks. Wait 10 minutes or ask your admin for a theme exception.",429);
  const inflight=await tx.selfiePoseAttempt.findFirst({where:{userId,status:"CHECKING",createdAt:{gte:new Date(+now-30000)}}});
  if(inflight)throw new SelfieThemeError("Your previous pose check is still running. Please wait.",429);
  return tx.selfiePoseAttempt.create({data:{userId,date,action,theme:theme.theme,revision:theme.revision,photoHash,model:poseModel(),expiresAt:new Date(+now+180000)}});
 });
 try{
  const verdict=await verifyPoseImage(photo,theme.theme),pass=posePasses(verdict);
  await prisma.selfiePoseAttempt.update({where:{id:attempt.id},data:{status:pass?"PASSED":"REJECTED",reason:verdict.feedback}});
  if(!pass)throw new SelfieThemeError(verdict.feedback||"The pose is not clear yet. Follow the example and retake your selfie.");
  return {receipt:attempt.id,exempt:false};
 }catch(e){
  await prisma.selfiePoseAttempt.updateMany({where:{id:attempt.id,status:"CHECKING"},data:{status:"ERROR",reason:"Pose provider could not complete the check."}});
  throw e;
 }
}
export async function enforceSelfieTheme(db:Prisma.TransactionClient,userId:string,action:SelfieAction,photo:unknown,receipt:unknown,consume=false){
 const {date,theme,exception}=await themeForUser(db,userId,action);
 if(!theme||exception)return;
 if(typeof receipt!=="string")throw new SelfieThemeError("Complete today’s selfie pose check before recording attendance.");
 const photoHash=selfiePhotoHash(photo);
 const attempt=await db.selfiePoseAttempt.findUnique({where:{id:receipt}});
 if(!attempt||attempt.userId!==userId||attempt.date!==date||attempt.action!==action||attempt.theme!==theme.theme||attempt.revision!==theme.revision||attempt.photoHash!==photoHash||attempt.status!=="PASSED"||attempt.consumedAt||attempt.expiresAt<=new Date())throw new SelfieThemeError("Your pose check expired or the theme changed. Please reopen the camera and retake the selfie.");
 if(consume){const changed=await db.selfiePoseAttempt.updateMany({where:{id:attempt.id,consumedAt:null,status:"PASSED"},data:{consumedAt:new Date()}});if(changed.count!==1)throw new SelfieThemeError("This selfie check was already used. Please retake it.",409);}
}
