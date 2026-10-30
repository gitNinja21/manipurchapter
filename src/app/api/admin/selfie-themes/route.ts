import {prisma} from "@/lib/prisma";
import {teamRoute,adminOnly,jsonBody,TeamError} from "@/lib/team";
import {validDate} from "@/lib/analytics/calendar";
import {todayWorkDate} from "@/lib/time";
import {isSelfieAction,isSelfieTheme} from "@/lib/selfieThemes";
import {poseConfigured} from "@/lib/selfiePoseVision";
import {policyAudit} from "@/lib/performanceServer";
export const GET=teamRoute(async(u,req)=>{
 adminOnly(u);const date=req.nextUrl.searchParams.get("date")||todayWorkDate();if(!validDate(date))throw new TeamError("Choose a valid date.");
 const [theme,exceptions,employees,attempts]=await Promise.all([prisma.selfieTheme.findUnique({where:{date}}),prisma.selfieThemeException.findMany({where:{date}}),prisma.user.findMany({where:{role:"EMPLOYEE",active:true,approved:true},select:{id:true,name:true,employeeCode:true},orderBy:{name:"asc"}}),prisma.selfiePoseAttempt.findMany({where:{date},select:{userId:true,action:true,status:true,reason:true,createdAt:true},orderBy:{createdAt:"desc"},take:30})]);
 return {date,theme,exceptions,employees,attempts,configured:poseConfigured()};
});
export const POST=teamRoute(async(u,req)=>{
 adminOnly(u);const b=await jsonBody(req),date=b.date;if(!validDate(date)||date<todayWorkDate())throw new TeamError("Choose today or a future date. Past attendance cannot be changed by a theme.");
 if(b.operation==="EXCEPTION"||b.operation==="REVOKE"){
  if(typeof b.userId!=="string"||!isSelfieAction(b.action))throw new TeamError("Choose an employee and clock action.");
  const user=await prisma.user.findUnique({where:{id:b.userId}});if(!user||user.role!=="EMPLOYEE"||!user.active)throw new TeamError("Choose an active employee.");
  const userId=b.userId,action=b.action,reason=typeof b.reason==="string"?b.reason.trim():"";
  if(b.operation==="EXCEPTION"&&(reason.length<5||reason.length>500))throw new TeamError("Enter an exception reason (5–500 characters).");
  await prisma.$transaction(async tx=>{const where={userId_date_action:{userId,date,action}},before=await tx.selfieThemeException.findUnique({where});
   const after=b.operation==="REVOKE"?(await tx.selfieThemeException.deleteMany({where:{userId,date,action}}),null):await tx.selfieThemeException.upsert({where,create:{userId,date,action,reason,grantedById:u.id},update:{reason,grantedById:u.id,createdAt:new Date()}});
   await policyAudit(tx,u,userId,date,`SELFIE_THEME_${b.operation}`,before,after);
  });return {ok:true};
 }
 if((!isSelfieTheme(b.theme)&&b.theme!=="NONE")||!["in","out","both"].includes(String(b.appliesTo))||typeof b.enabled!=="boolean"||!Number.isInteger(b.revision))throw new TeamError("Choose a theme and when it applies.");
 if(b.theme!=="NONE"&&b.enabled&&!poseConfigured())throw new TeamError("Add OPENAI_API_KEY in Railway before enabling mandatory selfie themes.",409);
 const theme=b.theme,appliesTo=String(b.appliesTo),enabled=b.theme!=="NONE"&&b.enabled;
 await prisma.$transaction(async tx=>{
  const before=await tx.selfieTheme.findUnique({where:{date}});if((before?.revision??0)!==b.revision)throw new TeamError("This date changed. Reload it before saving.",409);
  const after=await tx.selfieTheme.upsert({where:{date},create:{date,theme,appliesTo,enabled,updatedById:u.id},update:{theme,appliesTo,enabled,revision:{increment:1},updatedById:u.id}});
  await policyAudit(tx,u,"ALL_EMPLOYEES",date,"SELFIE_THEME_SET",before,after);
 });return {ok:true};
});
