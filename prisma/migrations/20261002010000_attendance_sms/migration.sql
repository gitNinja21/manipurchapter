CREATE TABLE "AttendanceSms" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "userId" TEXT NOT NULL,
 "workDate" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'CLAIMED',
 "messageSid" TEXT,
 "errorCode" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL,
 CONSTRAINT "AttendanceSms_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AttendanceSms_userId_workDate_key" ON "AttendanceSms"("userId", "workDate");
