import { NextRequest,NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { CAPTAIN_COOKIE,captainToken } from "@/lib/analytics/auth";
import { SESSION_COOKIE } from "@/lib/auth";
export async function POST(req:NextRequest){
 let body;try{body=await req.json();}catch{return NextResponse.json({error:"Invalid login."},{status:400});}
 if(typeof body?.username!=="string" || typeof body?.password!=="string" || body.username.length>50 || body.password.length>128)return NextResponse.json({error:"Invalid username or password."},{status:401});
 const account=await prisma.captainAccount.findUnique({where:{username:body.username.trim().toUpperCase()}});
 const invalid=()=>NextResponse.json({error:"Incorrect captain login or account temporarily locked. Try again later or contact the admin."},{status:401});
 if(!account?.active || (account.lockedUntil && account.lockedUntil>new Date()))return invalid();
 if(!await bcrypt.compare(body.password,account.passwordHash)){
  await prisma.$transaction(async tx=>{
   const updated=await tx.captainAccount.update({where:{id:account.id},data:{failedAttempts:{increment:1}}});
   if(updated.failedAttempts>=5)await tx.captainAccount.update({where:{id:account.id},data:{failedAttempts:0,lockedUntil:new Date(Date.now()+15*60000)}});
  });return invalid();
 }
 await prisma.captainAccount.update({where:{id:account.id},data:{failedAttempts:0,lockedUntil:null}});
 const res=NextResponse.json({ok:true});
 res.cookies.set(CAPTAIN_COOKIE,await captainToken(account),{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:12*3600});
 // Switching to captain mode removes any staff/admin session from this browser.
 res.cookies.set(SESSION_COOKIE,"",{path:"/",maxAge:0});
 return res;
}
