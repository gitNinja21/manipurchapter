import test from "node:test";
import assert from "node:assert/strict";
import { attendanceReminder } from "./attendanceReminders";
const at=(time:string)=>new Date(`2026-09-19T${time}:00+05:30`);
const base={now:at("10:30"),scheduledStart:at("10:00"),scheduledEnd:at("19:00"),onLeave:false,arrived:false,recordedToday:false,open:null};
test("clock-in deadline uses IST and respects later shifts, leave, off-days and recorded arrivals",()=>{
  assert.equal(attendanceReminder({...base,now:at("10:29")}),null);
  assert.equal(attendanceReminder(base)?.kind,"ATTENDANCE_IN");
  assert.equal(attendanceReminder({...base,scheduledStart:at("13:00")}),null);
  assert.equal(attendanceReminder({...base,scheduledStart:at("13:00"),now:at("13:00")})?.kind,"ATTENDANCE_IN");
  for(const patch of [{onLeave:true},{arrived:true},{recordedToday:true},{scheduledStart:null},{scheduledEnd:null},{now:at("19:00")}]) assert.equal(attendanceReminder({...base,...patch}),null);
});
test("clock-out starts at 22:30 or a later rolling finish; old shifts ask for correction",()=>{
  const open={id:"shift",clockInAt:at("13:00"),scheduledEndAt:at("22:00")};
  assert.equal(attendanceReminder({...base,open,now:at("22:29")}),null);
  assert.equal(attendanceReminder({...base,open,now:at("22:30")})?.kind,"ATTENDANCE_OUT");
  assert.equal(attendanceReminder({...base,open:{...open,scheduledEndAt:at("23:00")},now:at("22:30")}),null);
  assert.equal(attendanceReminder({...base,open:{...open,clockInAt:new Date("2026-09-18T10:00:00+05:30")},now:at("22:30")})?.href,"/employee/team?view=requests");
  assert.equal(attendanceReminder({...base,open:null,recordedToday:true,now:at("22:30")}),null);
});
test("repeat keys are stable within a five-minute slot and once mode never repeats",()=>{
  const first=attendanceReminder(base)!;
  assert.equal(attendanceReminder({...base,now:at("10:34")})?.key,first.key);
  assert.notEqual(attendanceReminder({...base,now:at("10:35")})?.key,first.key);
  assert.equal(attendanceReminder({...base,now:at("12:00"),repeatMinutes:0})?.key,first.key);
});

test("overnight shifts retain the prior day's deadline after midnight",()=>{
  const open={id:"night",clockInAt:at("15:30"),scheduledEndAt:new Date("2026-09-20T00:30:00+05:30")};
  assert.equal(attendanceReminder({...base,open,now:new Date("2026-09-20T00:29:00+05:30")}),null);
  assert.equal(attendanceReminder({...base,open,now:new Date("2026-09-20T00:30:00+05:30")})?.kind,"ATTENDANCE_OUT");
});
