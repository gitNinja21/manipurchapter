ALTER TABLE "Announcement" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'LEGACY_ALL';
ALTER TABLE "Announcement" ADD COLUMN "sendSms" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Announcement" ADD COLUMN "sendCall" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "AnnouncementRecipient" (
 "announcementId" TEXT NOT NULL, "userId" TEXT NOT NULL,
 PRIMARY KEY ("announcementId", "userId"),
 FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AnnouncementRecipient_userId_idx" ON "AnnouncementRecipient"("userId");
CREATE TABLE "AnnouncementSms" (
 "id" TEXT NOT NULL PRIMARY KEY, "announcementId" TEXT NOT NULL, "userId" TEXT NOT NULL,
 "phone" TEXT, "status" TEXT NOT NULL DEFAULT 'QUEUED', "messageSid" TEXT, "error" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AnnouncementSms_messageSid_key" ON "AnnouncementSms"("messageSid");
CREATE UNIQUE INDEX "AnnouncementSms_announcementId_userId_key" ON "AnnouncementSms"("announcementId", "userId");
CREATE INDEX "AnnouncementSms_status_createdAt_idx" ON "AnnouncementSms"("status", "createdAt");
