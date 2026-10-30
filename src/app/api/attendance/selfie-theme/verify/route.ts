import {NextRequest,NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/auth";
import {isSelfieAction,SelfieThemeError} from "@/lib/selfieThemes";
import {issuePoseReceipt} from "@/lib/selfieThemeServer";
export async function POST(req:NextRequest){
 const user=await getCurrentUser();if(!user||!user.approved||user.mustChangePassword)return NextResponse.json({error:"An approved account is required."},{status:403});
 try{
  if(Number(req.headers.get("content-length"))>8500000)throw new SelfieThemeError("Photo is too large.",413);
  const b=await req.json();if(!isSelfieAction(b.action)||typeof b.photoDataUrl!=="string")throw new SelfieThemeError("Invalid selfie request.",400);
  return NextResponse.json(await issuePoseReceipt(user.id,b.action,b.photoDataUrl),{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return NextResponse.json({error:e instanceof SelfieThemeError?e.message:"Could not check your pose. Please retry."},{status:e instanceof SelfieThemeError?e.status:503});}
}
