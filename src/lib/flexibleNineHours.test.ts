import test from "node:test";
import assert from "node:assert/strict";
import {flexibleNinePay,flexibleNineSnapshot} from "./flexibleNineHours";
import {salaryCredit,overtimeMs,deviations} from "./performance";
import {paidTimeMs} from "./workPolicy";
const date="2026-10-13",at=(s:string)=>new Date(`${date}T${s}:00+05:30`);
const row=(start:string,end:string)=>({...flexibleNineSnapshot(date),workDate:date,clockInAt:at(start),clockOutAt:at(end)});
test("flexible nine-hour cap never prorates the 13-hour window",()=>{
 for(const [start,end,regular,bonus,unpaid] of [
  ["09:30","22:30",9,0,4],["12:30","22:30",9,0,1],
  ["15:30","22:30",7,0,0],["08:30","22:30",9,1,4],
  ["08:30","23:30",9,2,4],["08:00","09:00",0,1,0],
  ["22:40","23:10",0,0.5,0],["08:30","10:00",0.5,1,0],
 ] as const){
  const r=row(start,end),p=flexibleNinePay(r);
  assert.equal(p.regularMs/3600000,regular);assert.equal(p.bonusMs/3600000,bonus);assert.equal(p.unpaidMs/3600000,unpaid);
  assert.equal(salaryCredit(r),regular);assert.equal(overtimeMs(r)/3600000,bonus);
  assert.equal(paidTimeMs(r)!/3600000,regular+bonus);
  assert.deepEqual(deviations(r),{lateMs:0,earlyMs:0});
 }
});
test("flexible bonus retains explicit review limits and never invents a missing punch",()=>{
 const r=row("09:30","23:30");
 assert.equal(flexibleNinePay({...r,lateClockOutCutoff:at("22:45"),lateClockOutStatus:"PENDING"}).bonusMs/60000,15);
 assert.equal(flexibleNinePay({...r,extraTimeCutoff:at("22:30"),extraTimeStatus:"REJECTED"}).bonusMs,0);
 assert.equal(flexibleNinePay({...r,clockOutAt:null}).regularMs,0);
});
