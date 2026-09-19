import test from "node:test";
import assert from "node:assert/strict";
import {
  salaryCredit,
  attendancePoints,
  extraCutoff,
  deviations,
} from "./performance";
import { netWorkHours } from "./workPolicy";
const at = (time: string) => new Date(`2026-09-19T${time}:00+05:30`);
const record = {
  policyVersion: 1,
  clockInAt: at("13:00"),
  clockOutAt: at("22:30"),
  scheduledStartAt: at("13:00"),
  scheduledEndAt: at("22:30"),
  unpaidBreakMinutes: 60,
  approvalStatus: "APPROVED",
  workDate: "2026-09-19",
};
test("a full 8.5-hour shift earns nine salary hours without synthetic overtime", () => {
  assert.equal(netWorkHours(record), 8.5);
  assert.equal(salaryCredit(record), 9);
  assert.deepEqual(attendancePoints(record), [
    { kind: "On-time full shift", points: 0.5 },
  ]);
  assert.equal(salaryCredit({ ...record, policyVersion: 0 }), 8.5);
});
test("after a meeting 10 late minutes reduce nine-hour credit once", () => {
  const r = { ...record, clockInAt: at("13:10"), latePenaltyActive: true };
  assert.equal(salaryCredit(r), 9 - 10 / 60);
  assert.equal(
    attendancePoints(r).reduce((s, p) => s + p.points, 0),
    -1.5,
  );
  assert.equal(
    salaryCredit({ ...r, clockOutAt: at("22:20"), earlyPenaltyActive: true }),
    9 - 20 / 60,
  );
  assert.equal(
    attendancePoints({
      ...r,
      clockOutAt: at("22:20"),
      earlyPenaltyActive: true,
    }).length,
    1,
  );
});
test("grace, incomplete shifts, exceptions and pending attendance have distinct effects", () => {
  assert.equal(salaryCredit({ ...record, clockInAt: at("13:15") }), 9);
  assert.equal(
    salaryCredit({ ...record, clockInAt: at("13:16") }),
    8.5 - 16 / 60,
  );
  assert.equal(salaryCredit({ ...record, clockOutAt: at("21:30") }), 7.5);
  assert.equal(
    deviations({ ...record, clockInAt: at("14:00"), lateExcused: true }).lateMs,
    0,
  );
  assert.deepEqual(
    attendancePoints({ ...record, approvalStatus: "PENDING" }),
    [],
  );
  assert.deepEqual(attendancePoints({ ...record, workDate: "2026-09-21" }), []);
});
test("reason threshold is actual time excluding break; approved extra points are once per day", () => {
  assert.equal(
    extraCutoff(at("09:30"), 60, at("22:30")).toISOString(),
    at("21:00").toISOString(),
  );
  assert.equal(
    extraCutoff(at("13:00"), 60, at("22:30")).toISOString(),
    at("22:30").toISOString(),
  );
  const r = { ...record, clockInAt: at("09:30"), extraTimeStatus: "APPROVED" };
  assert.equal(
    attendancePoints(r).reduce((s, p) => s + p.points, 0),
    1.5,
  );
  assert.equal(
    attendancePoints({ ...r, clockOutAt: at("21:00") }).filter(
      (p) => p.points === 1,
    ).length,
    0,
  );
});
