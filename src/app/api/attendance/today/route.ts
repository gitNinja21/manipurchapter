import { scheduleLabels } from "@/lib/workPolicy";
import { effectiveSchedule } from "@/lib/performanceServer";
import { formatIstTime } from "@/lib/time";
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

  const schedule = await effectiveSchedule(prisma, user, workDate);
  const override = await prisma.scheduledShift.findUnique({where: {userId_workDate: {userId: user.id, workDate}}});
  const lateRequest = await prisma.staffRequest.findFirst({where: {userId: user.id, kind: "LATE_ARRIVAL", fromDate: workDate}, orderBy: {createdAt: "desc"}, select: {status: true, reason: true}});
  const meetings = await prisma.managerMeeting.findMany({where: {userId: user.id, status: "PENDING"}});
  return NextResponse.json({record, policy: !!schedule, schedule: schedule ? !override ? scheduleLabels(user) : {arrival: formatIstTime(schedule.start), latest: formatIstTime(schedule.start), opening: formatIstTime(schedule.opens), finish: formatIstTime(schedule.end), fixed: true, allowEarly: true} : null,
    arrivalState: schedule ? new Date() < schedule.opens ? "EARLY" : new Date() > schedule.start ? "LATE" : "ON_TIME" : null, lateRequest, meetings, serverTime: new Date().toISOString()});
}
