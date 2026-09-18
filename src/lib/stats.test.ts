import assert from "node:assert/strict";
import { test } from "node:test";
import type { AttendanceRecord, User } from "@prisma/client";
import { prisma } from "./prisma";
import { computeStatsForRange } from "./stats";
import { todayWorkDate } from "./time";

test("billing starts at account creation in IST and respects the report range", async (t) => {
  let createdAt = new Date("2020-09-15T18:30:00Z"); // September 16 IST
  let records: AttendanceRecord[] = [];
  const originalUsers = prisma.user.findMany;
  const originalRecords = prisma.attendanceRecord.findMany;
  t.after(() => {
    prisma.user.findMany = originalUsers;
    prisma.attendanceRecord.findMany = originalRecords;
  });
  prisma.user.findMany = (async () => [{
    id: "employee", name: "Employee", employeeCode: "MC-001",
    createdAt, hourlyRateRs: 100, active: true,
  } as User]) as typeof prisma.user.findMany;
  prisma.attendanceRecord.findMany = (async () => records) as typeof prisma.attendanceRecord.findMany;
  const attendance = (workDate: string, approvalStatus = "APPROVED", complete = true) => ({
    userId: "employee", workDate, approvalStatus,
    clockInAt: new Date(`${workDate}T03:30:00Z`),
    clockOutAt: complete ? new Date(`${workDate}T13:30:00Z`) : null,
  } as AttendanceRecord);
  records = [attendance("2020-09-15"), attendance("2020-09-16")];
  let [s] = await computeStatsForRange("2020-09-01", "2020-09-16");
  assert.equal(s.billingFromDate, "2020-09-16");
  assert.equal(s.offDays, 0);
  assert.equal(s.missedDays, 0);
  assert.equal(s.daysPresent, 1);
  assert.equal(s.totalHours, 10);
  assert.equal(s.salaryRs, 900);

  records = [attendance("2020-09-14", "PENDING"), attendance("2020-09-15", "REJECTED"), attendance("2020-09-13", "PENDING", false)];
  [s] = await computeStatsForRange("2020-09-01", "2020-09-15");
  for (const key of ["daysPresent", "daysComplete", "incompleteDays", "missedDays", "pendingApprovalDays", "rejectedDays", "totalHours", "offDays", "salaryRs"] as const) assert.equal(s[key], 0, key);
  assert.equal(s.billingFromDate, null);

  records = [];
  [s] = await computeStatsForRange("2020-09-01", "2020-09-21");
  assert.equal(s.offDays, 1);
  assert.equal(s.salaryRs, 900);
  assert.equal(s.missedDays, 5);
  createdAt = new Date("2020-09-21T00:00:00Z");
  [s] = await computeStatsForRange("2020-09-01", "2020-09-21");
  assert.equal(s.offDays, 1);
  assert.equal(s.missedDays, 0);
  createdAt = new Date("2020-08-01T00:00:00Z");
  [s] = await computeStatsForRange("2020-09-14", "2020-09-14");
  assert.equal(s.billingFromDate, "2020-09-14");
  assert.equal(s.salaryRs, 900);

  createdAt = new Date();
  const today = todayWorkDate();
  records = [attendance("2099-01-01")];
  [s] = await computeStatsForRange(`${today.slice(0, 7)}-01`, "2099-01-01");
  assert.equal(s.billingFromDate, today);
  assert.equal(s.daysPresent, 0);
  assert.equal(s.totalHours, 0);
  const monday = new Date(`${today}T00:00:00Z`).getUTCDay() === 1;
  assert.equal(s.offDays, monday ? 1 : 0);
  assert.equal(s.salaryRs, monday ? 900 : 0);
});

test("overtime pays whole days, carries across months, and stays separate per employee", async (t) => {
  const originalUsers = prisma.user.findMany;
  const originalRecords = prisma.attendanceRecord.findMany;
  t.after(() => {
    prisma.user.findMany = originalUsers;
    prisma.attendanceRecord.findMany = originalRecords;
  });
  prisma.user.findMany = (async () => ["a", "b"].map(id => ({
    id, name: id, employeeCode: id, createdAt: new Date("2020-01-01T00:00:00Z"),
    hourlyRateRs: 100, active: true,
  } as User))) as typeof prisma.user.findMany;
  let records: AttendanceRecord[] = [];
  prisma.attendanceRecord.findMany = (async () => records) as typeof prisma.attendanceRecord.findMany;
  const shift = (userId: string, workDate: string, extraHours: number, approvalStatus = "APPROVED") => {
    const clockInAt = new Date(`${workDate}T03:30:00Z`);
    return { userId, workDate, clockInAt,
      clockOutAt: new Date(clockInAt.getTime() + (9 + extraHours) * 3600000),
      approvalStatus,
    } as AttendanceRecord;
  };
  for (const [hours, days, balance] of [[0, 0, 0], [4, 0, 4], [8, 1, 0], [12, 1, 4], [16, 2, 0]]) {
    records = [shift("a", "2020-09-01", hours / 2), shift("a", "2020-09-02", hours / 2), shift("b", "2020-09-01", 1)];
    const [a, b] = await computeStatsForRange("2020-09-01", "2020-09-02");
    assert.equal(a.overtimeHours, hours);
    assert.equal(a.bonusDays, days);
    assert.equal(a.bonusPayRs, days * 900);
    assert.equal(a.salaryRs, 1800 + days * 900);
    assert.equal(a.overtimeBalanceHours, balance);
    assert.equal(b.bonusDays, 0);
    assert.equal(b.overtimeBalanceHours, 1);
  }
  records = [shift("a", "2020-08-29", 7), shift("a", "2020-09-01", 1),
    shift("a", "2020-09-02", 8, "PENDING"), shift("a", "2020-09-03", 8, "REJECTED"),
    shift("a", "2020-08-31", 8)]; // Monday retains existing paid-off-day policy
  let [a] = await computeStatsForRange("2020-09-01", "2020-09-03");
  assert.equal(a.overtimeHours, 1);
  assert.equal(a.bonusDays, 1);
  assert.equal(a.overtimeBalanceHours, 0);
  [a] = await computeStatsForRange("2020-09-02", "2020-09-03");
  assert.equal(a.bonusDays, 0); // previously earned bonus is not paid again
  records = [shift("a", "2020-09-01", 4), shift("a", "2020-09-02", 4 - 1 / 3600)];
  [a] = await computeStatsForRange("2020-09-01", "2020-09-02");
  assert.equal(a.bonusDays, 0); // one second short must not round up
  assert.equal(a.overtimeBalanceHours, 7.99);
});

test("salary previews do not mutate attendance and paid-day equivalents handle zero rates", async (t) => {
  const originalUsers = prisma.user.findMany, originalRecords = prisma.attendanceRecord.findMany;
  t.after(() => { prisma.user.findMany = originalUsers; prisma.attendanceRecord.findMany = originalRecords; });
  prisma.user.findMany = (async () => [{ id: "employee", name: "Employee", employeeCode: "MC-1", createdAt: new Date("2020-01-01T00:00:00Z"), hourlyRateRs: 0, active: true } as User]) as typeof prisma.user.findMany;
  const record = { id: "shift", userId: "employee", workDate: "2020-09-01", clockInAt: new Date("2020-09-01T03:30:00Z"), clockOutAt: new Date("2020-09-01T08:00:00Z"), approvalStatus: "PENDING" } as AttendanceRecord;
  prisma.attendanceRecord.findMany = (async () => [record]) as typeof prisma.attendanceRecord.findMany;
  const [preview] = await computeStatsForRange("2020-09-01", "2020-09-01", { userId: "employee", recordId: "shift", approvalStatus: "APPROVED" });
  assert.equal(preview.paidWorkDays, 0.5);
  assert.equal(preview.salaryRs, 0);
  assert.equal(record.approvalStatus, "PENDING");
  const [actual] = await computeStatsForRange("2020-09-01", "2020-09-01");
  assert.equal(actual.paidWorkDays, 0);
  assert.equal(actual.pendingApprovalDays, 1);
});
