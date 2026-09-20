import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAttendanceToday } from "@/lib/employeeDashboard";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json(await getAttendanceToday(user));
}
