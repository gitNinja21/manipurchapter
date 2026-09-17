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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AttendanceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AttendanceRecord" ("clockInAt", "clockInFaceDistance", "clockInFaceMatch", "clockInGesture", "clockInPhoto", "clockOutAt", "clockOutFaceDistance", "clockOutFaceMatch", "clockOutGesture", "clockOutPhoto", "createdAt", "id", "updatedAt", "userId", "workDate") SELECT "clockInAt", "clockInFaceDistance", "clockInFaceMatch", "clockInGesture", "clockInPhoto", "clockOutAt", "clockOutFaceDistance", "clockOutFaceMatch", "clockOutGesture", "clockOutPhoto", "createdAt", "id", "updatedAt", "userId", "workDate" FROM "AttendanceRecord";
DROP TABLE "AttendanceRecord";
ALTER TABLE "new_AttendanceRecord" RENAME TO "AttendanceRecord";
CREATE INDEX "AttendanceRecord_userId_idx" ON "AttendanceRecord"("userId");
CREATE UNIQUE INDEX "AttendanceRecord_userId_workDate_key" ON "AttendanceRecord"("userId", "workDate");

-- Grandfather in every day that was already completed (clocked in AND out)
-- before this feature existed, so pre-existing hours/salary don't suddenly
-- vanish from the Overview until someone re-approves them one by one. Only
-- days completed from now on start at PENDING and need explicit approval.
UPDATE "AttendanceRecord" SET "approvalStatus" = 'APPROVED' WHERE "clockOutAt" IS NOT NULL;

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
