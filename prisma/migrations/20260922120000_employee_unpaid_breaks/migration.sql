ALTER TABLE "User" ADD COLUMN "unpaidBreakFrom" TEXT;
ALTER TABLE "User" ADD COLUMN "scheduledUnpaidBreakMinutes" INTEGER;
UPDATE "User" SET "unpaidBreakFrom" = '2026-09-23', "scheduledUnpaidBreakMinutes" = 150
WHERE "role" = 'EMPLOYEE' AND ("id" IN ('cmu5dihu2000a95shpwsbfh0j', 'cmu5dgdgf000995sh4n7sv3cz') OR "employeeCode" IN ('GOKUL', 'HINGNAMBE NEWME'));
-- Earlier attendance snapshots and payroll remain unchanged.
