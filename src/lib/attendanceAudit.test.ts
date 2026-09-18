import assert from "node:assert/strict";
import { test } from "node:test";
import type { AttendanceRecord } from "@prisma/client";
import { auditData } from "./attendanceAudit";
test("audit snapshots preserve administrator decisions without copying photos", () => {
  const record = { id: "shift", userId: "employee", workDate: "2026-09-16", approvalStatus: "PENDING", clockInAt: new Date("2026-09-16T03:30:00Z"), clockOutAt: new Date("2026-09-16T12:30:00Z"), clockInPhoto: "private-photo" } as AttendanceRecord;
  const employee = { name: "Employee", employeeCode: "MC-1" }, actor = { id: "admin", name: "Admin" };
  const entry = auditData(record, employee, actor, "APPROVED", { ...record, approvalStatus: "APPROVED" });
  assert.equal(entry.actorId, "admin");
  assert.equal(entry.employeeName, "Employee");
  assert.equal(JSON.parse(entry.beforeJson).approvalStatus, "PENDING");
  assert.equal(JSON.parse(entry.afterJson!).approvalStatus, "APPROVED");
  assert.ok(!entry.beforeJson.includes("private-photo"));
  assert.equal(auditData(record, employee, actor, "DELETED", null).afterJson, null);
});
