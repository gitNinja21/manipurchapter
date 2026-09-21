CREATE TABLE "CustomerReviewInvite" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "code" TEXT, "activeUserId" TEXT,
 "expiresAt" DATETIME NOT NULL, "claimedAt" DATETIME, "tokenHash" TEXT, "sessionExpiresAt" DATETIME,
 "usedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "CustomerReviewInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CustomerReviewInvite_code_key" ON "CustomerReviewInvite"("code");
CREATE UNIQUE INDEX "CustomerReviewInvite_activeUserId_key" ON "CustomerReviewInvite"("activeUserId");
CREATE UNIQUE INDEX "CustomerReviewInvite_tokenHash_key" ON "CustomerReviewInvite"("tokenHash");
CREATE INDEX "CustomerReviewInvite_expiresAt_idx" ON "CustomerReviewInvite"("expiresAt");
CREATE TABLE "CustomerReview" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "inviteId" TEXT NOT NULL,
 "friendliness" INTEGER NOT NULL, "attentiveness" INTEGER NOT NULL, "accuracy" INTEGER NOT NULL,
 "speed" INTEGER NOT NULL, "overall" INTEGER NOT NULL, "totalStars" INTEGER NOT NULL,
 "points" REAL NOT NULL, "workDate" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "CustomerReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "CustomerReview_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "CustomerReviewInvite" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "CustomerReview_ratings_check" CHECK (
  friendliness BETWEEN 1 AND 5 AND attentiveness BETWEEN 1 AND 5 AND accuracy BETWEEN 1 AND 5 AND speed BETWEEN 1 AND 5 AND overall BETWEEN 1 AND 5
 )
);
CREATE UNIQUE INDEX "CustomerReview_inviteId_key" ON "CustomerReview"("inviteId");
CREATE INDEX "CustomerReview_userId_workDate_idx" ON "CustomerReview"("userId", "workDate");
CREATE TABLE "ReviewRateLimit" ("key" TEXT NOT NULL PRIMARY KEY, "count" INTEGER NOT NULL, "expiresAt" DATETIME NOT NULL);
CREATE INDEX "ReviewRateLimit_expiresAt_idx" ON "ReviewRateLimit"("expiresAt");
