import test from "node:test";
import assert from "node:assert/strict";
import { automaticDeparture, closeForgottenShifts } from "./autoClockOut";
import { prisma } from "./prisma";
const at=(time:string,date="2026-09-27")=>new Date(`${date}T${time}+05:30`);
const record={workDate:"2026-09-27",clockInAt:at("10:00:00"),clockOutAt:null};
test("automatic departure uses exact IST cutoff, catches up after midnight and preserves history",()=>{
  assert.equal(automaticDeparture(record,at("22:44:59")),null);
  assert.equal(+automaticDeparture(record,at("22:45:00"))!,+at("22:45:00"));
  assert.equal(+automaticDeparture(record,at("09:00:00","2026-09-28"))!,+at("22:45:00"));
  for(const patch of [{workDate:"2026-09-26"},{clockInAt:null},{clockOutAt:at("20:00:00")},{clockInAt:at("23:00:00")}]) assert.equal(automaticDeparture({...record,...patch},at("23:30:00")),null);
});
test("automatic closure is conditional, preserves rejection, adds audit and notification only once",async t=>{
  const oldFind=prisma.attendanceRecord.findMany,oldTx=prisma.$transaction;
  t.after(()=>{prisma.attendanceRecord.findMany=oldFind;prisma.$transaction=oldTx;});
  const before={...record,id:"r",userId:"u",updatedAt:at("10:00:00"),approvalStatus:"REJECTED",extraTimeStatus:"REJECTED",user:{name:"Test",employeeCode:"TEST"}};
  let changed=true,audits=0,notices=0;
  prisma.attendanceRecord.findMany=(async()=>[before]) as unknown as typeof oldFind;
  const tx={attendanceRecord:{updateMany:async(args:{where:{clockOutAt:null;updatedAt:Date};data:Record<string,unknown>})=>{
    assert.equal(args.where.clockOutAt,null);assert.equal(args.where.updatedAt,before.updatedAt);
    assert.equal(args.data.autoClockOut,true);assert.equal(args.data.clockOutFaceMatch,null);
    assert.equal(args.data.extraTimeStatus,"REJECTED");assert.equal(args.data.approvalStatus,undefined);
    const count=changed?1:0;changed=false;return {count};
  },findUniqueOrThrow:async()=>({...before,clockOutAt:at("22:45:00"),autoClockOut:true})},attendanceAudit:{create:async(args:{data:{action:string;afterJson:string}})=>{audits++;assert.equal(args.data.action,"AUTO_CLOCK_OUT");assert.equal(JSON.parse(args.data.afterJson).autoClockOut,true);}},notification:{create:async()=>{notices++;}}};
  prisma.$transaction=(async(fn:(value:typeof tx)=>Promise<number>)=>fn(tx)) as unknown as typeof oldTx;
  assert.equal(await closeForgottenShifts(at("22:46:00")),1);
  assert.equal(await closeForgottenShifts(at("22:47:00")),0);
  assert.equal(audits,1);assert.equal(notices,1);
});
