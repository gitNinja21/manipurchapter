import { NextRequest,NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 if(!await requireAdmin())return NextResponse.json({error:"Admin only."},{status:403});const {id}=await params;
 let b;try{b=await req.json();if(typeof b.active!=="boolean" && typeof b.password!=="string")throw new Error();if(b.password!==undefined && (typeof b.password!=="string"||b.password.length<10||b.password.length>128))throw new Error();}catch{return NextResponse.json({error:"Choose account status or provide a new password of 10–128 characters."},{status:400});}
 const result=await prisma.captainAccount.updateMany({where:{id},data:{...(typeof b.active==="boolean"?{active:b.active}:{}),...(b.password?{passwordHash:await bcrypt.hash(b.password,12)}:{}),authVersion:{increment:1},failedAttempts:0,lockedUntil:null}});
 return NextResponse.json(result.count?{ok:true}:{error:"Captain not found."},{status:result.count?200:404});
}
