import { minuteLabel, recurringRule } from "@/lib/workPolicy";
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
  const rule = recurringRule(user, workDate);
  const labels = schedule ? {
    arrival: !override && rule && rule.start !== rule.latest ? `${minuteLabel(rule.start)}–${minuteLabel(rule.latest)}` : formatIstTime(schedule.start),
    latest: formatIstTime(schedule.start), opening: formatIstTime(schedule.opens),
    finish: record?.scheduledEndAt ? formatIstTime(record.scheduledEndAt) : `${schedule.durationMinutes / 60} hours after clock-in`,
    fixed: !!override || rule?.start === rule?.latest, allowEarly: !!override || user.attendanceAllowEarly,
    durationHours: schedule.durationMinutes / 60, unpaidBreakMinutes: schedule.breakMinutes,
  } : null;
  return NextResponse.json({record, policy: !!schedule, schedule: labels,
    arrivalState: user.weeklyScheduleJson && !schedule ? "OFF" : schedule ? new Date() < schedule.opens ? "EARLY" : new Date() > schedule.start ? "LATE" : "ON_TIME" : null,
    lateRequest, meetings, serverTime: new Date().toISOString()});
}
