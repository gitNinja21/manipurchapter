ALTER TABLE "User" ADD COLUMN "flexibleNineHours" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "AdminClockOutDay" (
"workDate" TEXT NOT NULL PRIMARY KEY, "enabled" BOOLEAN NOT NULL DEFAULT false,
"cutoffAt" DATETIME NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1,
"updatedById" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL);

-- Exact known employee codes, including the aliases in supplied payrolls.
CREATE TEMP TABLE flexible_staff AS SELECT "id" FROM "User" WHERE "role"='EMPLOYEE'
AND upper(trim("employeeCode")) IN ('GOKUL','KONG GOKUL','HINGNAM 700','HINGNAMBE NEWME');
INSERT INTO "PolicyAudit" ("id","entityId","userId","actorId","actorName","action","beforeJson","afterJson")
SELECT 'flex-nine-20261110-'||"id","id","id",'SYSTEM','Approved flexible attendance correction','FLEXIBLE_NINE_HOURS',
json_object('flexibleNineHours',"flexibleNineHours",'standardShiftHours',"standardShiftHours"),
json_object('flexibleNineHours',1,'standardShiftHours',9,'bonusBefore','09:30','bonusAfter','22:30')
FROM "User" WHERE "id" IN (SELECT id FROM flexible_staff);
UPDATE "User" SET "flexibleNineHours"=true,"standardShiftHours"=9 WHERE "id" IN (SELECT id FROM flexible_staff);
INSERT INTO "AttendanceAudit" ("id","recordId","userId","employeeName","employeeCode","workDate","actorId","actorName","action","beforeJson","afterJson")
SELECT 'flex-nine-20261110-'||r.id,r.id,r.userId,u.name,u.employeeCode,r.workDate,'SYSTEM','Approved flexible attendance correction','FLEXIBLE_NINE_HOURS',
json_object('policyVersion',r.policyVersion,'scheduledStartAt',r.scheduledStartAt,'scheduledEndAt',r.scheduledEndAt,'shiftDurationMinutes',r.shiftDurationMinutes,'paidBreakMinutes',r.paidBreakMinutes,'unpaidBreakMinutes',r.unpaidBreakMinutes,'extraTimeCutoff',r.extraTimeCutoff),
json_object('policyVersion',5,'regularCapHours',9,'bonusBefore','09:30','bonusAfter','22:30','actualPunchesPreserved',1)
FROM "AttendanceRecord" r JOIN "User" u ON u.id=r.userId
WHERE r.userId IN (SELECT id FROM flexible_staff) AND r.workDate>='2026-10-01';
UPDATE "AttendanceRecord" SET "policyVersion"=5,"shiftDurationMinutes"=780,"paidBreakMinutes"=60,"unpaidBreakMinutes"=0,
"scheduledStartAt"=CAST(strftime('%s',"workDate"||'T09:30:00+05:30') AS INTEGER)*1000,
"scheduledEndAt"=CAST(strftime('%s',"workDate"||'T22:30:00+05:30') AS INTEGER)*1000,
"extraTimeCutoff"=CASE WHEN "extraTimeStatus"='REJECTED' THEN "extraTimeCutoff" ELSE NULL END,
"updatedAt"=CAST(strftime('%s','now') AS INTEGER)*1000
WHERE "userId" IN (SELECT id FROM flexible_staff) AND "workDate">='2026-10-01';
DROP TABLE flexible_staff;
