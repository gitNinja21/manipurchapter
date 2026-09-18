import assert from "node:assert/strict";
import { test } from "node:test";
import { arrivalState, netWorkHours, netWorkMs, policyApplies, policyTimes } from "./workPolicy";

test("arrival window uses IST and includes the whole 10:30 minute", () => {
  const at = (time: string) => new Date(`2026-09-19T${time}+05:30`);
  assert.equal(arrivalState(at("09:29:59")), "EARLY");
  assert.equal(arrivalState(at("09:30:00")), "ON_TIME");
  assert.equal(arrivalState(at("10:30:59")), "ON_TIME");
  assert.equal(arrivalState(at("10:31:00")), "LATE");
  assert.equal(policyApplies({attendancePolicyFrom: "2026-09-19"}, "2026-09-18"), false);
  assert.equal(policyApplies({attendancePolicyFrom: "2026-09-19"}, "2026-09-19"), true);
  assert.equal(policyApplies({}, "2026-09-19"), false);
});
test("net hours deduct a break exactly once, cap unapproved extra time and handle midnight", () => {
  const shift = {clockInAt: new Date("2026-09-19T09:30:00+05:30"), clockOutAt: new Date("2026-09-19T19:00:00+05:30"), unpaidBreakMinutes: 60};
  assert.equal(netWorkHours(shift), 8.5);
  assert.equal(netWorkHours({...shift, clockOutAt: new Date("2026-09-19T19:30:00+05:30")}), 9);
  assert.equal(netWorkHours({...shift, unpaidBreakMinutes: 0}), 9.5);
  assert.equal(netWorkHours({...shift, clockOutAt: new Date("2026-09-19T10:00:00+05:30")}), 0);
  assert.equal(netWorkHours({...shift, clockOutAt: null}), null);
  const overnight = {...shift, clockOutAt: new Date("2026-09-20T00:30:00+05:30"), extraTimeCutoff: policyTimes("2026-09-19").closesAt};
  assert.equal(netWorkHours({...overnight, extraTimeStatus: "PENDING"}), 12);
  assert.equal(netWorkHours({...overnight, extraTimeStatus: "REJECTED"}), 12);
  assert.equal(netWorkHours({...overnight, extraTimeStatus: "APPROVED"}), 14);
  assert.equal(netWorkMs({...shift, clockOutAt: new Date("2026-09-19T19:29:59+05:30")}), 9*3600000-1000);
});
