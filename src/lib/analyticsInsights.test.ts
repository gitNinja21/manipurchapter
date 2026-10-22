import test from "node:test";
import assert from "node:assert/strict";
import {buildInsights,insightRange,type InsightVisit} from "./analytics/insights";
const item=(menuId:string,quantity=1,price=100)=>({menuId,name:menuId,category:menuId.startsWith("open-")?"Open Items":"Menu",diet:"VEG",quantity,unitPriceRs:price,favourite:false});
const visit=(id:string,date:string,patch:Partial<InsightVisit>={}):InsightVisit=>({id,workDate:date,visitedAt:`${date}T07:30:00Z`,groupSize:2,status:"COMPLETE",visitType:"FIRST",unavailable:[],items:[item("rice")],...patch});
test("daily weekly monthly ranges are calendar-aligned, including leap years and year boundaries",()=>{
 assert.deepEqual(insightRange("2026-10-18","Weekly"),{from:"2026-10-12",to:"2026-10-18"});
 assert.deepEqual(insightRange("2026-01-01","Weekly"),{from:"2025-12-29",to:"2026-01-04"});
 assert.deepEqual(insightRange("2024-02-20","Monthly"),{from:"2024-02-01",to:"2024-02-29"});
 assert.deepEqual(insightRange("2026-10-17","Daily"),{from:"2026-10-17",to:"2026-10-17"});
});
test("insights separate running bills, count visits once, use IST hours and exclude packing from ranking",()=>{
 const a=visit("a","2026-10-17",{items:[item("rice",2),item("open-pork",0.5,400),item("open-packing-charges",0.5,100)],unavailable:[" Duck ","duck"]});
 const b=visit("b","2026-10-17",{status:"OPEN",groupSize:4,visitType:"NOT_SURE",items:[item("running",10)],unavailable:["DUCK"]});
 const c=visit("c","2026-10-18",{visitedAt:"2026-10-17T19:00:00Z",visitType:"REPEAT",items:[item("fish",3)]});
 const d=buildInsights([a,a,b,c],"2026-10-17","2026-10-19");
 assert.equal(d.visits,3);assert.equal(d.guests,8);assert.equal(d.sales,750);assert.equal(d.runningValue,1000);
 assert.equal(d.averageBill,375);assert.equal(d.spendPerGuest,187.5);assert.equal(d.recordedDays,2);
 assert.equal(d.hours[13].guests,6);assert.equal(d.hours[0].guests,2);assert.equal(d.hours[13].sales,450);
 assert.equal(d.daily[2].data,null);assert.deepEqual(d.peakHours,[13]);
 assert.deepEqual(d.top.map(i=>i.key),["fish:VEG","rice:VEG","open-pork:VEG"]);
 assert.equal(d.top[2].quantity,0.5);assert.ok(d.top[2].name.includes("Open Item"));
 assert.deepEqual(d.unavailable,[{name:"duck",visits:2}]);assert.deepEqual(d.customerTypes,{FIRST:1,REPEAT:1,UNKNOWN:1});
});
test("weekday averages use recorded occurrences, and empty days remain missing",()=>{
 const d=buildInsights([visit("a","2026-10-03"),visit("b","2026-10-10",{groupSize:4})],"2026-10-01","2026-10-31");
 const sat=d.weekdays.find(w=>w.day===6)!;assert.equal(sat.recordedDays,2);assert.equal(sat.guests/sat.recordedDays,3);
 assert.equal(d.daily.length,31);assert.equal(d.daily.filter(d=>d.data===null).length,29);
 const empty=buildInsights([],"2026-10-01","2026-10-01");assert.equal(empty.averageBill,null);assert.equal(empty.spendPerGuest,null);assert.equal(empty.recordedDays,0);assert.deepEqual(empty.peakHours,[]);
});
test("top five excludes bottled water while separate water totals retain size and bill status",()=>{
 const small={...item("water-small",8,15),name:"Bottled Water (0.5 litre)"};
 const large={...item("water-large",3,30),name:"Bottled Water (1 litre)"};
 const food=Array.from({length:6},(_,i)=>item(`dish-${i}`,6-i,100));
 const visits=[visit("a","2026-10-17",{items:[small,large,...food,item("Lemon Water",0.5,100)]}),visit("b","2026-10-18",{items:[small]}),visit("running","2026-10-17",{status:"OPEN",items:[large]})];
 const daily=buildInsights(visits,"2026-10-17","2026-10-17");
 assert.equal(daily.top.length,5);assert.deepEqual(daily.top.map(d=>d.key),food.slice(0,5).map(d=>`${d.menuId}:VEG`));
 assert.equal(daily.water.quantity,11);assert.equal(daily.water.sales,210);assert.equal(daily.water.items.length,2);
 assert.equal(daily.sales,2360);assert.equal(daily.runningValue,90);
 const weekly=buildInsights(visits,"2026-10-12","2026-10-18");assert.equal(weekly.water.quantity,19);assert.equal(weekly.water.sales,330);
 const lemon=buildInsights([visit("lemon","2026-10-17",{items:[item("Lemon Water")]})],"2026-10-17","2026-10-17");assert.equal(lemon.top.length,1);assert.equal(lemon.water.quantity,0);
});
