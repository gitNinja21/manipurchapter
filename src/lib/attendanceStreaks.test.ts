import test from "node:test";
import assert from "node:assert/strict";
import { attendanceStreaks } from "./attendanceStreaks";
const at=(date:string,time:string)=>new Date(`${date}T${time}:00+05:30`);
const user={attendancePolicyFrom:"2026-09-01",attendanceStartMinute:600,attendanceLatestMinute:600};
const record=(workDate:string,clockIn="10:20",clockOut="18:00")=>({workDate,policyVersion:2,approvalStatus:"PENDING",clockInAt:at(workDate,clockIn),clockOutAt:at(workDate,clockOut),scheduledStartAt:at(workDate,"10:00"),scheduledEndAt:at(workDate,"19:20"),shiftDurationMinutes:540});
const base={user,leave:[],shifts:[],meetings:[],from:"2026-09-19",to:"2026-09-23",today:"2026-09-23"};
test("date filters preserve lookback; Monday is skipped and missing clock-in today is provisional",()=>{
  const records=[record("2026-09-19"),record("2026-09-20"),record("2026-09-22")];
  const report=attendanceStreaks({...base,records,from:"2026-09-22"});
  assert.deepEqual([...report.triggers].sort(),["EARLY:2026-09-22","LATE:2026-09-22"]);
  assert.equal(report.days[0].lateStreak,3);assert.equal(report.days[0].earlyStreak,3);
  assert.equal(report.days[1].lateStreak,3);assert.equal(report.days[1].earlyStreak,3);
  assert.equal(report.days[1].lateTalk,"PENDING");
});
test("third incident today is incoming, not a persisted meeting trigger until the next day",()=>{
  const records=[record("2026-09-19"),record("2026-09-20"),record("2026-09-22")];
  const result=attendanceStreaks({...base,records,to:"2026-09-22",today:"2026-09-22"});
  assert.equal(result.triggers.size,0);
  assert.equal(result.days.find(d=>d.date==="2026-09-20")?.lateTalk,"SOON");
  assert.equal(result.days.at(-1)?.lateTalk,"DUE_TODAY");
  assert.equal(result.days.at(-1)?.earlyTalk,"DUE_TODAY");
});
test("leave and recurring off-days skip; a missed or compliant working day breaks a streak",()=>{
  const records=[record("2026-09-18"),record("2026-09-20"),record("2026-09-22")];
  const result=attendanceStreaks({...base,records,leave:[{fromDate:"2026-09-19",toDate:"2026-09-19"}]});
  assert.equal(result.days.find(d=>d.date==="2026-09-22")?.lateStreak,3);
  const missed=attendanceStreaks({...base,records});
  assert.equal(missed.days.find(d=>d.date==="2026-09-22")?.lateStreak,2);
  const compliant=attendanceStreaks({...base,records:[record("2026-09-19"),record("2026-09-20","10:00","19:00"),record("2026-09-22")]});
  assert.equal(compliant.days.find(d=>d.date==="2026-09-22")?.lateStreak,1);
  const weekly={...user,weeklyScheduleJson:JSON.stringify({5:{start:600,latest:600,duration:540,unpaidBreak:0},6:{start:600,latest:600,duration:540,unpaidBreak:0},0:{start:600,latest:600,duration:540,unpaidBreak:0}})};
  const week=attendanceStreaks({...base,user:weekly,records:[record("2026-09-18"),record("2026-09-19"),record("2026-09-25")],from:"2026-09-18",to:"2026-09-25",today:"2026-09-26",leave:[{fromDate:"2026-09-20",toDate:"2026-09-20"}]});
  assert.equal(week.days.at(-1)?.lateStreak,3);
});
test("grace, excused incidents and excluded records do not advance manager-talk streaks",()=>{
  const first=record("2026-09-19");
  for(const second of [record("2026-09-20","10:15","19:15"),{...record("2026-09-20"),lateExcused:true,earlyExcused:true},{...record("2026-09-20"),approvalStatus:"REJECTED"}]) {
    const report=attendanceStreaks({...base,records:[first,second,record("2026-09-22")]});
    assert.equal(report.days.find(d=>d.date==="2026-09-22")?.lateStreak,1);
    assert.equal(report.days.find(d=>d.date==="2026-09-22")?.earlyStreak,1);
    assert.equal(report.triggers.size,0);
  }
});
test("unfinished clock-out today preserves yesterday's early streak but records today's known late arrival",()=>{
  const report=attendanceStreaks({...base,to:"2026-09-22",today:"2026-09-22",records:[record("2026-09-19"),record("2026-09-20"),{...record("2026-09-22"),clockOutAt:null}]});
  assert.equal(report.days.at(-1)?.lateStreak,3);assert.equal(report.days.at(-1)?.earlyStreak,2);
  assert.equal(report.days.at(-1)?.earlyTalk,"SOON");
});
test("manager clearance resets its cycle, preserves raw consecutive counts, and suppresses repeat talks that month",()=>{
  const meetings=[{kind:"LATE",status:"CLEARED",triggerDate:"2026-09-22",clearedDate:"2026-09-23"}];
  const report=attendanceStreaks({...base,meetings,to:"2026-09-24",today:"2026-09-25",records:[record("2026-09-19"),record("2026-09-20"),record("2026-09-22"),record("2026-09-23"),record("2026-09-24")]});
  assert.equal(report.days.find(d=>d.date==="2026-09-22")?.lateTalk,"PENDING");
  assert.equal(report.days.find(d=>d.date==="2026-09-23")?.lateTalk,"CLEARED");
  assert.equal(report.days.at(-1)?.lateStreak,5);assert.equal(report.days.at(-1)?.lateTalkStreak,0);
  assert.equal(report.days.at(-1)?.lateTalk,"FOLLOW_UP");
});
test("streaks cross month boundaries and pending talks survive them",()=>{
  const records=[record("2020-09-29"),record("2020-09-30"),record("2020-10-01")];
  const report=attendanceStreaks({...base,user:{...user,attendancePolicyFrom:"2020-09-01"},records,from:"2020-10-01",to:"2020-10-02",today:"2020-10-02"});
  assert.equal(report.days[0].lateStreak,3);assert.ok(report.triggers.has("LATE:2020-10-01"));
  const pending=attendanceStreaks({...base,user:{...user,attendancePolicyFrom:"2020-09-01"},records:[],from:"2020-10-01",to:"2020-10-01",today:"2020-10-01",meetings:[{kind:"LATE",status:"PENDING",triggerDate:"2020-09-30",clearedDate:null}]});
  assert.equal(pending.days[0].lateTalk,"PENDING");
});
