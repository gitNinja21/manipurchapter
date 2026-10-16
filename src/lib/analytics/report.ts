import type { ItemSnapshot } from "./validation";
export type ReportVisit={workDate:string;weekday:number;isWeekend:boolean;monthPeriod:string;groupSize:number;status:string;items:ItemSnapshot[];weather:{status:string;precipitationMm?:number};calendar:{names:string[];isHoliday:boolean}};
export function summarizeVisits(visits:ReportVisit[]){
 const itemTotals=new Map<string,{name:string;diet:string;quantity:number;valueRs:number;favourites:number}>();
 const daily=new Map<string,{date:string;visits:number;guests:number;valueRs:number}>();
 const context=new Map<string,{label:string;visits:number;valueRs:number}>();
 let valueRs=0,guests=0;
 for(const visit of visits){
  const total=visit.items.reduce((n,i)=>n+i.unitPriceRs*i.quantity,0);valueRs+=total;guests+=visit.groupSize;
  const day=daily.get(visit.workDate) || {date:visit.workDate,visits:0,guests:0,valueRs:0};day.visits++;day.guests+=visit.groupSize;day.valueRs+=total;daily.set(day.date,day);
  for(const item of visit.items){const key=`${item.menuId}:${item.diet}`,entry=itemTotals.get(key)||{name:item.name,diet:item.diet,quantity:0,valueRs:0,favourites:0};entry.quantity+=item.quantity;entry.valueRs+=item.quantity*item.unitPriceRs;entry.favourites+=Number(item.favourite);itemTotals.set(key,entry);}
  const labels=[["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][visit.weekday],visit.isWeekend?"Weekend":"Weekday",`Month ${visit.monthPeriod.toLowerCase()}`,visit.weather.status!=="OK"?"Weather unavailable":(visit.weather.precipitationMm??0)>0?"Rain reported":"No rain reported",...(visit.calendar.isHoliday?["Holiday"]:[])];
  for(const label of labels){const c=context.get(label)||{label,visits:0,valueRs:0};c.visits++;c.valueRs+=total;context.set(label,c);}
 }
 return {visits:visits.length,guests,valueRs,openVisits:visits.filter(v=>v.status==="OPEN").length,items:[...itemTotals.values()].sort((a,b)=>b.quantity-a.quantity),daily:[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date)),contexts:[...context.values()]};
}
