import { NextRequest,NextResponse } from "next/server";
import { requireAnalytics as requireAdmin } from "@/lib/analytics/auth";
import { prisma } from "@/lib/prisma";
import { validDate } from "@/lib/analytics/calendar";
import { serializeVisit,privateHeaders,badRequest } from "@/lib/analytics/server";
import { summarizeVisits } from "@/lib/analytics/report";
import { csvCell } from "@/lib/reporting";
export async function GET(req:NextRequest){
 if(!await requireAdmin())return NextResponse.json({error:"Analytics access required."},{status:403});
 const from=req.nextUrl.searchParams.get("from"),to=req.nextUrl.searchParams.get("to");
 if(!validDate(from)||!validDate(to)||from>to||Date.parse(to)-Date.parse(from)>92*86400000)return badRequest(new Error("Choose a date range of up to 93 days."));
 const [rows,days]=await Promise.all([prisma.customerVisit.findMany({where:{workDate:{gte:from,lte:to},deletedAt:null},include:{items:true},orderBy:{visitedAt:"asc"},take:10001}),prisma.analyticsCalendarDay.findMany({where:{date:{gte:from,lte:to}}})]);
 if(rows.length>10000)return badRequest(new Error("Too many visits. Select a shorter date range."));
 const visits=rows.map(v=>serializeVisit(v,days.find(d=>d.date===v.workDate)));
 if(req.nextUrl.searchParams.get("format")==="csv"){
  const header=["Visit ID","Visit time (IST)","Date","Weekday","Weekend","Month period","Group size","Group type","Male count","Female count","Not recorded count","Visit type","Discovery","Other source","Table/reference","Status","Unavailable items","Feedback","Holiday","Festival/holiday names","Calendar coverage","Weather status","Weather observation time (UTC)","Temperature C","Precipitation mm","Humidity percent","Weather condition","Item","Diet","Quantity","Unit price INR","Item value INR","Favourite"];
  const lines=visits.flatMap(v=>(v.items.length?v.items:[null]).map(item=>[v.id,new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"short",timeStyle:"medium"}).format(v.visitedAt),v.workDate,["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][v.weekday],String(v.isWeekend),v.monthPeriod,v.groupSize,v.groupType,v.maleCount,v.femaleCount,v.unrecordedCount,v.visitType,v.discovery,v.discoveryOther,v.tableLabel,v.status,v.unavailable.join("; "),v.feedback,String(v.calendar.isHoliday),v.calendar.names.join("; "),v.calendar.source,v.weather.status,v.weather.observedAt||"",v.weather.temperatureC??"",v.weather.precipitationMm??"",v.weather.humidity??"",v.weather.condition||"",item?.name||"",item?.diet||"",item?.quantity??"",item?.unitPriceRs??"",item?item.quantity*item.unitPriceRs:"",item?String(item.favourite):""].map(csvCell).join(",")));
  return new NextResponse("\ufeff"+[header.map(csvCell).join(","),...lines].join("\r\n"),{headers:{...privateHeaders,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="customer-visits-${from}-to-${to}.csv"`}});
 }
 return NextResponse.json({...summarizeVisits(visits),entries:visits},{headers:privateHeaders});
}
