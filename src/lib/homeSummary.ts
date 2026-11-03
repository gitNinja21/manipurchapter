import {listWeeklyShifts} from "./weeklyScheduleServer";
import {weeklyApplies} from "./weeklySchedulePolicy";
import { workDayMode } from "./workDays";
import { statisticsFrom } from "./statisticsStart";
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
        ? prisma.attendanceRecord.findMany({where:{userId:u.id,workDate:{gte:statisticsFrom(month),lte:today},clockInAt:{not:null},clockOutAt:{not:null}},select:{clockInAt:true,clockOutAt:true}})
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
  let weeklyNext: {startsAt:Date;endsAt:Date;note:string}|null=null;
  if(weeklyApplies(today)&&u.role==="EMPLOYEE"){
    const until=new Date(Date.parse(today)+14*86400000).toISOString().slice(0,10);
    const [weekly,leaves,closed]=await Promise.all([listWeeklyShifts(prisma,today,until,u.id),prisma.staffRequest.findMany({where:{userId:u.id,kind:"LEAVE",status:"APPROVED",fromDate:{lte:until},toDate:{gte:today}},select:{fromDate:true,toDate:true}}),prisma.workDayOverride.findMany({where:{workDate:{gte:today,lte:until}},select:{workDate:true}})]);
    weeklyNext=weekly.filter(s=>+s.endsAt>=Date.now()&&!closed.some(c=>c.workDate===s.workDate)&&!leaves.some(l=>l.fromDate<=s.workDate&&l.toDate>=s.workDate)).sort((a,b)=>+a.startsAt-+b.startsAt)[0]??null;
  }
  const dateMode=await workDayMode(prisma,today);
  return {
    today,
    month,
    summary: u.role === "EMPLOYEE" ? {clockedMinutes: Math.round(records.reduce((sum,r)=>sum+(clockedMs(r) ?? 0),0)/60000),completedShifts:records.length} : null,
    nextShift:weeklyApplies(today)?weeklyNext:nextShift,
    weeklyScheduleRequired:weeklyApplies(today),
    attendancePolicyFrom: u.attendancePolicyFrom,
    scheduleDescription: dateMode==="PAID_OFF" ? "Today is closed. Usual paid-off-day rules apply." : dateMode==="HOURLY" ? "Today: flexible clock-in/out. Hourly pay minus admin-entered unpaid break; one-hour paid break included." : u.attendancePolicyFrom || u.masterScheduleFrom ? recurringDescription(u) : null,
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
