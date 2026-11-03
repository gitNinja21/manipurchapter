import {weeklyApplies} from "@/lib/weeklySchedulePolicy";
import {missingClockInContext} from "./missingPunchServer";
import {requireSubmittedWeek} from "./weeklyScheduleServer";
import { workDayMode } from "./workDays";
import { scheduleVersion } from "@/lib/scheduleVersions";
import type { Prisma, User, StaffRequest } from "@prisma/client";
import { TeamError, notify } from "./team";
import { effectiveSchedule, syncMeetings, penaltyContext } from "./performanceServer";
import { durationSnapshot } from "./performance";
import { lateClockOutRule } from "./attendanceTime";
import { auditData } from "./attendanceAudit";

export async function checkFallbackIn(tx: Prisma.TransactionClient, user: User, date: string, at: Date) {
  await requireSubmittedWeek(tx,user.id,date);
  if(await workDayMode(tx,date)==="PAID_OFF")throw new TeamError("The restaurant is closed on this date.",409);
  const schedule = await effectiveSchedule(tx,user,date);
  if ((weeklyApplies(date) || scheduleVersion(user,date) || user.weeklyScheduleJson || user.masterScheduleJson) && !schedule) throw new TeamError("Ask your manager to assign your shift first.",409);
  if (schedule && at < schedule.opens) throw new TeamError("Your shift has not opened. Request a shift change first.",409);
  if (await tx.staffRequest.findFirst({where:{userId:user.id,kind:"LEAVE",status:"APPROVED",fromDate:{lte:date},toDate:{gte:date}}})) throw new TeamError("Approved leave must be resolved first.",409);
  if (await tx.attendanceRecord.findFirst({where:{userId:user.id,OR:[{clockInAt:{not:null},clockOutAt:null},{workDate:date,clockInAt:{not:null}}]}})) throw new TeamError("Attendance already exists. Refresh or request a correction.",409);
  return schedule;
}
export async function approveLocationFallback(tx: Prisma.TransactionClient, request: StaffRequest, actor: User) {
  if (actor.role !== "ADMIN") throw new TeamError("Admin only.",403);
  const user = await tx.user.findUniqueOrThrow({where:{id:request.userId}});
  if (!user.active || !user.approved || user.mustChangePassword) throw new TeamError("Employee is not eligible.",409);
  if (!request.verificationPhoto || request.verificationDistance === null) throw new TeamError("Verified selfie is missing.",409);
  const before = await tx.attendanceRecord.findUnique({where:{userId_workDate:{userId:user.id,workDate:request.fromDate}}});
  const onlyInferredIn = request.kind==="GPS_CLOCK_IN" && before?.missingPunch==="IN" && !before.missingPunchWaived && request.expectedRecordId===null && !before.clockInPhoto && before.policyVersion===3 && !!before.clockOutAt && !!request.proposedIn && request.proposedIn<before.clockOutAt;
  const onlyInferredOut = request.kind==="GPS_CLOCK_OUT" && before?.missingPunch==="OUT" && !before.missingPunchWaived && before.id===request.expectedRecordId && before.clockInAt?.getTime()===request.proposedIn?.getTime() && !before.clockOutPhoto && before.policyVersion!==4;
  if (!onlyInferredOut && !onlyInferredIn && ((before?.id ?? null) !== request.expectedRecordId || (before?.updatedAt?.getTime() ?? null) !== (request.expectedUpdatedAt?.getTime() ?? null))) throw new TeamError("Attendance changed. Reject this request and review the current attendance.",409);
  let after;
  if (request.kind === "GPS_CLOCK_IN") {
    const at = request.proposedIn!;
    const schedule = onlyInferredIn ? await effectiveSchedule(tx,user,request.fromDate) : await checkFallbackIn(tx,user,request.fromDate,at);
    if(onlyInferredIn && (!schedule || await tx.staffRequest.findFirst({where:{userId:user.id,kind:"LEAVE",status:"APPROVED",fromDate:{lte:request.fromDate},toDate:{gte:request.fromDate}}})))throw new TeamError("The date or leave status changed. Use an attendance correction.",409);
    if ((await syncMeetings(tx,user.id)).length) throw new TeamError("Complete the pending manager meeting under Performance → Manager clearance first, then approve this request.",409);
    const arrival = await tx.arrivalAttempt.findUnique({where:{userId_workDate:{userId:user.id,workDate:request.fromDate}}});
    const clockInAt = arrival?.approvedAt ?? at;
    const exception = await tx.staffRequest.findFirst({where:{userId:user.id,kind:"LATE_ARRIVAL",status:"APPROVED",fromDate:request.fromDate}});
    const values = {...(onlyInferredIn ? {missingPunch:"NONE",missingPunchWaived:false} : {}),clockInAt,...durationSnapshot(clockInAt,schedule),...await penaltyContext(tx,user.id,request.fromDate),lateExcused:!!exception,lateArrivalRequestId:exception?.id ?? null,clockInPhoto:request.verificationPhoto,clockInFaceMatch:true,clockInFaceDistance:request.verificationDistance,extraTimeStatus:"NOT_REQUIRED",approvalStatus:"PENDING"};
    after = await tx.attendanceRecord.upsert({where:{userId_workDate:{userId:user.id,workDate:request.fromDate}},create:{userId:user.id,workDate:request.fromDate,...values},update:values});
  } else {
    const at = request.proposedOut!;
    let base=before;
    if(!base){
      const schedule=await missingClockInContext(tx,user,request.fromDate,at);
      base=await tx.attendanceRecord.create({data:{userId:user.id,workDate:request.fromDate,clockInAt:schedule.start,...durationSnapshot(schedule.start,schedule),missingPunch:"IN"}});
    }
    if (!base.clockInAt || (base.clockOutAt && !onlyInferredOut) || at <= base.clockInAt || +at - +base.clockInAt > 86400000) throw new TeamError("The open shift changed or is over 24 hours. Use an attendance correction.",409);
    const exception = await tx.staffRequest.findFirst({where:{userId:user.id,kind:"EARLY_DEPARTURE",status:"APPROVED",fromDate:request.fromDate}});
    after = await tx.attendanceRecord.update({where:{id:base.id},data:{missingPunch:onlyInferredOut?"NONE":base.missingPunch,clockOutAt:at,clockOutPhoto:request.verificationPhoto,clockOutFaceMatch:true,clockOutFaceDistance:request.verificationDistance,earlyExcused:base.earlyExcused || !!exception,extraTimeStatus:base.extraTimeCutoff && at > base.extraTimeCutoff ? "AUTOMATIC":"NOT_REQUIRED",...lateClockOutRule(request.fromDate,at,base.policyVersion===4)}});
    if (after.lateClockOutStatus === "PENDING") {
      const late = await tx.staffRequest.create({data:{userId:user.id,kind:"LATE_CLOCK_OUT",fromDate:request.fromDate,toDate:request.fromDate,reason:"GPS fallback clock-out after 10:45 pm. Late time needs separate approval.",proposedIn:base.clockInAt,proposedOut:at,expectedRecordId:after.id,expectedUpdatedAt:after.updatedAt}});
      await notify(tx,await tx.user.findMany({where:{role:"ADMIN",active:true},select:{id:true,role:true}}),"REQUEST",late.id,`${user.name}: late clock-out needs approval`,"team?view=requests");
    }
  }
  if (before) await tx.attendanceAudit.create({data:auditData(before,user,actor,"GPS_FALLBACK_APPROVED",after)});
  else await tx.attendanceAudit.create({data:{recordId:after.id,userId:user.id,employeeName:user.name,employeeCode:user.employeeCode,workDate:request.fromDate,actorId:actor.id,actorName:actor.name,action:"GPS_FALLBACK_APPROVED",beforeJson:"null",afterJson:JSON.stringify({clockInAt:after.clockInAt,clockOutAt:after.clockOutAt,missingPunch:after.missingPunch,requestId:request.id})}});
}
