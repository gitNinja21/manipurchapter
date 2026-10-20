import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
async function retired(){
 if(!await requireAdmin())return NextResponse.json({error:"Admin only."},{status:403});
 return NextResponse.json({error:"The old Monday opening has been replaced. Refresh and use Working dates & paid closures."},{status:410});
}
export const GET=retired;
export const POST=retired;
