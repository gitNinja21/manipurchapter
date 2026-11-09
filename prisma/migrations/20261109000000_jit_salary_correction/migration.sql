-- Full-precision annualized rate. This changes past reports, not recorded punches.
ALTER TABLE "User" ADD COLUMN "standardShiftHours" INTEGER NOT NULL DEFAULT 9;

INSERT INTO "PolicyAudit" ("id","entityId","userId","actorId","actorName","action","beforeJson","afterJson")
SELECT 'jit-salary-20261109-' || "id", "id", "id", 'SYSTEM', 'Approved payroll correction',
'RETROSPECTIVE_SALARY_CORRECTION',
json_object('hourlyRateRs',"hourlyRateRs",'standardShiftHours',"standardShiftHours"),
json_object('monthlySalaryRs',16000,'hourlyRateRs',16000.0*12/365/10,'standardShiftHours',10,'paidBreakMinutes',60,'scope','All payroll history; recorded attendance unchanged')
FROM "User" WHERE upper(trim("employeeCode"))='JIT SINGH' AND "role"='EMPLOYEE';

UPDATE "User" SET "hourlyRateRs"=16000.0*12/365/10, "standardShiftHours"=10
WHERE upper(trim("employeeCode"))='JIT SINGH' AND "role"='EMPLOYEE';

-- Existing nine-hour confirmations cannot authorize a ten-hour week.
-- Retain their full contents in the audit and require employee resubmission.
INSERT INTO "PolicyAudit" ("id","entityId","userId","actorId","actorName","action","beforeJson","afterJson")
SELECT 'jit-week-reset-20261109-' || w."id", w."id", w."userId", 'SYSTEM', 'Approved payroll correction',
'WEEK_SCHEDULE_RECONFIRM_REQUIRED',
json_object('weekStart',w."weekStart",'daysJson',w."daysJson",'revision',w."revision"),
json_object('reason','Ten-hour paid shift; employee must resubmit weekly times')
FROM "EmployeeWeekSchedule" w JOIN "User" u ON u."id"=w."userId"
WHERE upper(trim(u."employeeCode"))='JIT SINGH' AND u."role"='EMPLOYEE'
AND w."weekStart">=date('now','+5 hours','+30 minutes','weekday 0','-6 days');

DELETE FROM "EmployeeWeekSchedule"
WHERE "userId" IN (SELECT "id" FROM "User" WHERE upper(trim("employeeCode"))='JIT SINGH' AND "role"='EMPLOYEE')
AND "weekStart">=date('now','+5 hours','+30 minutes','weekday 0','-6 days');
