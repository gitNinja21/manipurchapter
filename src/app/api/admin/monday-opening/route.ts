import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { todayWorkDate } from "@/lib/time";
import { validRange } from "@/lib/reporting";
import { effectiveSchedule, policyAudit } from "@/lib/performanceServer";
import { isOpenMonday, scheduleVersion, type ScheduleVersion, type EditableDay } from "@/lib/scheduleVersions";

function validMonday(date:unknown):date is string {
 return typeof date==="string" && validRange(date,date) && new Date(`${date}T12:00:00Z`).getUTCDay()===1;
}
async function preview(db:Prisma.TransactionClient,date:string){
 const sunday=new Date(Date.parse(date)-86400000).toISOString().slice(0,10);
 const employees=await db.user.findMany({where:{role:"EMPLOYEE",active:true,approved:true},orderBy:{name:"asc"}});
 const rows=await Promise.all(employees.map(async user=>{
  const opened=isOpenMonday(user,date);
  const schedule=await effectiveSchedule(db,user,opened?date:sunday);
  const existing=opened?scheduleVersion(user,date)?.days["1"]:null;
  const rule:EditableDay|null=existing ?? (schedule?{
   start:Math.round((+schedule.arrivalStart-Date.parse(`${sunday}T00:00:00+05:30`))/60000),
   latest:Math.round((+schedule.start-Date.parse(`${sunday}T00:00:00+05:30`))/60000),
   duration:schedule.durationMinutes,unpaidBreak:schedule.breakMinutes,
   paidBreak:schedule.paidBreakMinutes ?? (["LACHIT","PANKAJ"].includes(user.employeeCode)?0:60),
  }:null);
  const [override,leave]=await Promise.all([
   db.scheduledShift.findUnique({where:{userId_workDate:{userId:user.id,workDate:date}}}),
   db.staffRequest.findFirst({where:{userId:user.id,kind:"LEAVE",status:"APPROVED",fromDate:{lte:date},toDate:{gte:date}}}),
  ]);
  return {id:user.id,name:user.name,revision:user.updatedAt.toISOString(),opened,rule,override:!!override,onLeave:!!leave};
 }));
 return {date,sunday,rows};
}
export async function GET(req:NextRequest){
 if(!await requireAdmin())return NextResponse.json({error:"Admin only."},{status:403});
 const date=req.nextUrl.searchParams.get("date");
 if(!validMonday(date))return NextResponse.json({error:"Choose a Monday."},{status:400});
 return NextResponse.json(await preview(prisma,date),{headers:{"Cache-Control":"no-store"}});
}
export async function POST(req:NextRequest){
 const admin=await requireAdmin();if(!admin)return NextResponse.json({error:"Admin only."},{status:403});
 let body;try{body=await req.json();}catch{return NextResponse.json({error:"Invalid request."},{status:400});}
 if(!body || !validMonday(body.date) || body.date<todayWorkDate())return NextResponse.json({error:"Choose today or a future Monday."},{status:400});
 try{
  const count=await prisma.$transaction(async tx=>{
   const current=await preview(tx,body.date);
   if(!current.rows.length)throw new Error("No active, approved employees to schedule.");
   if(JSON.stringify(current)!==body.preview)throw new Error("Schedules or employee details changed. Reload the preview before opening Monday.");
   // Retain the date's payroll meaning once any arrival or attendance exists.
   if(await tx.attendanceRecord.count({where:{workDate:body.date}}) || await tx.arrivalAttempt.count({where:{workDate:body.date}}) || await tx.staffRequest.count({where:{kind:"GPS_CLOCK_IN",status:"PENDING",fromDate:body.date}}))throw new Error("Attendance or an arrival request already exists on this date. Monday cannot be changed.");
   let changed=0;
   for(const row of current.rows){
    if(row.opened)continue;
    if(!row.rule)throw new Error(`${row.name} has no Sunday shift. Set their Sunday timing first.`);
    const user=await tx.user.findUniqueOrThrow({where:{id:row.id}});
    const history:ScheduleVersion[]=JSON.parse(user.scheduleHistoryJson || "[]");
    const next=[...history,{from:body.date,oneDay:true,days:{"1":row.rule}}];
    const result=await tx.user.updateMany({where:{id:row.id,updatedAt:new Date(row.revision)},data:{scheduleHistoryJson:JSON.stringify(next)}});
    if(!result.count)throw new Error("Employee details changed. Reload the preview.");
    await policyAudit(tx,admin,row.id,body.date,"MONDAY_OPENED",history,next);
    changed++;
   }
   return changed;
  },{timeout:20000});
  return NextResponse.json({ok:true,count});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Could not open Monday."},{status:409});}
}
