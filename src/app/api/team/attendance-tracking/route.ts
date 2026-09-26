import { usesMasterPolicy } from "@/lib/masterPolicy";
import { prisma } from "@/lib/prisma";
import { adminOnly, teamRoute, TeamError } from "@/lib/team";
import { syncMeetings } from "@/lib/performanceServer";
import { attendanceStreaks } from "@/lib/attendanceStreaks";
import { deviations } from "@/lib/performance";
import { recurringRule, policyApplies } from "@/lib/workPolicy";
import { validRange } from "@/lib/reporting";
import { todayWorkDate, workDateFor } from "@/lib/time";
export const GET = teamRoute(async (u,req)=>{
  adminOnly(u);
  const today=todayWorkDate(),from=req.nextUrl.searchParams.get("from") || `${today.slice(0,7)}-01`,to=req.nextUrl.searchParams.get("to") || today;
  if(!validRange(from,to) || to>today || Date.parse(to)-Date.parse(from)>92*86400000) throw new TeamError("Choose up to 93 days, ending today or earlier.");
  const employees=await prisma.user.findMany({where:{role:"EMPLOYEE",approved:true},orderBy:{name:"asc"},select:{
    id:true,name:true,employeeCode:true,active:true,createdAt:true,
    attendancePolicyFrom:true,unpaidBreakFrom:true,scheduledUnpaidBreakMinutes:true,masterScheduleFrom:true,masterScheduleJson:true,weeklyScheduleJson:true,attendanceStartMinute:true,attendanceLatestMinute:true,
  }});
  for(const employee of employees) await prisma.$transaction(tx=>syncMeetings(tx,employee.id,today));
  const ids=employees.map(e=>e.id);
  const [records,leave,shifts,meetings,arrivals]=await Promise.all([
    prisma.attendanceRecord.findMany({where:{userId:{in:ids},workDate:{lte:to},policyVersion:{in:[1,2,3]}},orderBy:{workDate:"asc"},select:{
      id:true,userId:true,workDate:true,clockInAt:true,clockOutAt:true,scheduledStartAt:true,scheduledEndAt:true,policyVersion:true,
      shiftDurationMinutes:true,approvalStatus:true,lateExcused:true,earlyExcused:true,latePenaltyActive:true,earlyPenaltyActive:true,
    }}),
    prisma.staffRequest.findMany({where:{userId:{in:ids},kind:"LEAVE",status:"APPROVED",fromDate:{lte:to}},select:{userId:true,fromDate:true,toDate:true}}),
    prisma.scheduledShift.findMany({where:{userId:{in:ids},workDate:{lte:to}},select:{userId:true,workDate:true,startsAt:true}}),
    prisma.managerMeeting.findMany({where:{userId:{in:ids}},orderBy:{triggerDate:"desc"},select:{id:true,userId:true,kind:true,status:true,triggerDate:true,clearedDate:true}}),
    prisma.arrivalAttempt.findMany({where:{userId:{in:ids},workDate:{gte:from,lte:to}},select:{userId:true,workDate:true,arrivedAt:true}}),
  ]);
  const rows=employees.flatMap(employee=>{
    const history=records.filter(r=>r.userId===employee.id),employeeShifts=shifts.filter(s=>s.userId===employee.id);
    const byDate=new Map(history.map(r=>[r.workDate,r]));
    const employeeFrom=[from,workDateFor(employee.createdAt)].sort().at(-1)!;
    const {days}=attendanceStreaks({user:employee,records:history,leave:leave.filter(l=>l.userId===employee.id),shifts:employeeShifts,
      meetings:meetings.filter(m=>m.userId===employee.id),from:employeeFrom,to,today});
    return days.map(day=>{
      const record=byDate.get(day.date),rule=recurringRule(employee,day.date);
      const shift=employeeShifts.find(s=>s.workDate===day.date);
      const arrival=arrivals.find(a=>a.userId===employee.id && a.workDate===day.date);
      const actual=record ? deviations({...record,lateExcused:false,earlyExcused:false}) : {lateMs:0,earlyMs:0};
      const expected=record?.scheduledStartAt ?? shift?.startsAt ?? (day.eligible && policyApplies(employee,day.date) && rule ? new Date(+new Date(`${day.date}T00:00:00+05:30`)+rule.latest*60000) : null);
      return {...day,userId:employee.id,recordId:record?.id ?? null,
        lateMinutes:actual.lateMs/60000,earlyMinutes:actual.earlyMs/60000,
        lateIncident:day.eligible && record?.approvalStatus!=="REJECTED" && day.lateMs>(record?.policyVersion===3 ? 0 : 15*60000),
        earlyIncident:day.eligible && record?.approvalStatus!=="REJECTED" && day.earlyMs>0,
        lateExcused:record?.lateExcused ?? false,earlyExcused:record?.earlyExcused ?? false,
        penaltyActive:record?.latePenaltyActive || record?.earlyPenaltyActive || false,
        clockInAt:record?.clockInAt ?? null,clockOutAt:record?.clockOutAt ?? null,
        expectedStartAt:expected,requiredEndAt:record?.scheduledEndAt ?? null,arrivalAt:arrival?.arrivedAt ?? null,
        status:record?.approvalStatus==="REJECTED" ? "Excluded" : day.onLeave ? "Approved leave" : !day.eligible ? "Off / untracked day" :
          record?.clockOutAt ? "Completed" : record?.clockInAt ? (day.date===today ? "Clocked in" : "Missing clock-out") :
          arrival ? "Awaiting manager clearance" : day.date===today ? "Not clocked in yet" : "Missed clock-in",
      };
    });
  }).sort((a,b)=>b.date.localeCompare(a.date) || employees.find(e=>e.id===a.userId)!.name.localeCompare(employees.find(e=>e.id===b.userId)!.name));
  return {from,to,today,employees:employees.map(({id,name,employeeCode,active})=>({id,name,employeeCode,active})),rows,
    pendingMeetings:usesMasterPolicy(today) ? [] : meetings.filter(m=>m.status==="PENDING")};
});
