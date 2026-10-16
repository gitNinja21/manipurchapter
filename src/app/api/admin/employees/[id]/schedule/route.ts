import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { todayWorkDate } from "@/lib/time";
import { recurringRule, recurringDescription } from "@/lib/workPolicy";
import { validateSchedule, type EditableDay, type ScheduleVersion } from "@/lib/scheduleVersions";
import { policyAudit } from "@/lib/performanceServer";

function validDate(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value; }
type Context = {params:Promise<{id:string}>};
export async function GET(req:NextRequest,{params}:Context) {
  if(!await requireAdmin()) return NextResponse.json({error:"Admin only."},{status:403});
  const {id}=await params;
  const user=await prisma.user.findUnique({where:{id}});
  if(!user || user.role!=="EMPLOYEE") return NextResponse.json({error:"Employee not found."},{status:404});
  const from=req.nextUrl.searchParams.get("from") || todayWorkDate();
  if(!validDate(from)) return NextResponse.json({error:"Invalid date."},{status:400});
  const days:Record<string,EditableDay>={};
  // Read each weekday using the policy effective on the chosen date, without
  // accidentally crossing a later version boundary while previewing the week.
  const version=(JSON.parse(user.scheduleHistoryJson || "[]") as ScheduleVersion[]).filter(v=>v.from<=from).sort((a,b)=>b.from.localeCompare(a.from))[0];
  for(let day=0;day<7;day++) {
    if(day===1) continue;
    const date=new Date(`${from}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate()+day-date.getUTCDay());
    const sample=date.toISOString().slice(0,10);
    const rule=version ? version.days[String(day)] : recurringRule({...user,scheduleHistoryJson:null,masterScheduleFrom:user.masterScheduleFrom && user.masterScheduleFrom<=from ? "0000-01-01" : null},sample);
    if(rule) days[String(day)]={...rule,paidBreak:rule.paidBreak ?? (["LACHIT","PANKAJ"].includes(user.employeeCode) ? 0 : user.employeeCode==="TOKI" && day===5 ? 30 : 60)};
  }
  return NextResponse.json({days,from,minDate:todayWorkDate(),revision:user.updatedAt.toISOString(),current:recurringDescription(user),versions:(JSON.parse(user.scheduleHistoryJson || "[]") as ScheduleVersion[]).map(v=>v.from).sort()});
}
export async function PUT(req:NextRequest,{params}:Context) {
  const admin=await requireAdmin();
  if(!admin) return NextResponse.json({error:"Admin only."},{status:403});
  const {id}=await params;
  let body; let days;
  try { body=await req.json(); days=validateSchedule(body.days); }
  catch(e) { return NextResponse.json({error:e instanceof Error ? e.message : "Invalid schedule."},{status:400}); }
  if(!validDate(body.from) || body.from<todayWorkDate()) return NextResponse.json({error:"Choose today or a later date. Past shifts cannot be changed."},{status:400});
  if(typeof body.revision!=="string" || isNaN(Date.parse(body.revision))) return NextResponse.json({error:"Reload the employee before saving."},{status:400});
  try {
    await prisma.$transaction(async tx=> {
      const user=await tx.user.findUnique({where:{id}});
      if(!user || user.role!=="EMPLOYEE") throw new Error("Employee not found.");
      if(await tx.attendanceRecord.count({where:{userId:id,workDate:{gte:body.from}}})) throw new Error("Attendance already exists from this date. Choose a later effective date.");
      if(await tx.arrivalAttempt.count({where:{userId:id,workDate:{gte:body.from}}})) throw new Error("An arrival attempt already exists from this date. Choose a later effective date.");
      if(await tx.staffRequest.count({where:{userId:id,kind:"GPS_CLOCK_IN",status:"PENDING",fromDate:{gte:body.from}}})) throw new Error("A clock-in verification request already exists from this date. Resolve it or choose a later effective date.");
      const history=JSON.parse(user.scheduleHistoryJson || "[]") as ScheduleVersion[];
      const next=[...history.filter(v=>v.from!==body.from),{from:body.from,days}].sort((a,b)=>a.from.localeCompare(b.from));
      const updated=await tx.user.updateMany({where:{id,updatedAt:new Date(body.revision)},data:{scheduleHistoryJson:JSON.stringify(next)}});
      if(!updated.count) throw new Error("Employee details changed. Reload before saving your shift changes.");
      await policyAudit(tx,admin,id,id,"SCHEDULE_UPDATED",history,next);
    });
    return NextResponse.json({ok:true});
  } catch(e) { return NextResponse.json({error:e instanceof Error ? e.message : "Could not save schedule."},{status:409}); }
}
