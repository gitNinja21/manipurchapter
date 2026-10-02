ALTER TABLE "User" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "AccountRecovery" ("id" TEXT NOT NULL PRIMARY KEY,"userId" TEXT,"phone" TEXT NOT NULL,"credentialStamp" TEXT,"verificationSid" TEXT,"attempts" INTEGER NOT NULL DEFAULT 0,"verifiedAt" DATETIME,"consumedAt" DATETIME,"expiresAt" DATETIME NOT NULL,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "AccountRecovery_expiresAt_idx" ON "AccountRecovery"("expiresAt");
CREATE INDEX "AccountRecovery_userId_idx" ON "AccountRecovery"("userId");
CREATE TABLE "RecoveryRateLimit" ("key" TEXT NOT NULL PRIMARY KEY,"count" INTEGER NOT NULL DEFAULT 0,"expiresAt" DATETIME NOT NULL);
