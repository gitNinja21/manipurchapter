-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AnnouncementCall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "attemptKey" TEXT,
    "callSid" TEXT,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" DATETIME,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AnnouncementCall_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnnouncementCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AnnouncementCall" ("acknowledgedAt", "announcementId", "attemptKey", "attempts", "callSid", "createdAt", "error", "id", "nextAttemptAt", "phone", "status", "updatedAt", "userId") SELECT "acknowledgedAt", "announcementId", "attemptKey", "attempts", "callSid", "createdAt", "error", "id", "nextAttemptAt", "phone", "status", "updatedAt", "userId" FROM "AnnouncementCall";
DROP TABLE "AnnouncementCall";
ALTER TABLE "new_AnnouncementCall" RENAME TO "AnnouncementCall";
CREATE UNIQUE INDEX "AnnouncementCall_attemptKey_key" ON "AnnouncementCall"("attemptKey");
CREATE UNIQUE INDEX "AnnouncementCall_callSid_key" ON "AnnouncementCall"("callSid");
CREATE INDEX "AnnouncementCall_status_nextAttemptAt_idx" ON "AnnouncementCall"("status", "nextAttemptAt");
CREATE UNIQUE INDEX "AnnouncementCall_announcementId_userId_key" ON "AnnouncementCall"("announcementId", "userId");
CREATE TABLE "new_AnnouncementSms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "messageSid" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AnnouncementSms_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnnouncementSms_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AnnouncementSms" ("announcementId", "createdAt", "error", "id", "messageSid", "phone", "status", "updatedAt", "userId") SELECT "announcementId", "createdAt", "error", "id", "messageSid", "phone", "status", "updatedAt", "userId" FROM "AnnouncementSms";
DROP TABLE "AnnouncementSms";
ALTER TABLE "new_AnnouncementSms" RENAME TO "AnnouncementSms";
CREATE UNIQUE INDEX "AnnouncementSms_messageSid_key" ON "AnnouncementSms"("messageSid");
CREATE INDEX "AnnouncementSms_status_createdAt_idx" ON "AnnouncementSms"("status", "createdAt");
CREATE UNIQUE INDEX "AnnouncementSms_announcementId_userId_key" ON "AnnouncementSms"("announcementId", "userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

