ALTER TABLE "AttendanceRecord" ADD COLUMN "missingPunch" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "AttendanceRecord" ADD COLUMN "missingPunchWaived" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "EmployeeWeekSchedule" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "weekStart" TEXT NOT NULL,
 "daysJson" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1,
 "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "EmployeeWeekSchedule_userId_weekStart_key" ON "EmployeeWeekSchedule"("userId", "weekStart");
