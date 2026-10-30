import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { validRange } from "@/lib/reporting";
import { computeStatsForRange } from "@/lib/stats";
import { createPayrollPdf } from "@/lib/payrollPdf";
export const runtime = "nodejs";
export async function GET(req:NextRequest) {
 if(!await requireAdmin())return NextResponse.json({error:"Admin only."},{status:403});
 const q=req.nextUrl.searchParams,from=q.get('from')??'',to=q.get('to')??'',userId=q.get('userId')??'';
 if(!userId||!validRange(from,to)||Date.parse(to)-Date.parse(from)>366*86400000)
  return NextResponse.json({error:"Choose an employee and a valid range of up to one year."},{status:400});
 const [stats]=await computeStatsForRange(from,to,{userId},true);
 if(!stats)return NextResponse.json({error:"Employee not found."},{status:404});
 const bytes=await createPayrollPdf(stats,from,to);
 const code=stats.employeeCode.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,60)||'employee';
 return new NextResponse(Buffer.from(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="Manipur-Chapter-${code}-${from}-to-${to}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
