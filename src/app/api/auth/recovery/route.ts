import {NextRequest,NextResponse} from "next/server";
import {beginRecovery,checkRecovery,resetRecovery,recoveryLimit,RecoveryError,RECOVERY_COOKIE} from "@/lib/accountRecovery";
export const runtime="nodejs";
export async function POST(req:NextRequest){
  try {
    if(!req.headers.get("content-type")?.includes("application/json"))throw new RecoveryError("Expected JSON.",415);
    if(req.headers.get("sec-fetch-site")==="cross-site")throw new RecoveryError("Open recovery on this website.",403);
    const raw=await req.text();if(raw.length>2048)throw new RecoveryError("Request too large.",413);
    let body;try{body=JSON.parse(raw);}catch{throw new RecoveryError("Invalid request.");}
    if(!body || typeof body!=="object")throw new RecoveryError("Invalid request.");
    // Deployment proxy must replace X-Forwarded-For; phone/global limits also apply.
    const ip=req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    await recoveryLimit("ip",ip,600,30);
    const token=req.cookies.get(RECOVERY_COOKIE)?.value;
    let response:NextResponse;
    if(body.action==="send"){
      const next=await beginRecovery(body.phone);
      response=NextResponse.json({ok:true,message:"If this number belongs to one eligible employee account, an SMS code will arrive. Shared or outdated numbers need admin help."});
      response.cookies.set(RECOVERY_COOKIE,next,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/api/auth/recovery",maxAge:600});
    } else if(body.action==="verify"){
      response=NextResponse.json(await checkRecovery(token,body.code));
      response.cookies.set(RECOVERY_COOKIE,token!,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/api/auth/recovery",maxAge:300});
    }
    else if(body.action==="reset"){
      response=NextResponse.json(await resetRecovery(token,body.password));
      response.cookies.set(RECOVERY_COOKIE,"",{path:"/api/auth/recovery",maxAge:0});
      response.cookies.set("mc_session","",{path:"/",maxAge:0});
    } else throw new RecoveryError("Unknown action.");
    response.headers.set("Cache-Control","no-store");return response;
  }catch(error){return NextResponse.json({error:error instanceof RecoveryError ? error.message : "Recovery unavailable. Please try again later."},{status:error instanceof RecoveryError ? error.status : 503,headers:{"Cache-Control":"no-store"}});}
}
