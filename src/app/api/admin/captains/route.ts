import { NextRequest,NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function GET(){if(!await requireAdmin())return NextResponse.json({error:"Admin only."},{status:403});return NextResponse.json({accounts:await prisma.captainAccount.findMany({select:{id:true,name:true,username:true,active:true},orderBy:{name:"asc"}})},{headers:{"Cache-Control":"private, no-store"}});}
export async function POST(req:NextRequest){
 if(!await requireAdmin())return NextResponse.json({error:"Admin only."},{status:403});
 let b;try{b=await req.json();if(typeof b.name!=="string"||!b.name.trim()||b.name.length>80||typeof b.username!=="string"||!/^[A-Za-z0-9_-]{3,40}$/.test(b.username)||typeof b.password!=="string"||b.password.length<10||b.password.length>128)throw new Error();}catch{return NextResponse.json({error:"Enter a name, a 3–40 character login ID (letters, numbers, _ or -), and a password of 10–128 characters."},{status:400});}
 try{await prisma.captainAccount.create({data:{name:b.name.trim(),username:b.username.toUpperCase(),passwordHash:await bcrypt.hash(b.password,12)}});}catch(e){if((e as {code?:string}).code==="P2002")return NextResponse.json({error:"Captain login ID already exists."},{status:409});throw e;}
 return NextResponse.json({ok:true});
}
