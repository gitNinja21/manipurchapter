CREATE TABLE "SelfieTheme" (
 "date" TEXT NOT NULL PRIMARY KEY, "theme" TEXT NOT NULL, "appliesTo" TEXT NOT NULL,
 "enabled" BOOLEAN NOT NULL DEFAULT true, "revision" INTEGER NOT NULL DEFAULT 1,
 "updatedById" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "SelfiePoseAttempt" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "date" TEXT NOT NULL,
 "action" TEXT NOT NULL, "theme" TEXT NOT NULL, "revision" INTEGER NOT NULL,
 "photoHash" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'CHECKING',
 "reason" TEXT NOT NULL DEFAULT '', "model" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" DATETIME NOT NULL,
 "consumedAt" DATETIME
);
CREATE INDEX "SelfiePoseAttempt_userId_createdAt_idx" ON "SelfiePoseAttempt"("userId", "createdAt");
CREATE INDEX "SelfiePoseAttempt_date_createdAt_idx" ON "SelfiePoseAttempt"("date", "createdAt");
CREATE TABLE "SelfieThemeException" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "date" TEXT NOT NULL,
 "action" TEXT NOT NULL, "reason" TEXT NOT NULL, "grantedById" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SelfieThemeException_userId_date_action_key" ON "SelfieThemeException"("userId", "date", "action");
