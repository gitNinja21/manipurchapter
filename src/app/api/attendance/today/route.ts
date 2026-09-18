import { policyApplies, arrivalState } from "@/lib/workPolicy";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { todayWorkDate } from "@/lib/time";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const workDate = todayWorkDate();
  const open = await prisma.attendanceRecord.findFirst({where: {userId: user.id, clockInAt: {not: null}, clockOutAt: null}, orderBy: {workDate: "desc"}});
  const record = open ?? await prisma.attendanceRecord.findUnique({
    where: { userId_workDate: { userId: user.id, workDate } },
  });

  const policy = policyApplies(user, workDate);
  const lateRequest = policy ? await prisma.staffRequest.findFirst({where: {userId: user.id, kind: "LATE_ARRIVAL", fromDate: workDate}, orderBy: {createdAt: "desc"}, select: {status: true, reason: true}}) : null;
  return NextResponse.json({ record, policy, arrivalState: policy ? arrivalState(new Date(), workDate) : null, lateRequest, serverTime: new Date().toISOString() });
}
