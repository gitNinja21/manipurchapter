import {NextRequest,NextResponse} from "next/server";
import {requireAnalytics} from "@/lib/analytics/auth";
import {prisma} from "@/lib/prisma";
import {todayWorkDate} from "@/lib/time";
import {calendarDay,validDate} from "@/lib/analytics/calendar";
import {privateHeaders,badRequest} from "@/lib/analytics/server";
import {shiftDate} from "@/lib/analytics/forecast";
import {rollingDay,type HourDay} from "@/lib/analytics/rollingForecast";
import {parseWeather,type HourWeather} from "@/lib/analytics/forecastFeatures";
import {forecastWeather} from "@/lib/analytics/forecastWeather";
export async function GET(req:NextRequest){
 if(!await requireAnalytics())return NextResponse.json({error:"Analytics access required."},{status:403});
 try{
  const today=todayWorkDate(),from=req.nextUrl.searchParams.get("from")||today,to=req.nextUrl.searchParams.get("to")||from;
  if(!validDate(from)||!validDate(to)||from>to||to>today||from<shiftDate(to,-90))throw Error("Choose a date or a range of up to 91 days, ending today or earlier.");
  const single=from===to,start=single?shiftDate(from,-90):from;
  const [rows,calendar,liveWeather]=await Promise.all([prisma.customerVisit.findMany({where:{workDate:{gte:start,lte:to},deletedAt:null,visitedAt:{lte:new Date()}},include:{items:true}}),prisma.analyticsCalendarDay.findMany({where:{date:{gte:start,lte:to}}}),to===today?forecastWeather(today):Promise.resolve({hours:[],status:"Historical weather uses earlier-hour observations only; archived forecasts are unavailable."})]);
  const days=new Map<string,HourDay>();
  const formatter=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",hourCycle:"h23"});
  const weatherBuckets=new Map<string,Map<string,HourWeather>>();
  function emptyDay(date:string):HourDay{const c=calendarDay(date,calendar.find(d=>d.date===date));return {date,guests:Array(24).fill(0),sales:Array(24).fill(0),weather:Array(24).fill(null),complete:true,holiday:c.covered?c.isHoliday:undefined,festival:c.covered?c.names.length>0:undefined};}
  for(const row of rows){
   const day=days.get(row.workDate)??emptyDay(row.workDate),hour=Number(formatter.format(row.visitedAt));
   day.guests[hour]+=row.groupSize;day.sales[hour]+=row.items.reduce((n,i)=>n+i.quantity*i.unitPriceRs,0);if(row.status!=="COMPLETE")day.complete=false;
   try{const w=JSON.parse(row.weatherJson);const parsed=w.status==="OK"?parseWeather({temperature:w.temperatureC,rain:w.precipitationMm,humidity:w.humidity}):null;
    // A snapshot becomes available only when the visit is recorded. Do not
    // move its availability backwards to the provider observation timestamp.
    const observed=new Date(w.observedAt);const observedDate=Number.isFinite(+observed)?new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(observed):"";
    if(parsed&&observedDate===row.workDate){const h=hour,key=`${row.workDate}:${h}`,bucket=weatherBuckets.get(key)??new Map<string,HourWeather>();bucket.set(w.observedAt,parsed);weatherBuckets.set(key,bucket);}
   }catch{/* Old or missing snapshots remain unknown. */}
   days.set(day.date,day);
  }
  for(const day of days.values())for(let h=0;h<24;h++){const samples=[...(weatherBuckets.get(`${day.date}:${h}`)?.values()??[])];if(samples.length)day.weather![h]={temperature:samples.reduce((s,w)=>s+w.temperature,0)/samples.length,rain:samples.reduce((s,w)=>s+w.rain,0)/samples.length,humidity:samples.reduce((s,w)=>s+w.humidity,0)/samples.length};}
  const history=[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)),results=[],missing=[];
  for(let date=single?from:shiftDate(from,1);date<=to;date=shiftDate(date,1)){
   const actual=days.get(date);
   if(!actual&&date!==today){missing.push(date);continue;}
   const result=rollingDay(history,actual??emptyDay(date),date===today?Number(formatter.format(new Date())):24,{weatherForecast:date===today?liveWeather.hours:undefined});
   if(result)results.push(result);else missing.push(date);
  }
  return NextResponse.json({today,from,to,results,missing,trainingStart:start,weatherStatus:liveWeather.status,incompleteDates:history.filter(d=>d.date<today&&d.complete===false).map(d=>d.date),updatedAt:new Date().toISOString()},{headers:privateHeaders});
 }catch(e){return badRequest(e);}
}
