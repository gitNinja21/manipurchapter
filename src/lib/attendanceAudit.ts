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
