import { cookies } from "next/headers";
import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import { prisma } from "../prisma";
import { requireAdmin } from "../auth";
export const CAPTAIN_COOKIE="mc_captain_session";
const audience="manipur-chapter-captain-analytics";
function key(){if(!process.env.JWT_SECRET)throw new Error("JWT_SECRET is required.");return new TextEncoder().encode(process.env.JWT_SECRET);}
export async function captainToken(account:{id:string;authVersion:number}){
 return new SignJWT({authVersion:account.authVersion}).setSubject(account.id).setAudience(audience).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("12h").sign(key());
}
export async function requireAnalytics():Promise<{id:string;name:string;kind:"CAPTAIN"|"ADMIN"}|null>{
 const token=(await cookies()).get(CAPTAIN_COOKIE)?.value;
 if(token){try{
  const {payload}=await jwtVerify(token,key(),{audience,algorithms:["HS256"]});
  const captain=await prisma.captainAccount.findUnique({where:{id:payload.sub||""}});
  if(captain?.active && payload.authVersion===captain.authVersion)return {id:captain.id,name:captain.name,kind:"CAPTAIN"};
 }catch{/* An invalid captain session grants no access. */}}
 const admin=await requireAdmin();return admin?{id:admin.id,name:admin.name,kind:"ADMIN"}:null;
}
