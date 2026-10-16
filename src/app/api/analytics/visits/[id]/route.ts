import { NextRequest,NextResponse } from "next/server";
import { requireAnalytics as requireAdmin } from "@/lib/analytics/auth";
import { prisma } from "@/lib/prisma";
import { validateVisit } from "@/lib/analytics/validation";
import { readVisit,badRequest,privateHeaders } from "@/lib/analytics/server";
type Context={params:Promise<{id:string}>};
export async function PUT(req:NextRequest,{params}:Context){
 const admin=await requireAdmin();if(!admin)return NextResponse.json({error:"Analytics access required."},{status:403});
 const {id}=await params;const old=await prisma.customerVisit.findUnique({where:{id},include:{items:true}});
 if(!old || old.deletedAt)return NextResponse.json({error:"Visit not found."},{status:404});
 let parsed,body;try{body=await req.json();parsed=validateVisit(body,old.items);if(!Number.isInteger(body.revision))throw new Error("Reload this visit before saving.");}catch(e){return badRequest(e);}
 try{await prisma.$transaction(async tx=>{
  const result=await tx.customerVisit.updateMany({where:{id,revision:body.revision,deletedAt:null},data:{...parsed.data,updatedById:admin.id,revision:{increment:1}}});
  if(!result.count)throw new Error("CONFLICT");
  await tx.customerVisitItem.deleteMany({where:{visitId:id}});
  for(const item of parsed.items)await tx.customerVisitItem.create({data:{...item,visitId:id}});
 });}catch(e){if(e instanceof Error && e.message==="CONFLICT")return NextResponse.json({error:"This visit changed in another window. Reload it before saving."},{status:409});throw e;}
 return NextResponse.json({visit:await readVisit(id)},{headers:privateHeaders});
}
export async function DELETE(req:NextRequest,{params}:Context){
 const admin=await requireAdmin();if(!admin)return NextResponse.json({error:"Analytics access required."},{status:403});
 const {id}=await params;let revision;try{revision=(await req.json()).revision;if(!Number.isInteger(revision))throw new Error("Invalid revision.");}catch(e){return badRequest(e);}
 const result=await prisma.customerVisit.updateMany({where:{id,revision,deletedAt:null},data:{deletedAt:new Date(),updatedById:admin.id,revision:{increment:1}}});
 if(!result.count)return NextResponse.json({error:"Visit changed or was already deleted. Reload first."},{status:409});
 return NextResponse.json({ok:true});
}
