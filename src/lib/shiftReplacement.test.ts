import test from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { validateShift } from "./performanceServer";
import { todayWorkDate } from "./time";
import { durationSnapshot, salaryCredit, deviations } from "./performance";
const today = todayWorkDate();
const start = new Date(`${today}T00:00:00+05:30`);
const end = new Date(+start + 9 * 3600000);
function db({arrived = true, leave = false, overlap = false} = {}) {
  return {
    attendanceRecord: {findFirst: async () => arrived ? {id:"arrival"} : null},
    arrivalAttempt: {findUnique: async () => arrived ? {id:"attempt"} : null},
    user: {findUniqueOrThrow: async () => ({weeklyScheduleJson:null})},
    staffRequest: {findFirst: async () => leave ? {id:"leave"} : null},
    scheduledShift: {findFirst: async () => overlap ? {id:"overlap"} : null},
  } as unknown as Prisma.TransactionClient;
}
test("today's replacement can be requested and approved after start and recorded arrival", async () => {
  await validateShift(db(),"employee",today,start,end,true);
  await validateShift(db({arrived:false}),"employee",today,start,end,true);
});
test("ordinary schedule editing still blocks recorded arrivals", async () => {
  await assert.rejects(validateShift(db(),"employee",today,start,end), /after an arrival/);
});
test("same-day exception cannot bypass past-date, duration, leave or overlap checks", async () => {
  await assert.rejects(validateShift(db(),"employee","2020-01-01",start,end,true), /past date/);
  await assert.rejects(validateShift(db(),"employee",today,start,new Date(+start+8*3600000),true), /must span 9/);
  await assert.rejects(validateShift(db({leave:true}),"employee",today,start,end,true), /approved leave/);
  await assert.rejects(validateShift(db({overlap:true}),"employee",today,start,end,true), /overlaps/);
});
test("replacement scheduled start recalculates lateness without adding hours or pay", () => {
  const record = {...durationSnapshot(start,{start:new Date(+start-3600000),durationMinutes:540,breakMinutes:150}),clockInAt:start,clockOutAt:end};
  const changed = {...record,scheduledStartAt:start};
  assert.equal(deviations(record).lateMs,3600000);
  assert.equal(deviations(changed).lateMs,0);
  assert.equal(salaryCredit(changed),salaryCredit(record));
  assert.equal(salaryCredit(changed),6.5);
  assert.equal(changed.scheduledEndAt,record.scheduledEndAt);
});
