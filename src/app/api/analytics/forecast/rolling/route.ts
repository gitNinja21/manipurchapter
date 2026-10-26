import {NextRequest,NextResponse} from "next/server";
import {requireAnalytics} from "@/lib/analytics/auth";
import {prisma} from "@/lib/prisma";
import {todayWorkDate} from "@/lib/time";
import {validDate} from "@/lib/analytics/calendar";
import {privateHeaders,badRequest} from "@/lib/analytics/server";
import {shiftDate} from "@/lib/analytics/forecast";
import {rollingDay,type HourDay} from "@/lib/analytics/rollingForecast";
export async function GET(req:NextRequest){
 if(!await requireAnalytics())return NextResponse.json({error:"Analytics access required."},{status:403});
 try{
  const today=todayWorkDate(),from=req.nextUrl.searchParams.get("from")||today,to=req.nextUrl.searchParams.get("to")||from;
  if(!validDate(from)||!validDate(to)||from>to||to>today||from<shiftDate(to,-90))throw Error("Choose a date or a range of up to 91 days, ending today or earlier.");
  const single=from===to,start=single?shiftDate(from,-90):from;
  const rows=await prisma.customerVisit.findMany({where:{workDate:{gte:start,lte:to},deletedAt:null,visitedAt:{lte:new Date()}},include:{items:true}});
  const days=new Map<string,HourDay>();
  const formatter=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",hourCycle:"h23"});
  for(const row of rows){const day=days.get(row.workDate)??{date:row.workDate,guests:Array(24).fill(0),sales:Array(24).fill(0)},hour=Number(formatter.format(row.visitedAt));day.guests[hour]+=row.groupSize;day.sales[hour]+=row.items.reduce((n,i)=>n+i.quantity*i.unitPriceRs,0);days.set(day.date,day);}
  const history=[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)),results=[],missing=[];
  for(let date=single?from:shiftDate(from,1);date<=to;date=shiftDate(date,1)){
   const actual=days.get(date);
   if(!actual&&date!==today){missing.push(date);continue;}
   const result=rollingDay(history,actual??{date,guests:Array(24).fill(0),sales:Array(24).fill(0)},date===today?Number(formatter.format(new Date())):24);
   if(result)results.push(result);else missing.push(date);
  }
  return NextResponse.json({today,from,to,results,missing,trainingStart:start,updatedAt:new Date().toISOString()},{headers:privateHeaders});
 }catch(e){return badRequest(e);}
}
