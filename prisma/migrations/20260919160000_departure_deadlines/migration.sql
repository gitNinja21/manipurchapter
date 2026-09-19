-- Use the beginning of each employee's normal departure window. Existing
-- attendance has its own schedule snapshot and is not changed by this rollout.
UPDATE "User" SET "attendanceEndMinute" = 1140
WHERE "employeeCode" = 'NIJULI' AND "role" = 'EMPLOYEE'
  AND "attendancePolicyFrom" IS NOT NULL AND "attendanceEndMinute" = 1350;
UPDATE "User" SET "attendanceEndMinute" = 1200
WHERE "employeeCode" = 'RONYAMZ' AND "role" = 'EMPLOYEE'
  AND "attendancePolicyFrom" IS NOT NULL AND "attendanceEndMinute" = 1350;
