CREATE TABLE "WorkDayOverride" (
  "workDate" TEXT NOT NULL PRIMARY KEY,
  "mode" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedById" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL
);
