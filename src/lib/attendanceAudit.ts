import type { AttendanceRecord } from "@prisma/client";
export function auditData(
  record: AttendanceRecord,
  employee: { name: string; employeeCode: string },
  actor: { id: string; name: string },
  action: string,
  after: AttendanceRecord | null,
) {
  const snapshot = (r: AttendanceRecord) =>
    JSON.stringify({
      approvalStatus: r.approvalStatus,
      clockInAt: r.clockInAt,
      clockOutAt: r.clockOutAt,
      unpaidBreakMinutes: r.unpaidBreakMinutes,
      extraTimeCutoff: r.extraTimeCutoff,
      extraTimeStatus: r.extraTimeStatus,
      lateClockOutCutoff: r.lateClockOutCutoff,
      lateClockOutStatus: r.lateClockOutStatus,
      extraTimeReason: r.extraTimeReason,
      lateArrivalRequestId: r.lateArrivalRequestId,
      policyVersion: r.policyVersion,
      shiftDurationMinutes: r.shiftDurationMinutes,
      scheduledStartAt: r.scheduledStartAt,
      scheduledEndAt: r.scheduledEndAt,
      latePenaltyActive: r.latePenaltyActive,
      earlyPenaltyActive: r.earlyPenaltyActive,
      lateExcused: r.lateExcused,
      earlyExcused: r.earlyExcused,
    });
  return {
    recordId: record.id,
    userId: record.userId,
    employeeName: employee.name,
    employeeCode: employee.employeeCode,
    workDate: record.workDate,
    actorId: actor.id,
    actorName: actor.name,
    action,
    beforeJson: snapshot(record),
    afterJson: after ? snapshot(after) : null,
  };
}
