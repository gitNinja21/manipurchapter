import { NextResponse } from "next/server";
import { prisma } from "../prisma";
import { calendarDay } from "./calendar";
import type { CustomerVisit, CustomerVisitItem } from "@prisma/client";
export function serializeVisit(v:CustomerVisit & {items:CustomerVisitItem[]},calendar?:{namesJson:string;isHoliday:boolean}|null){
 return {...v,unavailable:JSON.parse(v.unavailableJson) as string[],weather:JSON.parse(v.weatherJson),calendar:calendarDay(v.workDate,calendar),totalRs:v.items.reduce((n,i)=>n+i.unitPriceRs*i.quantity,0)};
}
export async function readVisit(id:string){
 const v=await prisma.customerVisit.findUnique({where:{id},include:{items:true}});
 if(!v || v.deletedAt)return null;
 return serializeVisit(v,await prisma.analyticsCalendarDay.findUnique({where:{date:v.workDate}}));
}
export function badRequest(error:unknown){return NextResponse.json({error:error instanceof Error ? error.message : "Invalid request."},{status:400});}
export const privateHeaders={"Cache-Control":"private, no-store"};
