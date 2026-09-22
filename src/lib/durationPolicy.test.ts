import test from "node:test";
import assert from "node:assert/strict";
import { durationSnapshot, salaryCredit, overtimeMs, deviations, attendancePoints, HOUR } from "./performance";
import { netWorkHours, recurringRule } from "./workPolicy";
const at = (time: string) => new Date(`2026-09-19T${time}:00+05:30`);
const schedule = {start: at("10:00"), durationMinutes: 540, breakMinutes: 0};
const record = (start: string, end: string) => ({ ...durationSnapshot(at(start), schedule), clockInAt: at(start), clockOutAt: at(end), approvalStatus: "APPROVED", extraTimeStatus: "APPROVED", workDate: "2026-09-19" });
test("clock duration determines pay, finish and bonus, including the paid break", () => {
  for (const [end, pay, bonus, early] of [["18:00",8,0,1],["19:00",9,0,0],["20:00",9,1,0],["22:00",9,3,0]] as const) {
    const r = record("10:00",end);
    assert.equal(salaryCredit(r),pay);
    assert.equal(overtimeMs(r)/HOUR,bonus);
    assert.equal(deviations(r).earlyMs/HOUR,early);
    assert.equal(netWorkHours(r),pay+bonus-1);
  }
});
test("late start moves finish; post-meeting flags never deduct pay twice", () => {
  const r = {...record("10:30","19:00"),latePenaltyActive:true,earlyPenaltyActive:true};
  assert.equal(r.scheduledEndAt.toISOString(),at("19:30").toISOString());
  assert.equal(deviations(r).lateMs,30*60000);
  assert.equal(deviations(r).earlyMs,30*60000);
  assert.equal(salaryCredit(r),8.5);
  assert.deepEqual(attendancePoints(r),[{kind:"Late / early after manager meeting",points:-1.5}]);
  assert.equal(salaryCredit({...r,clockOutAt:at("19:30")}),9);
});
test("Friday part-time: seven clock hours, six paid, bonus after seven; points for full shift", () => {
  const friday = {...schedule,start:at("13:00"),durationMinutes:420,breakMinutes:60};
  const r = {...record("13:00","20:00"),...durationSnapshot(at("13:00"),friday)};
  assert.equal(salaryCredit(r),6); assert.equal(overtimeMs(r),0);
  assert.deepEqual(attendancePoints(r),[{kind:"On-time full shift",points:0.5}]);
  assert.equal(salaryCredit({...r,clockOutAt:at("19:00")}),5);
  assert.equal(deviations({...r,clockOutAt:at("19:00")}).earlyMs,HOUR);
  assert.equal(overtimeMs({...r,clockOutAt:at("21:00")}),HOUR);
});
test("pending overtime counts automatically; historical rejections remain excluded; corrections preserve duration", () => {
  const r=record("10:00","20:00");
  for (const status of ["PENDING","REJECTED"]) {
    assert.equal(overtimeMs({...r,extraTimeStatus:status}),status === "REJECTED" ? 0 : HOUR);
    assert.equal(salaryCredit({...r,extraTimeStatus:status}),9);
  }
  const corrected=durationSnapshot(at("11:00"),{...schedule,durationMinutes:420},r);
  assert.equal(corrected.scheduledEndAt.toISOString(),at("20:00").toISOString());
  assert.equal(corrected.shiftDurationMinutes,540);
});
test("weekly rules skip unassigned days and preserve Friday duration", () => {
  const u={weeklyScheduleJson:JSON.stringify({5:{start:780,latest:780,duration:420,unpaidBreak:60},6:{start:660,latest:660,duration:540,unpaidBreak:0}})};
  assert.equal(recurringRule(u,"2026-09-18")?.duration,420);
  assert.equal(recurringRule(u,"2026-09-19")?.duration,540);
  assert.equal(recurringRule(u,"2026-09-20"),null);
});

test("automatic extra-time points retain the 10.5 net-hour threshold and never double count",()=>{
  for(const status of ["PENDING","AUTOMATIC","APPROVED","NOT_REQUIRED"]) {
    const r={...record("10:00","21:30"),extraTimeStatus:status};
    assert.equal(attendancePoints(r).filter(p=>p.kind==="Extra shift").length,0);
    const longer={...r,clockOutAt:new Date(+at("21:30")+1000)};
    assert.equal(attendancePoints(longer).filter(p=>p.kind==="Extra shift").length,1);
    assert.equal(attendancePoints(longer).find(p=>p.kind==="Extra shift")?.points,1);
    assert.equal(salaryCredit(longer),9);
    assert.ok(overtimeMs(longer)>2.5*HOUR);
    assert.deepEqual(attendancePoints({...longer,approvalStatus:"REJECTED"}),[]);
  }
});

test("dated 150-minute unpaid break preserves history and deducts exactly once", () => {
  const user = {unpaidBreakFrom:"2026-09-23",scheduledUnpaidBreakMinutes:150};
  assert.equal(recurringRule(user,"2026-09-22")?.unpaidBreak,0);
  assert.equal(recurringRule(user,"2026-09-23")?.unpaidBreak,150);
  assert.equal(recurringRule({},"2026-09-23")?.unpaidBreak,0);
  const r = {...record("10:00","19:00"),...durationSnapshot(at("10:00"),{...schedule,breakMinutes:150})};
  assert.equal(salaryCredit(r),6.5);
  assert.equal(netWorkHours(r),6.5);
  assert.equal(overtimeMs(r),0);
  assert.equal(salaryCredit({...r,clockOutAt:at("11:00")}),0);
  assert.equal(overtimeMs({...r,clockOutAt:at("20:00")}),HOUR);
  const historical = record("10:00","19:00");
  assert.equal(durationSnapshot(at("10:00"),{...schedule,breakMinutes:150},historical).unpaidBreakMinutes,0);
  const weekly = {...user,weeklyScheduleJson:JSON.stringify({5:{start:780,latest:780,duration:420,unpaidBreak:60}})};
  assert.equal(recurringRule(weekly,"2026-09-25")?.unpaidBreak,150);
  assert.equal(recurringRule(weekly,"2026-09-24"),null);
});
