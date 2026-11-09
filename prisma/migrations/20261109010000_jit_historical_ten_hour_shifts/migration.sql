-- Explicit retrospective correction: standardize Jit's historical payroll target.
-- Keep genuine punches and attendance/approval evidence. Archive old snapshots first.
CREATE TEMP TABLE jit_shift_correction AS
SELECT r."id", json_object('policyVersion',r."policyVersion",'scheduledStartAt',r."scheduledStartAt",'scheduledEndAt',r."scheduledEndAt",'shiftDurationMinutes',r."shiftDurationMinutes",'paidBreakMinutes',r."paidBreakMinutes",'unpaidBreakMinutes',r."unpaidBreakMinutes",'extraTimeCutoff',r."extraTimeCutoff",'extraTimeStatus',r."extraTimeStatus",'clockInAt',r."clockInAt",'clockOutAt',r."clockOutAt",'missingPunch',r."missingPunch",'missingPunchWaived',r."missingPunchWaived") AS beforeJson,
CASE WHEN typeof(coalesce(r."scheduledStartAt",r."clockInAt")) IN ('integer','real')
THEN coalesce(r."scheduledStartAt",r."clockInAt")
ELSE CAST(strftime('%s',coalesce(r."scheduledStartAt",r."clockInAt")) AS INTEGER)*1000 END AS startMs
FROM "AttendanceRecord" r JOIN "User" u ON u."id"=r."userId"
WHERE upper(trim(u."employeeCode"))='JIT SINGH' AND u."role"='EMPLOYEE'
AND r."workDate">='2026-10-01' AND coalesce(r."scheduledStartAt",r."clockInAt") IS NOT NULL;

UPDATE "AttendanceRecord" SET
"policyVersion"=3, "shiftDurationMinutes"=600, "paidBreakMinutes"=60, "unpaidBreakMinutes"=0,
"scheduledStartAt"=(SELECT startMs FROM jit_shift_correction WHERE id="AttendanceRecord"."id"),
"scheduledEndAt"=(SELECT startMs+36000000 FROM jit_shift_correction WHERE id="AttendanceRecord"."id"),
"extraTimeCutoff"=CASE
 WHEN "extraTimeStatus"='REJECTED' AND "extraTimeCutoff" IS NOT NULL AND "extraTimeCutoff" IS NOT "scheduledEndAt" THEN "extraTimeCutoff"
 ELSE (SELECT startMs+36000000 FROM jit_shift_correction WHERE id="AttendanceRecord"."id") END,
"clockOutAt"=CASE WHEN "missingPunch"='OUT' AND "missingPunchWaived"=0 AND "clockOutPhoto" IS NULL
 THEN max((SELECT startMs+36000000 FROM jit_shift_correction WHERE id="AttendanceRecord"."id"),coalesce("clockInAt",0))
 ELSE "clockOutAt" END,
"updatedAt"=CAST(strftime('%s','now') AS INTEGER)*1000
WHERE "id" IN (SELECT id FROM jit_shift_correction WHERE startMs IS NOT NULL);

INSERT INTO "AttendanceAudit" ("id","recordId","userId","employeeName","employeeCode","workDate","actorId","actorName","action","beforeJson","afterJson")
SELECT 'jit-ten-hour-20261109-' || r."id", r."id",r."userId",u."name",u."employeeCode",r."workDate",
'SYSTEM','Approved retrospective payroll correction','TEN_HOUR_SHIFT_CORRECTION',c.beforeJson,
json_object('policyVersion',r."policyVersion",'scheduledStartAt',r."scheduledStartAt",'scheduledEndAt',r."scheduledEndAt",'shiftDurationMinutes',r."shiftDurationMinutes",'paidBreakMinutes',r."paidBreakMinutes",'unpaidBreakMinutes',r."unpaidBreakMinutes",'extraTimeCutoff',r."extraTimeCutoff",'extraTimeStatus',r."extraTimeStatus",'clockInAt',r."clockInAt",'clockOutAt',r."clockOutAt",'missingPunch',r."missingPunch",'missingPunchWaived',r."missingPunchWaived")
FROM jit_shift_correction c JOIN "AttendanceRecord" r ON r."id"=c.id JOIN "User" u ON u."id"=r."userId"
WHERE c.startMs IS NOT NULL;
DROP TABLE jit_shift_correction;
