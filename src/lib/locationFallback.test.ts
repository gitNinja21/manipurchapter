import test from "node:test";
import assert from "node:assert/strict";
import type { Prisma, StaffRequest, User, AttendanceRecord } from "@prisma/client";
import { approveLocationFallback } from "./locationFallback";
const at = (hour: string) => new Date(`2026-09-24T${hour}:00+05:30`);
const user = {id:"employee",name:"Employee",employeeCode:"E",active:true,approved:true,mustChangePassword:false} as User;
const admin = {id:"admin",name:"Manager",role:"ADMIN"} as User;
const record = {id:"record",userId:user.id,workDate:"2026-09-24",clockInAt:at("10:00"),clockOutAt:null,updatedAt:at("10:00"),unpaidBreakMinutes:150,policyVersion:2,extraTimeCutoff:at("19:00")} as AttendanceRecord;
const request = {id:"request",userId:user.id,kind:"GPS_CLOCK_OUT",fromDate:record.workDate,proposedOut:at("19:00"),verificationPhoto:"employee/selfie.jpg",verificationDistance:0.2,expectedRecordId:record.id,expectedUpdatedAt:record.updatedAt} as StaffRequest;
function setup(current = record) {
  let result: AttendanceRecord | undefined;
  const audits: unknown[] = [], late: unknown[] = [];
  const db = {
    user:{findUniqueOrThrow:async()=>user,findMany:async()=>[]},
    attendanceRecord:{findUnique:async()=>current,update:async({data}:{data:Partial<AttendanceRecord>})=>(result={...current,...data})},
    staffRequest:{findFirst:async()=>null,create:async({data}:{data:unknown})=>{late.push(data);return {id:"late"};}},
    attendanceAudit:{create:async({data}:{data:unknown})=>{audits.push(data);}},
  } as unknown as Prisma.TransactionClient;
  return {db,audits,late,result:()=>result};
}
test("GPS clock-out approval uses submission time, retains breaks and creates audit",async()=>{
  const state=setup();
  await approveLocationFallback(state.db,request,admin);
  assert.equal(state.result()?.clockOutAt,request.proposedOut);
  assert.equal(state.result()?.unpaidBreakMinutes,150);
  assert.equal(state.result()?.clockOutFaceMatch,true);
  assert.equal(state.audits.length,1);
});
test("GPS approval does not automatically approve late clock-out hours",async()=>{
  const state=setup();
  await approveLocationFallback(state.db,{...request,proposedOut:at("23:00")},admin);
  assert.equal(state.result()?.lateClockOutStatus,"PENDING");
  assert.equal(state.late.length,1);
});
test("employee cannot approve their own GPS request",async()=>{
  const state=setup();
  await assert.rejects(approveLocationFallback(state.db,request,{...user,role:"EMPLOYEE"}),/Admin only/);
  assert.equal(state.result(),undefined);
});
test("stale attendance and missing selfies cannot be approved",async()=>{
  await assert.rejects(approveLocationFallback(setup({...record,updatedAt:at("11:00")}).db,request,admin),/Attendance changed/);
  await assert.rejects(approveLocationFallback(setup().db,{...request,verificationPhoto:null},admin),/selfie is missing/);
});
test("closed or overlong shifts cannot be overwritten",async()=>{
  await assert.rejects(approveLocationFallback(setup({...record,clockOutAt:at("18:00")}).db,request,admin),/open shift changed/);
  await assert.rejects(approveLocationFallback(setup().db,{...request,proposedOut:new Date(+record.clockInAt!+25*3600000)},admin),/over 24 hours/);
});
