import assert from "node:assert/strict";
import {test} from "node:test";
import {clockedMs,durationLabel,lateClockOutRule} from "./attendanceTime";
import {salaryCredit,overtimeMs,attendancePoints} from "./performance";
const at=(t:string)=>new Date(`2026-09-22T${t}+05:30`);
test("attendance is shown in hours and minutes with paid break included",()=>{
 const r={clockInAt:at("12:58:00"),clockOutAt:at("22:45:00"),policyVersion:2,unpaidBreakMinutes:0,shiftDurationMinutes:540};
 assert.equal(durationLabel(clockedMs(r)),"9h 47m");assert.equal(durationLabel(salaryCredit(r)*3600000),"9h 00m");assert.equal(durationLabel(overtimeMs(r)),"0h 47m");
 assert.equal(durationLabel(clockedMs({...r,clockOutAt:null})),"—");
});
test("only clock-outs strictly after 22:45 IST need approval; overnight keeps original work date",()=>{
 assert.equal(lateClockOutRule("2026-09-22",at("22:45:00")).lateClockOutStatus,"NOT_REQUIRED");
 assert.equal(lateClockOutRule("2026-09-22",at("22:45:00.001")).lateClockOutStatus,"PENDING");
 assert.equal(lateClockOutRule("2026-09-22",new Date("2026-09-23T01:00:00+05:30")).lateClockOutCutoff?.toISOString(),at("22:45:00").toISOString());
});
test("pending and rejected late time do not inflate salary, bonus or extra-shift points",()=>{
 const r={clockInAt:at("12:00:00"),clockOutAt:at("23:59:00"),policyVersion:2,unpaidBreakMinutes:0,shiftDurationMinutes:540,approvalStatus:"PENDING",...lateClockOutRule("2026-09-22",at("23:59:00"))};
 assert.equal(salaryCredit(r),9);assert.equal(overtimeMs(r)/3600000,1.75);
 assert.ok(!attendancePoints(r).some(p=>p.kind==="Extra shift"));
 assert.equal(overtimeMs({...r,lateClockOutStatus:"REJECTED"})/3600000,1.75);
 assert.equal(overtimeMs({...r,lateClockOutStatus:"APPROVED"}),179*60000);
 assert.ok(attendancePoints({...r,lateClockOutStatus:"APPROVED"}).some(p=>p.kind==="Extra shift"));
 const short={...r,clockInAt:at("20:00:00")};assert.equal(salaryCredit(short),2.75);
});
