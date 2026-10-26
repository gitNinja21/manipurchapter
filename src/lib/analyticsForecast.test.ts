import test from "node:test";
import assert from "node:assert/strict";
import {predictDemand,shiftDate,type DayDemand} from "./analytics/forecast";
const day=(date:string,guests:number):DayDemand=>({date,guests,groups:guests/2,sales:guests*400,hours:Array.from({length:24},(_,h)=>h===14?guests:0),items:[{key:"fish",name:"Fish",quantity:guests/3,water:false},{key:"water",name:"Bottled Water",quantity:guests/2,water:true}]});
test("forecast requires evidence, excludes target/future dates and retains real zero days",()=>{
 const days=[day("2026-10-20",0),day("2026-10-21",30),day("2026-10-22",30)];
 assert.equal(predictDemand(days.slice(1),"2026-10-23"),null);
 const result=predictDemand(days,"2026-10-23")!;
 assert.deepEqual(result,predictDemand([...days,day("2026-10-23",1000),day("2026-10-24",1000)],"2026-10-23"));
 assert.ok(result.guests>20 && result.guests<30);assert.equal(result.trainingDays,3);assert.equal(result.method,"recent");
 assert.ok(Math.abs(result.hours.reduce((a,b)=>a+b,0)-result.guests)<1e-9);assert.equal(result.items.length,2);assert.ok(result.guestRange.low>=0);
});
test("weekday model earns selection only through out-of-sample improvement",()=>{
 const days=Array.from({length:56},(_,i)=>{const date=shiftDate("2026-08-01",i);return day(date,new Date(date).getUTCDay()===2?100:10);});
 const p=predictDemand(days,"2026-09-29")!;assert.equal(p.method,"weekday");assert.equal(p.validationDays,53);assert.ok(p.scores[1].guestMAE!<p.scores[0].guestMAE!*0.9);
 const flat=predictDemand(days.map(d=>day(d.date,20)),"2026-09-29")!;assert.equal(flat.method,"recent");assert.ok(Math.abs(flat.guests-20)<1e-9);
});
test("recent observations update new predictions and 90-day cutoff is respected",()=>{
 const days=[day("2026-10-20",20),day("2026-10-21",20),day("2026-10-22",20)];
 const a=predictDemand(days,"2026-10-23")!,b=predictDemand([...days,day("2026-10-23",80)],"2026-10-24")!;assert.ok(b.guests>a.guests);
 assert.deepEqual(a,predictDemand([day("2026-01-01",9999),...days],"2026-10-23"));assert.equal(shiftDate("2026-12-31",1),"2027-01-01");
});
test("hourly recalibration corrects remaining demand without erasing observations",async()=>{
 const {recalibrateIntraday,updateTomorrow}=await import("./analytics/forecast");
 const base=predictDemand([day("2026-10-20",40),day("2026-10-21",40),day("2026-10-22",40)],"2026-10-23")!;
 const observed=day("2026-10-23",30),live=recalibrateIntraday(base,observed,14,30);
 assert.ok(Math.abs(live.intraday.expectedGuests-20)<1e-9);assert.ok(live.intraday.signal>1);assert.ok(live.guests>50);assert.ok(live.guestRange.low>=30);
 assert.ok(live.sales>=observed.sales);assert.ok(Math.abs(live.hours.reduce((a,b)=>a+b,0)-live.guests)<1e-9);
 const before=recalibrateIntraday(base,day("2026-10-23",0),10,0);assert.equal(before.intraday.signal,1);assert.equal(before.guests,base.guests);
 const slow=recalibrateIntraday(base,day("2026-10-23",0),14,30);assert.ok(slow.guests<base.guests);
 const next=updateTomorrow(base,live);assert.ok(next.guests>base.guests);assert.ok(next.todaySignalFactor!<live.intraday.signal);
});
