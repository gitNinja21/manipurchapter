-- Retrospective rate correction: INR 394.5 for Chetan's nine-hour paid day.
-- Keep full precision; reports round monetary totals, not the stored hourly rate.
INSERT INTO "PolicyAudit" ("id","entityId","userId","actorId","actorName","action","beforeJson","afterJson")
SELECT 'chetan-rate-20261110-' || "id","id","id",'SYSTEM','Approved payroll correction',
'RETROSPECTIVE_SALARY_CORRECTION',
json_object('hourlyRateRs',"hourlyRateRs",'standardShiftHours',"standardShiftHours"),
json_object('dailyRateRs',394.5,'hourlyRateRs',394.5/9.0,'standardShiftHours',9,'scope','All payroll history; attendance unchanged')
FROM "User" WHERE "role"='EMPLOYEE' AND upper(trim("employeeCode")) IN ('RCHETAN');

UPDATE "User" SET "hourlyRateRs"=394.5/9.0,"standardShiftHours"=9,
"updatedAt"=CAST(strftime('%s','now') AS INTEGER)*1000
WHERE "role"='EMPLOYEE' AND upper(trim("employeeCode")) IN ('RCHETAN');

-- Retrospective rate correction: INR 460.27 for Nijuli's nine-hour paid day.
-- Keep full precision; reports round monetary totals, not the stored hourly rate.
INSERT INTO "PolicyAudit" ("id","entityId","userId","actorId","actorName","action","beforeJson","afterJson")
SELECT 'nijuli-rate-20261110-' || "id","id","id",'SYSTEM','Approved payroll correction',
'RETROSPECTIVE_SALARY_CORRECTION',
json_object('hourlyRateRs',"hourlyRateRs",'standardShiftHours',"standardShiftHours"),
json_object('dailyRateRs',460.27,'hourlyRateRs',460.27/9.0,'standardShiftHours',9,'scope','All payroll history; attendance unchanged')
FROM "User" WHERE "role"='EMPLOYEE' AND upper(trim("employeeCode")) IN ('NIJULI');

UPDATE "User" SET "hourlyRateRs"=460.27/9.0,"standardShiftHours"=9,
"updatedAt"=CAST(strftime('%s','now') AS INTEGER)*1000
WHERE "role"='EMPLOYEE' AND upper(trim("employeeCode")) IN ('NIJULI');

-- Retrospective rate correction: INR 394.52 for Sushma's nine-hour paid day.
-- Keep full precision; reports round monetary totals, not the stored hourly rate.
INSERT INTO "PolicyAudit" ("id","entityId","userId","actorId","actorName","action","beforeJson","afterJson")
SELECT 'sushma-rate-20261110-' || "id","id","id",'SYSTEM','Approved payroll correction',
'RETROSPECTIVE_SALARY_CORRECTION',
json_object('hourlyRateRs',"hourlyRateRs",'standardShiftHours',"standardShiftHours"),
json_object('dailyRateRs',394.52,'hourlyRateRs',394.52/9.0,'standardShiftHours',9,'scope','All payroll history; attendance unchanged')
FROM "User" WHERE "role"='EMPLOYEE' AND upper(trim("employeeCode")) IN ('SUSHMA SINGHA');

UPDATE "User" SET "hourlyRateRs"=394.52/9.0,"standardShiftHours"=9,
"updatedAt"=CAST(strftime('%s','now') AS INTEGER)*1000
WHERE "role"='EMPLOYEE' AND upper(trim("employeeCode")) IN ('SUSHMA SINGHA');
