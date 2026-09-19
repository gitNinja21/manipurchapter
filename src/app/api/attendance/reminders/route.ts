import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { reminderForUser } from "@/lib/attendanceReminderServer";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({error:"Not signed in."},{status:401});
  return NextResponse.json({userId:user.id,reminder:await reminderForUser(user)}, {headers:{"Cache-Control":"no-store"}});
}
