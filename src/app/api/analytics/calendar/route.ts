import { NextRequest,NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validDate,calendarDay } from "@/lib/analytics/calendar";
import { badRequest } from "@/lib/analytics/server";
export async function PUT(req:NextRequest){
 const admin=await requireAdmin();if(!admin)return NextResponse.json({error:"Admin only."},{status:403});
 let body;try{body=await req.json();if(!validDate(body.date) || typeof body.isHoliday!=="boolean" || !Array.isArray(body.names) || body.names.length>10 || body.names.some((n:unknown)=>typeof n!=="string" || n.length>150))throw new Error("Enter a valid date and up to 10 festival/holiday names.");}catch(e){return badRequest(e);}
 const data={namesJson:JSON.stringify([...new Set(body.names.map((n:string)=>n.trim()).filter(Boolean))]),isHoliday:body.isHoliday,updatedById:admin.id};
 const day=await prisma.analyticsCalendarDay.upsert({where:{date:body.date},create:{date:body.date,...data},update:data});
 return NextResponse.json({calendar:calendarDay(body.date,day)});
}
