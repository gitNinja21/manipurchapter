import {NextRequest,NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {isSelfieAction} from "@/lib/selfieThemes";
import {themeForUser} from "@/lib/selfieThemeServer";
import {poseConfigured} from "@/lib/selfiePoseVision";
export async function GET(req:NextRequest){
 const user=await getCurrentUser();if(!user||!user.approved)return NextResponse.json({error:"Sign in with an approved account."},{status:403});
 const action=req.nextUrl.searchParams.get("action");if(!isSelfieAction(action))return NextResponse.json({error:"Choose clock-in or clock-out."},{status:400});
 const {date,theme,exception}=await themeForUser(prisma,user.id,action);
 return NextResponse.json({date,theme:theme?{key:theme.theme,revision:theme.revision}:null,exempt:!!exception,configured:poseConfigured()},{headers:{"Cache-Control":"private, no-store"}});
}
