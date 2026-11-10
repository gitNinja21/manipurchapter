import {prisma} from "@/lib/prisma";
import {teamRoute,adminOnly,jsonBody,TeamError} from "@/lib/team";
import {validRange} from "@/lib/reporting";
import {todayWorkDate} from "@/lib/time";
import {policyAudit} from "@/lib/performanceServer";
import {applyAdminClockOuts} from "@/lib/adminClockOut";
export const GET=teamRoute(async(u,req)=>{
 adminOnly(u);const date=req.nextUrl.searchParams.get("date")??"";
 if(!validRange(date,date))throw new TeamError("Choose a valid date.");
 return {rule:await prisma.adminClockOutDay.findUnique({where:{workDate:date}})};
});
export const POST=teamRoute(async(u,req)=>{
 adminOnly(u);const b=await jsonBody(req),date=String(b.date),time=String(b.time);
 if(!validRange(date,date)||date<todayWorkDate())throw new TeamError("Choose today or a future date. Use attendance corrections for past dates.");
 if(typeof b.enabled!=="boolean"||!Number.isInteger(b.revision)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new TeamError("Choose a valid clock-out time in IST.");
 const cutoffAt=new Date(`${date}T${time}:00+05:30`);
 const rule=await prisma.$transaction(async tx=>{
  const before=await tx.adminClockOutDay.findUnique({where:{workDate:date}});
  if((before?.revision??0)!==b.revision)throw new TeamError("The setting changed. Reload and try again.",409);
  const after=await tx.adminClockOutDay.upsert({where:{workDate:date},create:{workDate:date,enabled:b.enabled as boolean,cutoffAt,updatedById:u.id},update:{enabled:b.enabled as boolean,cutoffAt,updatedById:u.id,revision:{increment:1}}});
  await policyAudit(tx,u,"ALL_EMPLOYEES",date,"ADMIN_CLOCK_OUT_SETTING",before,after);
  return after;
 });
 await applyAdminClockOuts();
 return {rule};
});
