-- Retrospective rate correction: INR 394.50 for Hingnam's nine-hour paid day.
-- Keep full precision; reports round monetary totals, not the stored hourly rate.
INSERT INTO "PolicyAudit" ("id","entityId","userId","actorId","actorName","action","beforeJson","afterJson")
SELECT 'hingnam-rate-20261110-' || "id","id","id",'SYSTEM','Approved payroll correction',
'RETROSPECTIVE_SALARY_CORRECTION',
json_object('hourlyRateRs',"hourlyRateRs",'standardShiftHours',"standardShiftHours"),
json_object('dailyRateRs',394.5,'hourlyRateRs',394.5/9.0,'standardShiftHours',9,'scope','All payroll history; attendance unchanged')
FROM "User" WHERE "role"='EMPLOYEE' AND upper(trim("employeeCode")) IN ('HINGNAMBE NEWME','HINGNAM 700');

UPDATE "User" SET "hourlyRateRs"=394.5/9.0,"standardShiftHours"=9,
"updatedAt"=CAST(strftime('%s','now') AS INTEGER)*1000
WHERE "role"='EMPLOYEE' AND upper(trim("employeeCode")) IN ('HINGNAMBE NEWME','HINGNAM 700');
