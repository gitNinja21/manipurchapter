import assert from "node:assert/strict";
import { test } from "node:test";
import { arrivalState, netWorkHours, netWorkMs, policyApplies, policyTimes, scheduleLabels } from "./workPolicy";

test("arrival window uses IST and includes the whole 10:30 minute", () => {
  const at = (time: string) => new Date(`2026-09-19T${time}+05:30`);
  assert.equal(arrivalState(at("09:14:59")), "EARLY");
  assert.equal(arrivalState(at("09:15:00")), "ON_TIME");
  assert.equal(arrivalState(at("10:30:59")), "ON_TIME");
  assert.equal(arrivalState(at("10:31:00")), "LATE");
  assert.equal(policyApplies({attendancePolicyFrom: "2026-09-19"}, "2026-09-18"), false);
  assert.equal(policyApplies({attendancePolicyFrom: "2026-09-19"}, "2026-09-19"), true);
  assert.equal(policyApplies({}, "2026-09-19"), false);
});
test("net hours deduct a break exactly once, preserve rejected extra-time caps and handle midnight", () => {
  const shift = {clockInAt: new Date("2026-09-19T09:30:00+05:30"), clockOutAt: new Date("2026-09-19T19:00:00+05:30"), unpaidBreakMinutes: 60};
  assert.equal(netWorkHours(shift), 8.5);
  assert.equal(netWorkHours({...shift, clockOutAt: new Date("2026-09-19T19:30:00+05:30")}), 9);
  assert.equal(netWorkHours({...shift, unpaidBreakMinutes: 0}), 9.5);
  assert.equal(netWorkHours({...shift, clockOutAt: new Date("2026-09-19T10:00:00+05:30")}), 0);
  assert.equal(netWorkHours({...shift, clockOutAt: null}), null);
  const overnight = {...shift, clockOutAt: new Date("2026-09-20T00:30:00+05:30"), extraTimeCutoff: policyTimes("2026-09-19").closesAt};
  assert.equal(netWorkHours({...overnight, extraTimeStatus: "PENDING"}), 14);
  assert.equal(netWorkHours({...overnight, extraTimeStatus: "REJECTED"}), 12);
  assert.equal(netWorkHours({...overnight, extraTimeStatus: "APPROVED"}), 14);
  assert.equal(netWorkMs({...shift, clockOutAt: new Date("2026-09-19T19:29:59+05:30")}), 9*3600000-1000);
});


test("six fixed schedules keep their own arrival deadlines, finish and net pay hours", () => {
  for (const [start, finish, hours] of [[780,1350,8.5],[690,1230,8],[600,1140,8],[750,1350,9]]) {
    const schedule = {attendanceStartMinute: start, attendanceLatestMinute: start, attendanceEndMinute: finish, attendanceAllowEarly: true};
    const times = policyTimes("2026-09-19", schedule);
    const startAt = new Date(+new Date("2026-09-19T00:00:00+05:30") + start * 60000);
    assert.equal(arrivalState(new Date(+startAt-60000), "2026-09-19", schedule), "ON_TIME");
    assert.equal(arrivalState(new Date(+startAt+59000), "2026-09-19", schedule), "ON_TIME");
    assert.equal(arrivalState(new Date(+startAt+60000), "2026-09-19", schedule), "LATE");
    assert.equal(netWorkHours({clockInAt: startAt, clockOutAt: times.closesAt, unpaidBreakMinutes: 60}), hours);
    assert.equal(scheduleLabels(schedule).fixed, true);
    for (const attendanceAllowEarly of [true, false]) {
      assert.equal(arrivalState(new Date(+startAt - 15 * 60000), "2026-09-19", {...schedule, attendanceAllowEarly}), "ON_TIME");
      assert.equal(arrivalState(new Date(+startAt - 15 * 60000 - 1), "2026-09-19", {...schedule, attendanceAllowEarly}), "EARLY");
    }
  }
  assert.equal(scheduleLabels({attendanceStartMinute: 750, attendanceLatestMinute: 750}).arrival, "12:30 pm");
});
