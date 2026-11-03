ALTER TABLE "AttendanceSms" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'ARRIVAL';
DROP INDEX "AttendanceSms_userId_workDate_key";
CREATE UNIQUE INDEX "AttendanceSms_userId_workDate_kind_key" ON "AttendanceSms"("userId", "workDate", "kind");
