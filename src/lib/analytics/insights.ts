import type { ItemSnapshot } from "./validation";
export type InsightVisit={id:string;visitedAt:string;workDate:string;groupSize:number;status:string;visitType:string;unavailable:string[];items:ItemSnapshot[];tableLabel?:string;weather?:{temperatureC?:number;precipitationMm?:number;humidity?:number;condition?:string;reason?:string}};
export type Period="Daily"|"Weekly"|"Monthly";
const iso=(d:Date)=>d.toISOString().slice(0,10);
export function insightRange(date:string,period:Period){
 const start=new Date(`${date}T00:00:00Z`),end=new Date(start);
 if(period==="Weekly"){start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);end.setTime(+start);end.setUTCDate(end.getUTCDate()+6);}
 if(period==="Monthly"){start.setUTCDate(1);end.setUTCMonth(end.getUTCMonth()+1,0);}
 return {from:iso(start),to:iso(end)};
}
type Bucket={visits:number;guests:number;sales:number};
const empty=():Bucket=>({visits:0,guests:0,sales:0});
export function buildInsights(input:InsightVisit[],from:string,to:string){
 const visits=[...new Map(input.filter(v=>v.workDate>=from&&v.workDate<=to).map(v=>[v.id,v])).values()];
 const days=new Map<string,Bucket>(),hours=Array.from({length:24},empty);
 const dishes=new Map<string,{key:string;name:string;quantity:number;sales:number;hours:number[]}>();
 const water={quantity:0,sales:0,items:new Map<string,{key:string;name:string;quantity:number;sales:number}>()};
 const unavailable=new Map<string,{name:string;visits:number}>();
 let sales=0,runningValue=0,completed=0,completedGuests=0,guests=0;
 const customerTypes={FIRST:0,REPEAT:0,UNKNOWN:0};
 for(const v of visits){
  const value=v.items.reduce((n,i)=>n+i.quantity*i.unitPriceRs,0),done=v.status==="COMPLETE";
  const hour=Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",hourCycle:"h23"}).format(new Date(v.visitedAt)));
  const d=days.get(v.workDate)??empty();d.visits++;d.guests+=v.groupSize;if(done)d.sales+=value;days.set(v.workDate,d);
  hours[hour].visits++;hours[hour].guests+=v.groupSize;if(done)hours[hour].sales+=value;
  guests+=v.groupSize;
  if(done){sales+=value;completed++;completedGuests+=v.groupSize;}else runningValue+=value;
  customerTypes[v.visitType==="FIRST"?"FIRST":v.visitType==="REPEAT"?"REPEAT":"UNKNOWN"]++;
  for(const key of new Set(v.unavailable.map(s=>s.trim().toLowerCase()).filter(Boolean))){const u=unavailable.get(key)??{name:key,visits:0};u.visits++;unavailable.set(key,u);}
  if(done)for(const item of v.items){
   if(item.menuId==="open-packing-charges" || /packing charge/i.test(item.name))continue;
   if(/^(?:(?:bottled|mineral|packaged drinking|drinking)\s+)?water(?:\s|\(|$)/i.test(item.name.trim())){
    const row=water.items.get(item.menuId)??{key:item.menuId,name:item.name,quantity:0,sales:0};
    row.quantity+=item.quantity;row.sales+=item.quantity*item.unitPriceRs;
    water.items.set(item.menuId,row);water.quantity+=item.quantity;water.sales+=item.quantity*item.unitPriceRs;continue;
   }
   const key=`${item.menuId}:${item.diet}`,row=dishes.get(key)??{key,name:`${item.name}${item.category==="Open Items"?" · Open Item":""} (${item.diet==="NON_VEG"?"non-veg":"veg"})`,quantity:0,sales:0,hours:Array(24).fill(0)};
   row.quantity+=item.quantity;row.sales+=item.quantity*item.unitPriceRs;row.hours[hour]+=item.quantity;dishes.set(key,row);
  }
 }
 const daily=[];for(let t=Date.parse(from);t<=Date.parse(to);t+=86400000){const date=iso(new Date(t));daily.push({date,data:days.get(date)??null});}
 const weekdays=Array.from({length:7},(_,i)=>({day:(i+1)%7,recordedDays:0,...empty()}));
 for(const [date,d] of days){const row=weekdays[(new Date(date).getUTCDay()+6)%7];row.recordedDays++;row.visits+=d.visits;row.guests+=d.guests;row.sales+=d.sales;}
 const peak=Math.max(...hours.map(h=>h.guests));
 return {water:{quantity:water.quantity,sales:water.sales,items:[...water.items.values()].sort((a,b)=>a.name.localeCompare(b.name))},visits:visits.length,guests,sales,completed,running:visits.length-completed,runningValue,recordedDays:days.size,averageBill:completed?sales/completed:null,spendPerGuest:completedGuests?sales/completedGuests:null,hours,daily,weekdays,peakHours:peak?hours.flatMap((h,i)=>h.guests===peak?[i]:[]):[],top:[...dishes.values()].sort((a,b)=>b.quantity-a.quantity||b.sales-a.sales||a.key.localeCompare(b.key)).slice(0,5),unavailable:[...unavailable.values()].sort((a,b)=>b.visits-a.visits||a.name.localeCompare(b.name)).slice(0,5),customerTypes};
}
