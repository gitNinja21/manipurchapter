-- Reset legacy flexible overrides from the agreed policy start date only.
-- Preserve historical payroll, attendance, and explicit paid closures.
INSERT INTO "PolicyAudit" ("id", "entityId", "userId", "actorId", "actorName", "action", "beforeJson", "afterJson", "createdAt")
SELECT 'restore-normal-' || "workDate", "workDate", 'ALL_EMPLOYEES', 'SYSTEM', 'Schedule policy migration', 'WORK_DAY_RESTORE_NORMAL',
json_object('workDate', "workDate", 'mode', "mode", 'revision', "revision"), 'null', CURRENT_TIMESTAMP
FROM "WorkDayOverride" WHERE "mode" = 'HOURLY' AND "workDate" >= '2026-10-23';
DELETE FROM "WorkDayOverride" WHERE "mode" = 'HOURLY' AND "workDate" >= '2026-10-23';
