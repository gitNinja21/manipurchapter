CREATE TABLE "ExtraPaidDay" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "month" TEXT NOT NULL,
 "creditDate" TEXT NOT NULL, "days" INTEGER NOT NULL DEFAULT 0, "revision" INTEGER NOT NULL DEFAULT 1,
 "updatedById" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 CONSTRAINT "ExtraPaidDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExtraPaidDay_userId_month_key" ON "ExtraPaidDay"("userId","month");
CREATE INDEX "ExtraPaidDay_creditDate_idx" ON "ExtraPaidDay"("creditDate");
