import test from "node:test";
import assert from "node:assert/strict";
import { hourlySnapshot, hourlyPaidMs } from "./hourlyPay";
import { salaryCredit, overtimeMs, deviations, durationSnapshot } from "./performance";
import { paidTimeMs } from "./workPolicy";
const at=(time:string)=>new Date(`2026-10-19T${time}:00+05:30`);
test("hourly pay subtracts exact unpaid break, includes paid break and ignores old caps",()=>{
 const r={...hourlySnapshot(120),clockInAt:at("10:00"),clockOutAt:at("20:00"),workDate:"2026-10-19"};
 assert.equal(hourlyPaidMs(r),8*3600000);assert.equal(salaryCredit(r),8);assert.equal(paidTimeMs(r),8*3600000);assert.equal(overtimeMs(r),0);assert.deepEqual(deviations(r),{lateMs:0,earlyMs:0});
 const long={...r,clockOutAt:at("23:30"),lateClockOutCutoff:at("22:45"),lateClockOutStatus:"PENDING",extraTimeCutoff:at("19:00"),extraTimeStatus:"REJECTED"};
 assert.equal(salaryCredit(long),11.5);assert.equal(overtimeMs(long),0);
 assert.equal(salaryCredit({...r,clockOutAt:at("10:30"),unpaidBreakMinutes:0}),0.5); // Paid break is not an extra hour.
 assert.equal(paidTimeMs({...r,clockOutAt:null}),null);
 const snapshot=durationSnapshot(at("10:00"),{start:at("00:00"),durationMinutes:1440,breakMinutes:0,policyVersion:4});
 assert.equal(snapshot.policyVersion,4);assert.equal(snapshot.scheduledEndAt,null);
});
