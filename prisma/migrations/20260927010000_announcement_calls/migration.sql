CREATE TABLE "AnnouncementCall" (
"id" TEXT NOT NULL PRIMARY KEY, "announcementId" TEXT NOT NULL, "userId" TEXT NOT NULL, "phone" TEXT,
"status" TEXT NOT NULL DEFAULT 'QUEUED', "attempts" INTEGER NOT NULL DEFAULT 0, "attemptKey" TEXT, "callSid" TEXT,
"nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "acknowledgedAt" DATETIME, "error" TEXT,
"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE,
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE UNIQUE INDEX "AnnouncementCall_announcementId_userId_key" ON "AnnouncementCall"("announcementId","userId");
CREATE UNIQUE INDEX "AnnouncementCall_attemptKey_key" ON "AnnouncementCall"("attemptKey");
CREATE UNIQUE INDEX "AnnouncementCall_callSid_key" ON "AnnouncementCall"("callSid");
CREATE INDEX "AnnouncementCall_status_nextAttemptAt_idx" ON "AnnouncementCall"("status","nextAttemptAt");
