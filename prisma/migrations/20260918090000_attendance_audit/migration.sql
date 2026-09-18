CREATE TABLE "AttendanceAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recordId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "workDate" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeJson" TEXT NOT NULL,
    "afterJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AttendanceAudit_workDate_createdAt_idx" ON "AttendanceAudit"("workDate", "createdAt");
CREATE INDEX "AttendanceAudit_recordId_idx" ON "AttendanceAudit"("recordId");
