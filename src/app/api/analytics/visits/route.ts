import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { todayWorkDate } from "@/lib/time";
import { validateVisit } from "@/lib/analytics/validation";
import { validDate,visitTime,calendarDay } from "@/lib/analytics/calendar";
import { visitWeather } from "@/lib/analytics/weather";
import { serializeVisit,readVisit,badRequest,privateHeaders } from "@/lib/analytics/server";
export async function GET(req:NextRequest){
 if(!await requireAdmin())return NextResponse.json({error:"Admin only."},{status:403});
 const date=req.nextUrl.searchParams.get("date") || todayWorkDate();
 if(!validDate(date))return badRequest(new Error("Invalid date."));
 const [visits,day]=await Promise.all([prisma.customerVisit.findMany({where:{workDate:date,deletedAt:null},include:{items:true},orderBy:{visitedAt:"desc"}}),prisma.analyticsCalendarDay.findUnique({where:{date}})]);
 return NextResponse.json({visits:visits.map(v=>serializeVisit(v,day)),calendar:calendarDay(date,day),weatherConfigured:!!process.env.WEATHERAPI_KEY?.trim(),today:todayWorkDate()},{headers:privateHeaders});
}
export async function POST(req:NextRequest){
 const admin=await requireAdmin();if(!admin)return NextResponse.json({error:"Admin only."},{status:403});
 let body,parsed;
 try{body=await req.json();parsed=validateVisit(body);if(typeof body.submissionKey!=="string" || !/^[a-zA-Z0-9-]{16,80}$/.test(body.submissionKey))throw new Error("Invalid submission key.");}catch(e){return badRequest(e);}
 const duplicate=await prisma.customerVisit.findUnique({where:{submissionKey:body.submissionKey}});
 if(duplicate)return duplicate.deletedAt ? NextResponse.json({error:"This visit was deleted. Start a new visit."},{status:409}) : NextResponse.json({visit:await readVisit(duplicate.id)});
 const at=new Date();const weather=await visitWeather(at);
 // Upsert provides idempotency if a save is retried after a lost response.
 const v=await prisma.customerVisit.upsert({where:{submissionKey:body.submissionKey},update:{},create:{submissionKey:body.submissionKey,visitedAt:at,...visitTime(at),...parsed.data,weatherJson:JSON.stringify(weather),createdById:admin.id,updatedById:admin.id,items:{create:parsed.items}}});
 return NextResponse.json({visit:await readVisit(v.id)},{headers:privateHeaders});
}
