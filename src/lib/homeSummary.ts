import { recurringDescription } from "@/lib/workPolicy";
import { prisma } from "@/lib/prisma";
import { memberWhere } from "@/lib/team";
import { computeStatsForRange } from "@/lib/stats";
import { todayWorkDate } from "@/lib/time";
import { nextBirthday } from "@/lib/teamValidation";
import type { User } from "@prisma/client";

export async function getHomeSummary(u: User) {
  const today = todayWorkDate(),
    month = `${today.slice(0, 7)}-01`;
  const [stats, nextShift, requests, birthdays, unread, chatUnread] =
    await Promise.all([
      u.role === "EMPLOYEE"
        ? computeStatsForRange(month, today, { userId: u.id })
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
  const s = stats[0];
  return {
    today,
    month,
    summary: s
      ? {
          totalHours: s.totalHours,
          overtimeHours: s.overtimeHours,
          bonusDays: s.bonusDays,
          overtimeBalanceHours: s.overtimeBalanceHours,
          pendingApprovalDays: s.pendingApprovalDays,
          fullDaysWorked: s.fullDaysWorked,
        }
      : null,
    nextShift,
    attendancePolicyFrom: u.attendancePolicyFrom,
    scheduleDescription: u.attendancePolicyFrom ? recurringDescription(u) : null,
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
