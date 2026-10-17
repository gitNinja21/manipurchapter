import test from "node:test";
import assert from "node:assert/strict";
import { MENU, OPEN_ITEMS } from "./analytics/menu";
import { validateVisit } from "./analytics/validation";
import { visitTime,calendarDay } from "./analytics/calendar";
import { visitWeather } from "./analytics/weather";
import { summarizeVisits } from "./analytics/report";
const base={maleCount:2,femaleCount:1,unrecordedCount:0,visitType:"NOT_SURE",discovery:"NOT_ASKED",unavailable:[],items:[],status:"OPEN"};
test("menu catalog preserves PDF prices and size variants",()=>{
 assert.equal(new Set(MENU.map(i=>i.id)).size,MENU.length);
 for(const [name,price] of [["Tangkhul Pork Jumbo Feast Thali",585],["Tangkhul Mixed Thali",525],["Meitei Veg Thali Regular",315],["Rice (small)",50],["Rice (big)",100],["Bottled Water (0.5 litre)",15],["Bottled Water (1 litre)",30],["Mocktail Strawberry Bleu",190]] as const) assert.equal(MENU.find(i=>i.name===name)?.price,price);
 assert.equal(MENU.filter(i=>i.diet==="CHOICE").length,3);
});
test("server calculates menu prices, quantities and group type; edits preserve saved prices",()=>{
 const menu=MENU[0];const line={menuId:menu.id,diet:"NON_VEG",quantity:2,favourite:true,unitPriceRs:1};
 const result=validateVisit({...base,items:[line]});assert.equal(result.items[0].unitPriceRs,585);assert.equal(result.data.groupType,"MIXED");assert.equal(result.data.groupSize,3);
 assert.equal(validateVisit({...base,items:[line]},[{...result.items[0],unitPriceRs:555}]).items[0].unitPriceRs,555);
 for(const body of [{...base,maleCount:-1},{...base,maleCount:0,femaleCount:0},{...base,items:[{...line,quantity:0.25}]},{...base,items:[{...line,diet:"VEG"}]},{...base,items:[line,line]},{...base,items:[{...line,menuId:"invented"}]},{...base,discovery:"OTHER"}]) assert.throws(()=>validateVisit(body));
});
test("visit dates and calendar labels use IST and preserve unknown calendar coverage",()=>{
 assert.deepEqual(visitTime(new Date("2026-10-16T19:00:00Z")),{workDate:"2026-10-17",weekday:6,isWeekend:true,monthPeriod:"MIDDLE"});
 assert.equal(visitTime(new Date("2026-10-31T10:00:00Z")).monthPeriod,"END");
 assert.equal(calendarDay("2026-10-18").isHoliday,true);
 assert.equal(calendarDay("2027-10-18").covered,false);
 assert.deepEqual(calendarDay("2027-10-18",{namesJson:'["Local festival"]',isHoliday:false}).names,["Local festival"]);
});
test("weather saves a timestamped current snapshot and handles missing, stale and failed responses",async()=>{
 const previous=process.env.WEATHERAPI_KEY,at=new Date("2026-10-16T12:00:00Z");
 try{
 delete process.env.WEATHERAPI_KEY;assert.equal((await visitWeather(at)).status,"NOT_CONFIGURED");
 process.env.WEATHERAPI_KEY="test";
 const response=(epoch:number)=>async()=>new Response(JSON.stringify({current:{last_updated_epoch:epoch,temp_c:29,precip_mm:1.2,humidity:80,condition:{text:"Light rain"}}}));
 const good=await visitWeather(at,response(+at/1000-600));assert.equal(good.status,"OK");assert.equal(good.precipitationMm,1.2);
 assert.equal((await visitWeather(at,response(+at/1000-3600))).status,"UNAVAILABLE");
 assert.equal((await visitWeather(at,async()=>{throw new Error("Network down");})).status,"UNAVAILABLE");
 }finally{if(previous===undefined)delete process.env.WEATHERAPI_KEY;else process.env.WEATHERAPI_KEY=previous;}
});
test("analytics sums item quantity once and separates missing weather from dry weather",()=>{
 const items=validateVisit({...base,items:[{menuId:MENU[0].id,diet:"NON_VEG",quantity:2,favourite:true}]}).items;
 const summary=summarizeVisits([{workDate:"2026-10-18",weekday:0,isWeekend:true,monthPeriod:"MIDDLE",groupSize:3,status:"OPEN",items,weather:{status:"UNAVAILABLE"},calendar:{names:[],isHoliday:false}}]);
 assert.equal(summary.valueRs,1170);assert.equal(summary.guests,3);assert.equal(summary.items[0].quantity,2);assert.equal(summary.openVisits,1);
 assert.ok(summary.contexts.some(c=>c.label==="Weather unavailable"));assert.ok(!summary.contexts.some(c=>c.label==="No rain reported"));
});

test("half menu quantities and listed open half prices are validated on the server",()=>{
 const half=validateVisit({...base,items:[{menuId:MENU[0].id,diet:"NON_VEG",quantity:0.5,favourite:false,unitPriceRs:1}]}).items[0];
 assert.equal(half.quantity*half.unitPriceRs,292.5);
 for(const item of OPEN_ITEMS){
  const line={menuId:item.id,diet:item.diet==="CHOICE"?"VEG":item.diet,quantity:0.5,favourite:false,unitPriceRs:1};
  const saved=validateVisit({...base,items:[line]}).items[0];
  assert.equal(saved.quantity,0.5);assert.equal(saved.quantity*saved.unitPriceRs,item.price);
  assert.throws(()=>validateVisit({...base,items:[{...line,quantity:1}]}),/Menu Items/);
 }
 for(const [name,price] of [["Snacks Platter",595],["Sareng Fish Thali",475],["Chicken Stew Thali",415]] as const)assert.equal(MENU.find(i=>i.name===name)?.price,price);
 assert.equal(MENU.length,71);assert.equal(OPEN_ITEMS.length,13);
 assert.equal(MENU.some(i=>i.name==="Eromba"),false);
 const summary=summarizeVisits([{workDate:"2026-10-18",weekday:0,isWeekend:true,monthPeriod:"MIDDLE",groupSize:3,status:"OPEN",items:[half],weather:{status:"UNAVAILABLE"},calendar:{names:[],isHoliday:false}}]);
 assert.equal(summary.valueRs,292.5);assert.equal(summary.items[0].quantity,0.5);
});
