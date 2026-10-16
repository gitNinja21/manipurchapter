import test from "node:test";
import assert from "node:assert/strict";
import { validateSchedule, scheduleVersion } from "./scheduleVersions";
import { recurringRule, netWorkMs, paidTimeMs } from "./workPolicy";
import { durationSnapshot, attendancePoints } from "./performance";
const rule={start:600,latest:600,duration:750,unpaidBreak:150,paidBreak:0};
test("schedule versions preserve old dates and switch on the effective date",()=>{
 const user={masterScheduleFrom:"2026-10-01",masterScheduleJson:JSON.stringify({"2":{...rule,start:570}}),scheduleHistoryJson:JSON.stringify([{from:"2026-10-14",days:{"2":rule}},{from:"2026-11-01",days:{"2":{...rule,start:630}}}])};
 assert.equal(scheduleVersion(user,"2026-10-13"),null);
 assert.equal(recurringRule(user,"2026-10-13")?.start,570);
 assert.equal(recurringRule(user,"2026-10-20")?.start,600);
 assert.equal(recurringRule(user,"2026-11-03")?.start,630);
 assert.equal(recurringRule(user,"2026-10-19"),null);
});
test("schedule validation rejects off-day, invalid times and impossible breaks",()=>{
 for(const days of [{"1":rule},{"2":{...rule,start:1000}},{"2":{...rule,unpaidBreak:750}},{"2":{...rule,paidBreak:-1}},{"2":{...rule,duration:NaN}}]) assert.throws(()=>validateSchedule(days));
 assert.deepEqual(validateSchedule({"2":rule}),{"2":rule});
});
test("break snapshots retain history and proportionally calculate shorter shifts",()=>{
 const start=new Date("2026-10-20T10:00:00+05:30");
 const schedule={start,end:new Date(+start+750*60000),durationMinutes:750,breakMinutes:150,paidBreakMinutes:0,policyVersion:3};
 const record={...durationSnapshot(start,schedule),clockInAt:start,clockOutAt:new Date(+start+5*3600000)};
 assert.equal(paidTimeMs(record),4*3600000);
 assert.equal(netWorkMs(record),4*3600000);
 const preserved=durationSnapshot(start,{...schedule,breakMinutes:60,paidBreakMinutes:60},record);
 assert.equal(preserved.unpaidBreakMinutes,150);assert.equal(preserved.paidBreakMinutes,0);
 const paidRecord={...record,...durationSnapshot(start,{...schedule,durationMinutes:600,breakMinutes:0,paidBreakMinutes:60})};
 assert.equal(paidTimeMs(paidRecord),5*3600000);assert.equal(netWorkMs(paidRecord),4.5*3600000);
});

test("one-day Monday opening wins on that date only and retains weekly history",()=>{
 const user={scheduleHistoryJson:JSON.stringify([
  {from:"2026-10-01",days:{"0":rule,"2":rule}},
  {from:"2026-10-19",oneDay:true,days:{"1":rule}},
  {from:"2026-10-19",days:{"0":{...rule,start:630},"2":{...rule,start:630}}},
 ])};
 assert.equal(recurringRule(user,"2026-10-18")?.start,600);
 assert.deepEqual(recurringRule(user,"2026-10-19"),rule);
 assert.equal(recurringRule(user,"2026-10-20")?.start,630);
 assert.equal(recurringRule(user,"2026-10-26"),null);
});

test("opened Monday earns ordinary completion points while a closed Monday does not",()=>{
 const start=new Date("2026-10-19T10:00:00+05:30");
 const r={workDate:"2026-10-19",policyVersion:3,approvalStatus:"APPROVED",clockInAt:start,clockOutAt:new Date(+start+9*3600000),scheduledStartAt:start,scheduledEndAt:new Date(+start+9*3600000),shiftDurationMinutes:540,unpaidBreakMinutes:0,paidBreakMinutes:60};
 assert.equal(attendancePoints(r).length,0);
 assert.deepEqual(attendancePoints({...r,workingMonday:true}),[{kind:"Base-hour completion",points:0.5}]);
});
