export type DayDemand={date:string;guests:number;groups:number;sales:number;hours:number[];items:{key:string;name:string;quantity:number;water:boolean}[]};
export type Method="recent"|"weekday";
export const shiftDate=(date:string,offset:number)=>new Date(Date.parse(`${date}T00:00:00Z`)+offset*86400000).toISOString().slice(0,10);
const weekday=(date:string)=>new Date(`${date}T12:00:00Z`).getUTCDay();
function weighted(days:DayDemand[],date:string,method:Method){
 const weights=days.map(d=>Math.pow(0.5,(Date.parse(date)-Date.parse(d.date))/86400000/21)*(method==="weekday" && weekday(d.date)===weekday(date)?3:1));
 const total=weights.reduce((a,b)=>a+b,0);
 const avg=(fn:(d:DayDemand)=>number)=>days.reduce((n,d,i)=>n+fn(d)*weights[i],0)/total;
 const items=new Map<string,{key:string;name:string;quantity:number;water:boolean}>();
 days.forEach((d,i)=>d.items.forEach(item=>{const row=items.get(item.key)??{...item,quantity:0};row.quantity+=item.quantity*weights[i]/total;items.set(item.key,row);}));
 return {guests:avg(d=>d.guests),groups:avg(d=>d.groups),sales:avg(d=>d.sales),hours:Array.from({length:24},(_,i)=>avg(d=>d.hours[i])),items:[...items.values()].sort((a,b)=>b.quantity-a.quantity)};
}
export function predictDemand(input:DayDemand[],date:string){
 const days=input.filter(d=>d.date<date && d.date>=shiftDate(date,-90)).sort((a,b)=>a.date.localeCompare(b.date));
 if(days.length<3)return null;
 // Each validation prediction sees only earlier days; no future observations leak in.
 const scores=(["recent","weekday"] as Method[]).map(method=>{
  const errors=days.slice(3).map((d,j)=>{const p=weighted(days.slice(0,j+3),d.date,method);return {guests:Math.abs(p.guests-d.guests),sales:Math.abs(p.sales-d.sales)};});
  return {method,errors,mae:errors.length?errors.reduce((s,e)=>s+e.guests,0)/errors.length:null};
 });
 const base=scores[0],candidate=scores[1];
 // Keep the simpler baseline unless there are enough trials and a material improvement.
 const selected=base.errors.length>=5 && candidate.mae!<base.mae!*0.9?candidate:base;
 const p=weighted(days,date,selected.method);
 const spread=(key:"guests"|"sales")=>{
  if(selected.errors.length>=5){const e=selected.errors.map(e=>e[key]).sort((a,b)=>a-b);return Math.max(p[key]*0.25,e[Math.ceil(e.length*0.8)-1]);}
  return Math.max(key==="guests"?10:1000,p[key]*0.5);
 };
 const range=(key:"guests"|"sales")=>({low:Math.max(0,Math.floor(p[key]-spread(key))),high:Math.ceil(p[key]+spread(key))});
 return {date,modelVersion:"adaptive-v1",method:selected.method,trainingDates:days.map(d=>d.date),trainingDays:days.length,validationDays:selected.errors.length,guestMAE:selected.mae,salesMAE:selected.errors.length?selected.errors.reduce((s,e)=>s+e.sales,0)/selected.errors.length:null,rangeBasis:selected.errors.length>=5?"Past absolute errors; planning range, not a calibrated confidence interval":"Limited history: a broad planning range, not a confidence interval",...p,guestRange:range("guests"),salesRange:range("sales"),scores:scores.map(s=>({method:s.method,guestMAE:s.mae}))};
}
export type DemandForecast=NonNullable<ReturnType<typeof predictDemand>>;
// Shrink an observed pace error toward the baseline so one early table does not
// multiply the whole day. Bounds protect a sparse first version from extremes.
export function recalibrateIntraday(base:DemandForecast,observed:DayDemand,hour:number,minute:number){
 const elapsed=(values:number[])=>values.reduce((n,v,i)=>n+v*(i<hour?1:i===hour?minute/60:0),0);
 const expected=elapsed(base.hours),share=base.guests>0?Math.min(1,expected/base.guests):0;
 const reliability=expected/(expected+15);
 const signal=expected>0?Math.max(0.5,Math.min(2,1+reliability*(observed.guests/expected-1))):1;
 const salesExpected=base.sales*share,salesSignal=salesExpected>0?Math.max(0.5,Math.min(2,1+reliability*(observed.sales/salesExpected-1))):1;
 const remainingGuests=Math.max(0,base.guests-expected)*signal;
 const guests=observed.guests+remainingGuests,sales=observed.sales+base.sales*(1-share)*salesSignal;
 const observedItems=new Map(observed.items.map(i=>[i.key,i]));
 const items=base.items.map(i=>({...i,quantity:(observedItems.get(i.key)?.quantity??0)+i.quantity*(1-share)*signal}));
 for(const i of observed.items)if(!base.items.some(b=>b.key===i.key))items.push(i);
 const width=(key:"guests"|"sales")=>Math.max(key==="guests"?5:500,(key==="guests"?base.guestRange.high-base.guestRange.low:base.salesRange.high-base.salesRange.low)/2*Math.sqrt(1-share));
 return {...base,guests,sales,groups:observed.groups+base.groups*(1-share)*signal,items:items.sort((a,b)=>b.quantity-a.quantity),hours:base.hours.map((v,i)=>i<hour?observed.hours[i]:i===hour?observed.hours[i]+v*(1-minute/60)*signal:v*signal),guestRange:{low:Math.max(observed.guests,Math.floor(guests-width("guests"))),high:Math.ceil(guests+width("guests"))},salesRange:{low:Math.max(observed.sales,Math.floor(sales-width("sales"))),high:Math.ceil(sales+width("sales"))},intraday:{observedGuests:observed.guests,recordedSales:observed.sales,expectedGuests:expected,guestPaceError:observed.guests-expected,remainingGuests,signal,reliability},rangeBasis:"Hourly planning range; running bill values are provisional, and missing entries can bias the estimate"};
}
export type HourlyForecast=DemandForecast & {intraday?:ReturnType<typeof recalibrateIntraday>["intraday"];todaySignalFactor?:number};
export function updateTomorrow(base:DemandForecast,live:ReturnType<typeof recalibrateIntraday>|null):HourlyForecast{
 // Today's provisional signal affects tomorrow weakly; complete history remains dominant.
 const factor=live?1+0.25*live.intraday.reliability*(live.intraday.signal-1):1;
 return {...base,todaySignalFactor:factor,guests:base.guests*factor,groups:base.groups*factor,sales:base.sales*factor,hours:base.hours.map(n=>n*factor),items:base.items.map(i=>({...i,quantity:i.quantity*factor})),guestRange:{low:Math.floor(base.guestRange.low*factor),high:Math.ceil(base.guestRange.high*factor)},salesRange:{low:Math.floor(base.salesRange.low*factor),high:Math.ceil(base.salesRange.high*factor)}};
}
