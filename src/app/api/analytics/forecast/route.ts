import {NextRequest,NextResponse} from "next/server";
import {requireAnalytics} from "@/lib/analytics/auth";
import {prisma} from "@/lib/prisma";
import {todayWorkDate} from "@/lib/time";
import {validDate} from "@/lib/analytics/calendar";
import {privateHeaders,badRequest} from "@/lib/analytics/server";
import {predictDemand,shiftDate} from "@/lib/analytics/forecast";
import {forecastContext,saveHourlyForecasts,saveTomorrowForecast,unpackForecast,dayFingerprint} from "@/lib/analytics/forecastServer";
export async function GET(){
 if(!await requireAnalytics())return NextResponse.json({error:"Analytics access required."},{status:403});
 const today=todayWorkDate(),tomorrow=shiftDate(today,1),context=await forecastContext(prisma,today);
 const rows=await prisma.analyticsForecast.findMany({where:{date:{gte:shiftDate(today,-90),lte:tomorrow}},orderBy:{date:"desc"}});
 const hourlyRows=await prisma.analyticsHourlyForecast.findMany({where:{date:{gte:shiftDate(today,-7),lte:tomorrow}},orderBy:{createdAt:"desc"},take:400});
 const hourlyHistory=hourlyRows.map(r=>{const actual=context.days.find(d=>d.date===r.date);return {...unpackForecast(r),asOfHour:r.asOfHour,actual:actual?.status==="COMPLETE"?actual:null};});
 const todayForecast=hourlyHistory.find(r=>r.date===today)??null,tomorrowForecast=hourlyHistory.find(r=>r.date===tomorrow)??null;
 const saved=rows.find(r=>r.date===tomorrow);
 const history=rows.filter(r=>r.date<=today).map(r=>{const row=unpackForecast(r),actual=context.days.find(d=>d.date===r.date);return {...row,actual:actual?.status==="COMPLETE"?actual:null,status:actual?.status??"UNREVIEWED"};});
 return NextResponse.json({today,tomorrow,todayForecast,tomorrowForecast,hourlyHistory,saved:saved?unpackForecast(saved):null,preview:predictDemand(context.training,tomorrow),days:context.days.map(({date,status,running,guests,groups,sales,fingerprint})=>({date,status,running,guests,groups,sales,fingerprint})).reverse(),history},{headers:privateHeaders});
}
export async function POST(req:NextRequest){
 const actor=await requireAnalytics();if(!actor)return NextResponse.json({error:"Analytics access required."},{status:403});
 try{
  const body=await req.json();
  if(body.action==="UPDATE"){const updates=await saveHourlyForecasts();if(!updates.length)throw new Error("Confirm at least three prior complete trading days to start hourly forecasts.");return NextResponse.json({ok:true},{headers:privateHeaders});}
  if(body.action==="SAVE"){
   const saved=await saveTomorrowForecast();if(!saved)throw new Error("Confirm at least three complete trading days before saving a forecast.");
   return NextResponse.json({saved:unpackForecast(saved)},{headers:privateHeaders});
  }
  const today=todayWorkDate();
  if(body.action!=="REVIEW" || !validDate(body.date) || body.date>today || body.date<shiftDate(today,-90) || !["COMPLETE","CLOSED"].includes(body.status) || body.confirm!==true || typeof body.fingerprint!=="string")throw new Error("Choose a date within the last 90 days and confirm its completeness.");
  await prisma.$transaction(async tx=>{
   const rows=await tx.customerVisit.findMany({where:{workDate:body.date,deletedAt:null},include:{items:true}});
   const fingerprint=dayFingerprint(rows);if(body.fingerprint!==fingerprint)throw new Error("Visits changed. Refresh and review the day again.");
   if(rows.some(r=>r.status!=="COMPLETE"))throw new Error("Complete or resolve all running bills first.");
   if(body.status==="CLOSED" && rows.length)throw new Error("A day with recorded visits cannot be marked closed.");
   const data={status:body.status as string,fingerprint,reviewedBy:`${actor.kind}:${actor.id}`,reviewedAt:new Date()};
   await tx.analyticsDayReview.upsert({where:{date:body.date},create:{date:body.date,...data},update:data});
  });
  return NextResponse.json({ok:true},{headers:privateHeaders});
 }catch(e){return badRequest(e);}
}
