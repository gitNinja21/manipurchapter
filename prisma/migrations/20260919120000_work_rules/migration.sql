-- AlterTable
ALTER TABLE "User" ADD COLUMN "attendancePolicyFrom" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AttendanceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workDate" TEXT NOT NULL,
    "clockInAt" DATETIME,
    "clockInPhoto" TEXT,
    "clockInGesture" TEXT,
    "clockInFaceMatch" BOOLEAN,
    "clockInFaceDistance" REAL,
    "clockOutAt" DATETIME,
    "clockOutPhoto" TEXT,
    "clockOutGesture" TEXT,
    "clockOutFaceMatch" BOOLEAN,
    "clockOutFaceDistance" REAL,
    "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "unpaidBreakMinutes" INTEGER NOT NULL DEFAULT 0,
    "extraTimeCutoff" DATETIME,
    "extraTimeStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "extraTimeReason" TEXT,
    "lateArrivalRequestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AttendanceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AttendanceRecord" ("approvalStatus", "clockInAt", "clockInFaceDistance", "clockInFaceMatch", "clockInGesture", "clockInPhoto", "clockOutAt", "clockOutFaceDistance", "clockOutFaceMatch", "clockOutGesture", "clockOutPhoto", "createdAt", "id", "updatedAt", "userId", "workDate") SELECT "approvalStatus", "clockInAt", "clockInFaceDistance", "clockInFaceMatch", "clockInGesture", "clockInPhoto", "clockOutAt", "clockOutFaceDistance", "clockOutFaceMatch", "clockOutGesture", "clockOutPhoto", "createdAt", "id", "updatedAt", "userId", "workDate" FROM "AttendanceRecord";
DROP TABLE "AttendanceRecord";
ALTER TABLE "new_AttendanceRecord" RENAME TO "AttendanceRecord";
CREATE INDEX "AttendanceRecord_userId_idx" ON "AttendanceRecord"("userId");
CREATE UNIQUE INDEX "AttendanceRecord_userId_workDate_key" ON "AttendanceRecord"("userId", "workDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- Activate only the four existing login IDs supplied for this rollout.
-- Existing attendance snapshots stay unchanged.
UPDATE "User" SET "attendancePolicyFrom" = '2026-09-19'
WHERE "role" = 'EMPLOYEE' AND "employeeCode" IN ('GOKUL', 'RONYAMZ', 'NIJULI', 'HINGNAMBE NEWME');
