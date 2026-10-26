import test from "node:test";
import assert from "node:assert/strict";
import {rollingDay,type HourDay} from "./analytics/rollingForecast";
const day=(date:string,value:number):HourDay=>({date,guests:Array(24).fill(value),sales:Array(24).fill(value*100)});
test("one earlier day is sufficient and future days never train the target",()=>{
 const a=day("2026-10-20",10),b=day("2026-10-21",20);
 assert.equal(rollingDay([],b),null);
 assert.deepEqual(rollingDay([a],b),rollingDay([a,b,day("2026-10-22",999)],b));
 assert.equal(rollingDay([a],b)!.hours[0].guests,10);
});
test("hour predictions only see earlier observations and sales have their own hourly profile",()=>{
 const a=day("2026-10-20",10),b=day("2026-10-21",20);
 a.sales[8]=5000;
 const p=rollingDay([a],b)!;
 const altered=day(b.date,20);altered.guests[8]=999;altered.sales[8]=99999;
 const q=rollingDay([a],altered)!;
 assert.equal(p.hours[8].guests,q.hours[8].guests);
 assert.equal(p.hours[8].sales,q.hours[8].sales);
 assert.notEqual(p.hours[9].sales,q.hours[9].sales);
 assert.equal(p.hours[0].guestError,10);
});
test("current hour is not scored and future actuals cannot influence remaining predictions",()=>{
 const a=day("2026-10-20",10),b=day("2026-10-21",12),p=rollingDay([a],b,8)!;
 assert.equal(p.hours[7].state,"past");assert.equal(p.hours[8].guestError,null);assert.equal(p.hours[9].actualGuests,null);
 const changed=day(b.date,12);changed.guests[10]=999;changed.sales[10]=99999;
 const q=rollingDay([a],changed,8)!;
 assert.deepEqual(p.hours.slice(9),q.hours.slice(9));
 assert.ok(p.guestMAE!==null);
});
