ALTER TABLE "AttendanceRecord" ADD COLUMN "lateClockOutCutoff" DATETIME;
ALTER TABLE "AttendanceRecord" ADD COLUMN "lateClockOutStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED';
