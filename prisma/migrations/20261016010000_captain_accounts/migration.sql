CREATE TABLE "CaptainAccount" (
 "id" TEXT NOT NULL PRIMARY KEY, "username" TEXT NOT NULL, "name" TEXT NOT NULL, "passwordHash" TEXT NOT NULL,
 "active" BOOLEAN NOT NULL DEFAULT true, "authVersion" INTEGER NOT NULL DEFAULT 0,
 "failedAttempts" INTEGER NOT NULL DEFAULT 0, "lockedUntil" DATETIME,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "CaptainAccount_username_key" ON "CaptainAccount"("username");
