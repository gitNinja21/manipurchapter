import test from "node:test";
import assert from "node:assert/strict";
import { masterPay, monthlyLateness, usesMasterPolicy } from "./masterPolicy";
import { durationSnapshot, salaryCredit, overtimeMs, attendancePoints, deviations } from "./performance";
import { recurringRule } from "./workPolicy";
import { readFileSync } from "node:fs";
const at=(time:string,date="2026-09-26")=>new Date(`${date}T${time}:00+05:30`);
const r=(start="10:00",end="22:30",duration=750,unpaid=150)=>({...durationSnapshot(at(start),{start:at("10:00"),end:at("22:30"),durationMinutes:duration,breakMinutes:unpaid,policyVersion:3}),clockInAt:at(start),clockOutAt:at(end),workDate:"2026-09-26",approvalStatus:"PENDING"});
const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
test("full long shift pays ten hours; unpaid break is proportional on short shifts",()=>{
  near(salaryCredit(r()),10); near(overtimeMs(r()),0);
  near(salaryCredit(r("10:00","16:15")),5);
  near(masterPay(r("10:00","16:15")).unpaidMs/3600000,1.25);
});
test("grace is paid, counted once and cannot create bonus; finish stays fixed",()=>{
  for(const [arrival,paid,late] of [["10:10",10,0],["10:15",10,0],["10:30",9.8,15],["11:00",9.4,45]] as const) {
    const record=r(arrival); near(salaryCredit(record),paid);near(deviations(record).lateMs/60000,late);
    assert.equal(record.scheduledEndAt.toISOString(),at("22:30").toISOString()); near(overtimeMs(record),0);
  }
  assert.deepEqual(attendancePoints({...r("10:15"),latePenaltyActive:true}),[{kind:"Base-hour completion",points:0.5}]);
  assert.deepEqual(attendancePoints({...r("10:30"),latePenaltyActive:true}),[]);
});
test("paid one-hour breaks have zero deduction; Gokul uses one sixth",()=>{
  const normal={...r("10:00","19:00",540,0),scheduledEndAt:at("19:00")}; near(salaryCredit(normal),9);
  near(salaryCredit({...normal,clockOutAt:at("16:00")}),6);
  const gokul={...r("10:00","22:00",720,120),scheduledEndAt:at("22:00")};near(salaryCredit(gokul),10);
  near(salaryCredit({...gokul,clockOutAt:at("16:00")}),5);
});
test("overtime is only real work after fixed finish; late approval cutoff remains respected",()=>{
  near(overtimeMs(r("10:15","23:00"))/3600000,0.4);
  near(overtimeMs({...r("10:00","23:00"),lateClockOutCutoff:at("22:45"),lateClockOutStatus:"PENDING"})/3600000,0.2);
  near(salaryCredit(r("22:40","23:00")),0); // no grace for an arrival after the shift
});
test("monthly warnings start at three days, award exclusion at five, with monthly reset",()=>{
  const rows=[1,2,3,4,5].map(n=>({...r("10:30"),workDate:`2026-10-0${n}`}));
  assert.equal(monthlyLateness(rows.slice(0,2),"2026-10").lateWarning,false);
  assert.equal(monthlyLateness(rows.slice(0,3),"2026-10").lateWarning,true);
  assert.equal(monthlyLateness(rows.slice(0,4),"2026-10").awardEligible,true);
  assert.deepEqual(monthlyLateness(rows,"2026-10"),{lateDays:5,lateMinutes:75,lateWarning:true,awardEligible:false});
  assert.equal(monthlyLateness(rows,"2026-11").lateDays,0);
  assert.equal(monthlyLateness([...rows,rows[0]],"2026-10").lateDays,5);
  assert.equal(monthlyLateness(rows.map(r=>({...r,lateExcused:true})),"2026-10").lateDays,0);
});
test("rollout leaves saved older policy intact and starts at the IST date boundary",()=>{
  assert.equal(usesMasterPolicy("2026-09-25"),false);assert.equal(usesMasterPolicy("2026-09-26"),true);
  const old={...r(),policyVersion:2,shiftDurationMinutes:540};
  near(salaryCredit(old),6.5);
  assert.equal(durationSnapshot(at("10:30"),{start:at("10:00"),durationMinutes:750,breakMinutes:150,policyVersion:3},old).policyVersion,2);
});
test("all fourteen master schedules exclude Monday and keep exact shift durations and breaks",()=>{
  const sql=readFileSync("prisma/migrations/20260926000000_master_schedule/migration.sql","utf8");
  const rows=[...sql.matchAll(/"masterScheduleJson"='([^']+)' WHERE "role"='EMPLOYEE' AND "employeeCode"='([^']+)'/g)];
  assert.equal(rows.length,14);
  const plans=new Map(rows.map(m=>[m[2],JSON.parse(m[1])]));
  for(const [,plan] of plans) { assert.equal(plan["1"],undefined); for(const v of Object.values(plan) as {duration:number;unpaidBreak:number;unpaidBreakPercent:number}[]) near(v.unpaidBreakPercent,100*v.unpaidBreak/v.duration); }
  assert.deepEqual(Object.keys(plans.get("TOKI")).sort(),["0","5","6"]);
  assert.equal(plans.get("TOKI")["5"].duration,390);
  assert.equal(plans.get("TOKI")["6"].duration,600);
  assert.equal(plans.get("VICKY")["6"].duration,570);
  assert.equal(plans.get("BINAN SINGH")["6"].start,780);
  assert.equal(plans.get("RONYAMZ")["4"].start,660);
  assert.equal(plans.get("JOYSHREE CHANU")["6"].start,660);
  const user={masterScheduleFrom:"2026-09-26",masterScheduleJson:JSON.stringify(plans.get("GOKUL")),unpaidBreakFrom:"2026-09-23",scheduledUnpaidBreakMinutes:150};
  assert.equal(recurringRule(user,"2026-09-25")?.unpaidBreak,150);
  assert.equal(recurringRule(user,"2026-09-26")?.unpaidBreak,120);
  assert.equal(recurringRule(user,"2026-09-28"),null);
});
