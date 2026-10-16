CREATE TABLE "CustomerVisit" (
 "id" TEXT NOT NULL PRIMARY KEY, "submissionKey" TEXT NOT NULL, "visitedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "workDate" TEXT NOT NULL, "weekday" INTEGER NOT NULL, "isWeekend" BOOLEAN NOT NULL, "monthPeriod" TEXT NOT NULL,
 "groupSize" INTEGER NOT NULL, "groupType" TEXT NOT NULL, "maleCount" INTEGER NOT NULL, "femaleCount" INTEGER NOT NULL, "unrecordedCount" INTEGER NOT NULL,
 "visitType" TEXT NOT NULL DEFAULT 'NOT_SURE', "discovery" TEXT NOT NULL DEFAULT 'NOT_ASKED', "discoveryOther" TEXT NOT NULL DEFAULT '',
 "unavailableJson" TEXT NOT NULL DEFAULT '[]', "feedback" TEXT NOT NULL DEFAULT '', "tableLabel" TEXT NOT NULL DEFAULT '', "status" TEXT NOT NULL DEFAULT 'OPEN',
 "weatherJson" TEXT NOT NULL, "createdById" TEXT NOT NULL, "updatedById" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1,
 "updatedAt" DATETIME NOT NULL, "deletedAt" DATETIME
);
CREATE UNIQUE INDEX "CustomerVisit_submissionKey_key" ON "CustomerVisit"("submissionKey");
CREATE INDEX "CustomerVisit_workDate_deletedAt_idx" ON "CustomerVisit"("workDate", "deletedAt");
CREATE TABLE "CustomerVisitItem" (
 "id" TEXT NOT NULL PRIMARY KEY, "visitId" TEXT NOT NULL, "menuId" TEXT NOT NULL, "name" TEXT NOT NULL, "category" TEXT NOT NULL,
 "diet" TEXT NOT NULL, "unitPriceRs" INTEGER NOT NULL, "quantity" INTEGER NOT NULL, "favourite" BOOLEAN NOT NULL DEFAULT false,
 CONSTRAINT "CustomerVisitItem_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "CustomerVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CustomerVisitItem_visitId_menuId_diet_key" ON "CustomerVisitItem"("visitId","menuId","diet");
CREATE TABLE "AnalyticsCalendarDay" (
 "date" TEXT NOT NULL PRIMARY KEY, "namesJson" TEXT NOT NULL, "isHoliday" BOOLEAN NOT NULL, "updatedById" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL
);
