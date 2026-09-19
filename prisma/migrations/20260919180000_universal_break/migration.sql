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
    "unpaidBreakMinutes" INTEGER NOT NULL DEFAULT 60,
    "extraTimeCutoff" DATETIME,
    "extraTimeStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "extraTimeReason" TEXT,
    "lateArrivalRequestId" TEXT,
    "policyVersion" INTEGER NOT NULL DEFAULT 0,
    "scheduledStartAt" DATETIME,
    "scheduledEndAt" DATETIME,
    "latePenaltyActive" BOOLEAN NOT NULL DEFAULT false,
    "earlyPenaltyActive" BOOLEAN NOT NULL DEFAULT false,
    "lateExcused" BOOLEAN NOT NULL DEFAULT false,
    "earlyExcused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AttendanceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AttendanceRecord" ("approvalStatus", "clockInAt", "clockInFaceDistance", "clockInFaceMatch", "clockInGesture", "clockInPhoto", "clockOutAt", "clockOutFaceDistance", "clockOutFaceMatch", "clockOutGesture", "clockOutPhoto", "createdAt", "earlyExcused", "earlyPenaltyActive", "extraTimeCutoff", "extraTimeReason", "extraTimeStatus", "id", "lateArrivalRequestId", "lateExcused", "latePenaltyActive", "policyVersion", "scheduledEndAt", "scheduledStartAt", "unpaidBreakMinutes", "updatedAt", "userId", "workDate") SELECT "approvalStatus", "clockInAt", "clockInFaceDistance", "clockInFaceMatch", "clockInGesture", "clockInPhoto", "clockOutAt", "clockOutFaceDistance", "clockOutFaceMatch", "clockOutGesture", "clockOutPhoto", "createdAt", "earlyExcused", "earlyPenaltyActive", "extraTimeCutoff", "extraTimeReason", "extraTimeStatus", "id", "lateArrivalRequestId", "lateExcused", "latePenaltyActive", "policyVersion", "scheduledEndAt", "scheduledStartAt", "unpaidBreakMinutes", "updatedAt", "userId", "workDate" FROM "AttendanceRecord";
DROP TABLE "AttendanceRecord";
ALTER TABLE "new_AttendanceRecord" RENAME TO "AttendanceRecord";
CREATE INDEX "AttendanceRecord_userId_idx" ON "AttendanceRecord"("userId");
CREATE UNIQUE INDEX "AttendanceRecord_userId_workDate_key" ON "AttendanceRecord"("userId", "workDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- Existing zero-break records must use the same rule as new attendance.
-- Preserve decisions and clock times; calculations derive net work from the break.
INSERT INTO "AttendanceAudit" ("id", "recordId", "userId", "employeeName", "employeeCode", "workDate", "actorId", "actorName", "action", "beforeJson", "afterJson", "createdAt")
SELECT lower(hex(randomblob(16))), a."id", a."userId", u."name", u."employeeCode", a."workDate", 'SYSTEM', 'Attendance policy update', 'BREAK_POLICY_UPDATED',
json_object('approvalStatus', a."approvalStatus", 'clockInAt', CASE WHEN a."clockInAt" IS NULL THEN NULL WHEN typeof(a."clockInAt") IN ('integer', 'real') THEN strftime('%Y-%m-%dT%H:%M:%fZ', a."clockInAt" / 1000.0, 'unixepoch') ELSE a."clockInAt" END, 'clockOutAt', CASE WHEN a."clockOutAt" IS NULL THEN NULL WHEN typeof(a."clockOutAt") IN ('integer', 'real') THEN strftime('%Y-%m-%dT%H:%M:%fZ', a."clockOutAt" / 1000.0, 'unixepoch') ELSE a."clockOutAt" END, 'unpaidBreakMinutes', a."unpaidBreakMinutes", 'extraTimeCutoff', CASE WHEN a."extraTimeCutoff" IS NULL THEN NULL WHEN typeof(a."extraTimeCutoff") IN ('integer', 'real') THEN strftime('%Y-%m-%dT%H:%M:%fZ', a."extraTimeCutoff" / 1000.0, 'unixepoch') ELSE a."extraTimeCutoff" END, 'extraTimeStatus', a."extraTimeStatus"),
json_object('approvalStatus', a."approvalStatus", 'clockInAt', CASE WHEN a."clockInAt" IS NULL THEN NULL WHEN typeof(a."clockInAt") IN ('integer', 'real') THEN strftime('%Y-%m-%dT%H:%M:%fZ', a."clockInAt" / 1000.0, 'unixepoch') ELSE a."clockInAt" END, 'clockOutAt', CASE WHEN a."clockOutAt" IS NULL THEN NULL WHEN typeof(a."clockOutAt") IN ('integer', 'real') THEN strftime('%Y-%m-%dT%H:%M:%fZ', a."clockOutAt" / 1000.0, 'unixepoch') ELSE a."clockOutAt" END, 'unpaidBreakMinutes', 60, 'extraTimeCutoff', CASE WHEN a."extraTimeCutoff" IS NULL THEN NULL WHEN typeof(a."extraTimeCutoff") IN ('integer', 'real') THEN strftime('%Y-%m-%dT%H:%M:%fZ', a."extraTimeCutoff" / 1000.0, 'unixepoch') ELSE a."extraTimeCutoff" END, 'extraTimeStatus', a."extraTimeStatus", 'correctionReason', 'Applied the universal one-hour unpaid break to an existing zero-break record.'), CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM "AttendanceRecord" a JOIN "User" u ON u."id" = a."userId"
WHERE a."unpaidBreakMinutes" = 0;
UPDATE "AttendanceRecord" SET "unpaidBreakMinutes" = 60,
"updatedAt" = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
WHERE "unpaidBreakMinutes" = 0;
