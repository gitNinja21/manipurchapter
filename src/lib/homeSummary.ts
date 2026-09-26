import { recurringDescription } from "@/lib/workPolicy";
import { prisma } from "@/lib/prisma";
import { memberWhere } from "@/lib/team";
import { clockedMs } from "@/lib/attendanceTime";
import { todayWorkDate } from "@/lib/time";
import { nextBirthday } from "@/lib/teamValidation";
import type { User } from "@prisma/client";

export async function getHomeSummary(u: User) {
  const today = todayWorkDate(),
    month = `${today.slice(0, 7)}-01`;
  const [records, nextShift, requests, birthdays, unread, chatUnread] =
    await Promise.all([
      u.role === "EMPLOYEE"
        ? prisma.attendanceRecord.findMany({where:{userId:u.id,workDate:{gte:month,lte:today},clockInAt:{not:null},clockOutAt:{not:null}},select:{clockInAt:true,clockOutAt:true}})
        : Promise.resolve([]),
      prisma.scheduledShift.findFirst({
        where: { userId: u.id, endsAt: { gte: new Date() } },
        orderBy: { startsAt: "asc" },
      }),
      prisma.staffRequest.count({
        where: {
          status: "PENDING",
          kind: {not:"EXTRA_TIME"},
          ...(u.role === "ADMIN" ? {} : { userId: u.id }),
        },
      }),
      prisma.user.findMany({
        where: {
          AND: [
            memberWhere,
            { birthdayMonth: { not: null }, birthdayDay: { not: null } },
            ...(u.role === "ADMIN"
              ? []
              : [{ OR: [{ shareBirthday: true }, { id: u.id }] }]),
          ],
        },
        select: {
          id: true,
          name: true,
          birthdayMonth: true,
          birthdayDay: true,
          shareBirthday: true,
        },
      }),
      prisma.notification.count({
        where: { userId: u.id, kind: "ANNOUNCEMENT", readAt: null },
      }),
      prisma.teamMessage.count({
        where: {
          deletedAt: null,
          authorId: { not: u.id },
          ...(u.chatReadAt ? { createdAt: { gt: u.chatReadAt } } : {}),
        },
      }),
    ]);
  return {
    today,
    month,
    summary: u.role === "EMPLOYEE" ? {clockedMinutes: Math.round(records.reduce((sum,r)=>sum+(clockedMs(r) ?? 0),0)/60000),completedShifts:records.length} : null,
    nextShift,
    attendancePolicyFrom: u.attendancePolicyFrom,
    scheduleDescription: u.attendancePolicyFrom || u.masterScheduleFrom ? recurringDescription(u) : null,
    requests,
    unread,
    chatUnread,
    birthdayToday:
      !!u.birthdayMonth &&
      !!u.birthdayDay &&
      nextBirthday(u.birthdayMonth, u.birthdayDay, today) === today,
    birthdays: birthdays
      .map((p) => ({
        id: p.id,
        name: p.name,
        shared: p.shareBirthday,
        nextDate: nextBirthday(p.birthdayMonth!, p.birthdayDay!, today),
      }))
      .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
      .slice(0, 3),
  };
}
