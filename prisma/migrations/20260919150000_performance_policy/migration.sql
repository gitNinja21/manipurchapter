-- CreateTable
CREATE TABLE "ManagerMeeting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "triggerDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "clearedDate" TEXT,
    "reviewedAt" DATETIME,
    "reviewedBy" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManagerMeeting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArrivalAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workDate" TEXT NOT NULL,
    "arrivedAt" DATETIME NOT NULL,
    "photo" TEXT NOT NULL,
    "latitude" REAL,
    "longitude" REAL,
    "proposedAt" DATETIME,
    "reason" TEXT,
    "approvedAt" DATETIME,
    "approvedBy" TEXT,
    CONSTRAINT "ArrivalAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReferralClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "billDate" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "billKey" TEXT NOT NULL,
    "partyReference" TEXT NOT NULL,
    "approvedPartyKey" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PolicyAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeJson" TEXT NOT NULL,
    "afterJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
INSERT INTO "new_AttendanceRecord" ("approvalStatus", "clockInAt", "clockInFaceDistance", "clockInFaceMatch", "clockInGesture", "clockInPhoto", "clockOutAt", "clockOutFaceDistance", "clockOutFaceMatch", "clockOutGesture", "clockOutPhoto", "createdAt", "extraTimeCutoff", "extraTimeReason", "extraTimeStatus", "id", "lateArrivalRequestId", "unpaidBreakMinutes", "updatedAt", "userId", "workDate") SELECT "approvalStatus", "clockInAt", "clockInFaceDistance", "clockInFaceMatch", "clockInGesture", "clockInPhoto", "clockOutAt", "clockOutFaceDistance", "clockOutFaceMatch", "clockOutGesture", "clockOutPhoto", "createdAt", "extraTimeCutoff", "extraTimeReason", "extraTimeStatus", "id", "lateArrivalRequestId", "unpaidBreakMinutes", "updatedAt", "userId", "workDate" FROM "AttendanceRecord";
DROP TABLE "AttendanceRecord";
ALTER TABLE "new_AttendanceRecord" RENAME TO "AttendanceRecord";
CREATE INDEX "AttendanceRecord_userId_idx" ON "AttendanceRecord"("userId");
CREATE UNIQUE INDEX "AttendanceRecord_userId_workDate_key" ON "AttendanceRecord"("userId", "workDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ManagerMeeting_userId_status_idx" ON "ManagerMeeting"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerMeeting_userId_kind_triggerDate_key" ON "ManagerMeeting"("userId", "kind", "triggerDate");

-- CreateIndex
CREATE UNIQUE INDEX "ArrivalAttempt_userId_workDate_key" ON "ArrivalAttempt"("userId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralClaim_billKey_key" ON "ReferralClaim"("billKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralClaim_approvedPartyKey_key" ON "ReferralClaim"("approvedPartyKey");

-- CreateIndex
CREATE INDEX "ReferralClaim_userId_billDate_idx" ON "ReferralClaim"("userId", "billDate");

-- CreateIndex
CREATE INDEX "PolicyAudit_userId_createdAt_idx" ON "PolicyAudit"("userId", "createdAt");

