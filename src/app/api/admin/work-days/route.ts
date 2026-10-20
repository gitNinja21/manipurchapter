import { prisma } from "@/lib/prisma";
import { teamRoute, adminOnly, jsonBody, TeamError } from "@/lib/team";
import { validRange } from "@/lib/reporting";
import { todayWorkDate } from "@/lib/time";
import { hourlySnapshot } from "@/lib/hourlyPay";
import { auditData } from "@/lib/attendanceAudit";
import { policyAudit } from "@/lib/performanceServer";

export const GET=teamRoute(async(u,req)=>{
 adminOnly(u);
 const date=req.nextUrl.searchParams.get("date") ?? "";
 if(!validRange(date,date))throw new TeamError("Choose a valid date.");
 const day=await prisma.workDayOverride.findUnique({where:{workDate:date}});
 const attendanceCount=await prisma.attendanceRecord.count({where:{workDate:date}});
 return {date,day,attendanceCount};
});
export const POST=teamRoute(async(u,req)=>{
 adminOnly(u);
 const b=await jsonBody(req),date=String(b.date),action=String(b.action);
 if(!validRange(date,date))throw new TeamError("Choose a valid date.");
 if(!["OPEN_MONDAY","CLOSE","CORRECTION"].includes(action))throw new TeamError("Choose open Monday, close date, or correction mode.");
 if(action==="OPEN_MONDAY" && new Date(`${date}T12:00:00Z`).getUTCDay()!==1)throw new TeamError("Only Mondays can be opened with this action.");
 if(action==="CORRECTION" && date>todayWorkDate())throw new TeamError("Correction mode is for today or a past date.");
 if(!Number.isInteger(b.revision) || b.confirm!==true)throw new TeamError("Review and confirm the date-wide payroll change.");
 const mode=action==="CLOSE"?"PAID_OFF":"HOURLY";
 const day=await prisma.$transaction(async tx=>{
  const before=await tx.workDayOverride.findUnique({where:{workDate:date}});
  if((before?.revision ?? 0)!==b.revision)throw new TeamError("This date changed. Refresh and review it again.",409);
  if(before?.mode===mode)return before;
  const after=await tx.workDayOverride.upsert({where:{workDate:date},create:{workDate:date,mode,updatedById:u.id},update:{mode,revision:{increment:1},updatedById:u.id}});
  // Keep timestamps and photos intact, but remove old shift caps and proportional breaks.
  if(mode==="HOURLY") {
   const records=await tx.attendanceRecord.findMany({where:{workDate:date},include:{user:true}});
   for(const r of records) {
    if(r.policyVersion===4)continue;
    const changed=await tx.attendanceRecord.update({where:{id:r.id},data:hourlySnapshot()});
    await tx.attendanceAudit.create({data:auditData(r,r.user,u,"DATE_HOURLY_PAY",changed)});
   }
  }
  await policyAudit(tx,u,"ALL_EMPLOYEES",date,`WORK_DAY_${action}`,before,after);
  return after;
 },{timeout:20000});
 return {day};
});
