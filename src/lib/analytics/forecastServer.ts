import {createHash} from "node:crypto";
import type {Prisma} from "@prisma/client";
import {prisma} from "../prisma";
import {todayWorkDate,workDateFor} from "../time";
import {predictDemand,shiftDate,recalibrateIntraday,updateTomorrow,type DayDemand,type DemandForecast} from "./forecast";
type Row=Prisma.CustomerVisitGetPayload<{include:{items:true}}>;
export function dayFingerprint(rows:Row[]){return createHash("sha256").update(JSON.stringify(rows.map(r=>[r.id,r.updatedAt.toISOString(),r.revision,r.status,r.groupSize,r.visitedAt.toISOString(),r.items.map(i=>[i.menuId,i.diet,i.quantity,i.unitPriceRs]).sort()]).sort())).digest("hex");}
export function aggregateDay(date:string,rows:Row[]):DayDemand{
 const hours=Array(24).fill(0),items=new Map<string,DayDemand["items"][number]>();let guests=0,sales=0;
 for(const r of rows){guests+=r.groupSize;hours[Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",hourCycle:"h23"}).format(r.visitedAt))]+=r.groupSize;
  for(const i of r.items){sales+=i.quantity*i.unitPriceRs;if(/packing charge/i.test(i.name))continue;const key=`${i.menuId}:${i.diet}`,v=items.get(key)??{key,name:i.name+(i.category==="Open Items"?" · Open Item":""),quantity:0,water:/^(?:(?:bottled|mineral|drinking|packaged drinking)\s+)?water(?:\s|\(|$)/i.test(i.name)};v.quantity+=i.quantity;items.set(key,v);}
 }
 return {date,guests,groups:rows.length,sales,hours,items:[...items.values()]};
}
export async function forecastContext(db:Prisma.TransactionClient=prisma,today=todayWorkDate()){
 const from=shiftDate(today,-90);
 const [rows,reviews]=await Promise.all([db.customerVisit.findMany({where:{workDate:{gte:from,lte:today},deletedAt:null},include:{items:true}}),db.analyticsDayReview.findMany({where:{date:{gte:from,lte:today}}})]);
 const dates=Array.from({length:91},(_,i)=>shiftDate(from,i));
 const days=dates.map(date=>{const entries=rows.filter(r=>r.workDate===date),review=reviews.find(r=>r.date===date),fingerprint=dayFingerprint(entries),running=entries.filter(r=>r.status!=="COMPLETE").length;
 const status=review && review.fingerprint===fingerprint?review.status:review?"CHANGED":"UNREVIEWED";
 return {...aggregateDay(date,entries),status,running,fingerprint};});
 return {days,training:days.filter(d=>d.status==="COMPLETE" && d.running===0)};
}
export async function saveTomorrowForecast(now=new Date()){
 const today=workDateFor(now),date=shiftDate(today,1);
 return prisma.$transaction(async tx=>{
  const existing=await tx.analyticsForecast.findUnique({where:{date}});if(existing)return existing;
  const context=await forecastContext(tx,today),prediction=predictDemand(context.training,date);if(!prediction)return null;
  return tx.analyticsForecast.upsert({where:{date},create:{date,modelVersion:prediction.modelVersion,forecastJson:JSON.stringify(prediction),createdAt:now},update:{}});
 },{timeout:20000});
}
export function unpackForecast(row:{date:string;createdAt:Date;forecastJson:string}){return {date:row.date,createdAt:row.createdAt.toISOString(),prediction:JSON.parse(row.forecastJson) as DemandForecast};}
export async function saveHourlyForecasts(now=new Date()){
 const today=workDateFor(now),tomorrow=shiftDate(today,1);
 const clock=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(now),[hour,minute]=clock.split(":").map(Number);
 const asOfHour=`${today}T${clock.slice(0,2)}:00+05:30`;
 return prisma.$transaction(async tx=>{
  const existing=await tx.analyticsHourlyForecast.findMany({where:{asOfHour,date:{in:[today,tomorrow]}}});
  if(existing.length===2)return existing;
  const context=await forecastContext(tx,today);
  const base=predictDemand(context.training,today),next=predictDemand(context.training,tomorrow);
  if(!base || !next)return [];
  const day=context.days.find(d=>d.date===today);
  const observedRows=await tx.customerVisit.findMany({where:{workDate:today,deletedAt:null,visitedAt:{lte:now}},include:{items:true}});
  const live=day?.status==="CLOSED"?null:recalibrateIntraday(base,aggregateDay(today,observedRows),hour,minute);
  const predictions=[...(live?[live]:[]),updateTomorrow(next,day?.status==="COMPLETE"?null:live)];
  const saved=[];
  for(const prediction of predictions)saved.push(await tx.analyticsHourlyForecast.upsert({where:{date_asOfHour:{date:prediction.date,asOfHour}},create:{date:prediction.date,asOfHour,forecastJson:JSON.stringify(prediction),createdAt:now},update:{}}));
  return saved;
 },{timeout:20000});
}
const worker=globalThis as typeof globalThis & {analyticsForecastTimer?:ReturnType<typeof setInterval>};
export function startForecastWorker(){
 if(worker.analyticsForecastTimer)return;let running=false;
 const tick=async()=>{if(running)return;running=true;try{
  const now=new Date();await saveHourlyForecasts(now);
  const clock=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(now);
  if(clock>="23:30")await saveTomorrowForecast(now);
 }catch{console.warn("Analytics forecast update failed; will retry.");}finally{running=false;}};
 worker.analyticsForecastTimer=setInterval(()=>void tick(),60000);worker.analyticsForecastTimer.unref();void tick();
}
