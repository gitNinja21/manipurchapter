import { attendanceStreaks } from "./attendanceStreaks";
import { countsForPayroll } from "./attendanceApproval";
import type { Prisma, User } from "@prisma/client";
import { prisma } from "./prisma";
import { policyApplies, policyTimes, recurringRule, scheduledBreak } from "./workPolicy";
import { attendancePoints, deviations, offDay } from "./performance";
import { todayWorkDate } from "./time";
import { TeamError, notify } from "./team";
type Db = Prisma.TransactionClient;
type ScheduleUser = Pick<
  User,
  | "weeklyScheduleJson"
  | "unpaidBreakFrom"
  | "scheduledUnpaidBreakMinutes"
  | "id"
  | "attendancePolicyFrom"
  | "attendanceStartMinute"
  | "attendanceLatestMinute"
  | "attendanceEndMinute"
  | "attendanceAllowEarly"
>;
export async function effectiveSchedule(db: Db, u: ScheduleUser, date: string) {
  const shift = await db.scheduledShift.findUnique({
    where: { userId_workDate: { userId: u.id, workDate: date } },
  });
  const rule = recurringRule(u, date);
  if (shift) return {
    start: shift.startsAt, end: new Date(+shift.startsAt + (rule?.duration ?? 540) * 60000),
    arrivalStart: shift.startsAt,
    opens: new Date(Math.max(+new Date(`${date}T00:00:00+05:30`), +shift.startsAt - 15 * 60000)),
    durationMinutes: rule?.duration ?? 540, breakMinutes: scheduledBreak(u, date, rule?.unpaidBreak ?? 0),
  };
  if (!policyApplies(u, date) || !rule) return null;
  const t = policyTimes(date, { ...u, attendanceStartMinute: rule.start, attendanceLatestMinute: rule.latest });
  const start = new Date(+t.lateAt - 60000);
  return { start, arrivalStart: new Date(+new Date(`${date}T00:00:00+05:30`) + rule.start * 60000), end: new Date(+start + rule.duration * 60000), opens: t.opensAt,
    durationMinutes: rule.duration, breakMinutes: rule.unpaidBreak };
}

export async function assertScheduleMutable(
  db: Db,
  userId: string,
  date: string,
) {
  if (
    date < todayWorkDate() ||
    (await db.attendanceRecord.findFirst({
      where: { userId, workDate: date, clockInAt: { not: null } },
    })) ||
    (await db.arrivalAttempt.findUnique({
      where: { userId_workDate: { userId, workDate: date } },
    }))
  )
    throw new TeamError(
      "A shift cannot be changed after an arrival is recorded or for a past date.",
      409,
    );
}
export async function validateShift(
  db: Db,
  userId: string,
  date: string,
  start: Date,
  end: Date,
) {
  if (+end - +start <= 60 * 60000)
    throw new TeamError(
      "A scheduled shift must be longer than its one-hour unpaid break.",
    );
  await assertScheduleMutable(db, userId, date);
  const employee = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const duration = recurringRule(employee, date)?.duration ?? 540;
  if (+end - +start !== duration * 60000) throw new TeamError(`Temporary shifts must span ${duration / 60} hours including the break. The actual finish moves with clock-in.`);
  if (+start <= Date.now())
    throw new TeamError(
      "Request and approve the new shift before it starts.",
      409,
    );
  if (
    await db.staffRequest.findFirst({
      where: {
        userId,
        kind: "LEAVE",
        status: "APPROVED",
        fromDate: { lte: date },
        toDate: { gte: date },
      },
    })
  )
    throw new TeamError("There is approved leave on this date.", 409);
  if (
    await db.scheduledShift.findFirst({
      where: {
        userId,
        workDate: { not: date },
        startsAt: { lt: end },
        endsAt: { gt: start },
      },
    })
  )
    throw new TeamError("This overlaps another shift.", 409);
}
export async function policyAudit(
  db: Db,
  actor: { id: string; name: string },
  userId: string,
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  await db.policyAudit.create({
    data: {
      entityId,
      userId,
      actorId: actor.id,
      actorName: actor.name,
      action,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(after),
    },
  });
}
/** Recompute pending flags from recorded scheduled working days; corrections can remove false flags. */
export async function syncMeetings(
  db: Db,
  userId: string,
  today = todayWorkDate(),
) {
  const [user, records, leave, shifts, meetings] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId } }),
    db.attendanceRecord.findMany({
      where: { userId, policyVersion: { in: [1, 2] }, workDate: { lt: today } },
      orderBy: { workDate: "asc" },
    }),
    db.staffRequest.findMany({
      where: { userId, kind: "LEAVE", status: "APPROVED" },
    }),
    db.scheduledShift.findMany({ where: { userId } }),
    db.managerMeeting.findMany({ where: { userId } }),
  ]);
  const {triggers} = attendanceStreaks({
    user,records,leave,shifts,meetings,
    from:records[0]?.workDate ?? today,
    to:new Date(Date.parse(today)-86400000).toISOString().slice(0,10),today,
  });
  for (const m of meetings.filter((m) => m.status === "PENDING")) {
    if (!triggers.has(`${m.kind}:${m.triggerDate}`)) {
      await db.managerMeeting.update({
        where: { id: m.id },
        data: {
          status: "CANCELLED",
          note: "Attendance review or correction removed this streak.",
        },
      });
      await policyAudit(
        db,
        { id: "SYSTEM", name: "Attendance rules" },
        userId,
        m.id,
        "MEETING_CANCELLED",
        m,
        { status: "CANCELLED" },
      );
    }
  }
  for (const key of triggers) {
    const [kind, triggerDate] = key.split(":");
    const old = meetings.find(
      (m) => m.kind === kind && m.triggerDate === triggerDate,
    );
    if (old && old.status !== "CANCELLED") continue;
    const m = await db.managerMeeting.upsert({
      where: { userId_kind_triggerDate: { userId, kind, triggerDate } },
      create: { userId, kind, triggerDate },
      update: { status: "PENDING", note: null },
    });
    const admins = await db.user.findMany({
      where: { role: "ADMIN", active: true },
      select: { id: true, role: true },
    });
    await notify(
      db,
      [...admins, user],
      "MEETING",
      m.id,
      `${user.name}: manager meeting required for ${kind === "LATE" ? "late arrivals" : "early departures"}`,
      "team?view=performance",
    );
    await policyAudit(
      db,
      { id: "SYSTEM", name: "Attendance rules" },
      userId,
      m.id,
      "MEETING_REQUIRED",
      old ?? null,
      m,
    );
  }
  return db.managerMeeting.findMany({ where: { userId, status: "PENDING" } });
}
export async function penaltyContext(db: Db, userId: string, date: string) {
  const meetings = await db.managerMeeting.findMany({
    where: {
      userId,
      status: "CLEARED",
      clearedDate: { gte: `${date.slice(0, 7)}-01`, lt: date },
    },
  });
  return {
    latePenaltyActive: meetings.some((m) => m.kind === "LATE"),
    earlyPenaltyActive: meetings.some((m) => m.kind === "EARLY"),
  };
}
export async function monthlyPerformance(month: string, userId?: string) {
  const where = userId ? { userId } : {};
  const [records, referrals, customerReviews] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { ...where, workDate: { startsWith: month } },
      orderBy: { workDate: "desc" },
    }),
    prisma.referralClaim.findMany({
      where: { ...where, billDate: { startsWith: month }, status: "APPROVED" },
    }),
    prisma.customerReview.findMany({where:{...where,workDate:{startsWith:month}}}),
  ]);
  const entries = records.flatMap((r) =>
    attendancePoints(r).map((p, i) => ({
      ...p,
      id: `${r.id}:${i}`,
      userId: r.userId,
      date: r.workDate,
    })),
  );
  entries.push(
    ...referrals.map((r) => ({
      id: r.id,
      userId: r.userId,
      date: r.billDate,
      kind: `Customer referral · bill ${r.billNumber}`,
      points: 3,
    })),
  );
  entries.push(...customerReviews.map(r => ({id:`review:${r.id}`,userId:r.userId,date:r.workDate,kind:`Customer review · ${r.totalStars}/25 stars`,points:r.points})));
  const totals = new Map<
    string,
    { points: number; eligibleShifts: number; pointsPerShift: number }
  >();
  for (const r of records.filter(
    (r) =>
      r.policyVersion &&
      r.scheduledStartAt &&
      r.clockInAt &&
      r.clockOutAt &&
      countsForPayroll(r) &&
      !offDay(r.workDate),
  )) {
    const t = totals.get(r.userId) ?? {
      points: 0,
      eligibleShifts: 0,
      pointsPerShift: 0,
    };
    t.eligibleShifts++;
    totals.set(r.userId, t);
  }
  for (const e of entries) {
    const t = totals.get(e.userId) ?? {
      points: 0,
      eligibleShifts: 0,
      pointsPerShift: 0,
    };
    t.points += e.points;
    totals.set(e.userId, t);
  }
  for (const t of totals.values()) {
    t.points = Math.round(t.points * 100) / 100;
    t.pointsPerShift = t.eligibleShifts
      ? Math.round((t.points / t.eligibleShifts) * 100) / 100
      : 0;
  }
  return {
    entries,
    totals,
    incidents: records
      .filter(
        (r) =>
          r.policyVersion &&
          !offDay(r.workDate) &&
          r.approvalStatus !== "REJECTED",
      )
      .map((r) => ({
        id: r.id,
        userId: r.userId,
        date: r.workDate,
        ...deviations(r),
        status: countsForPayroll(r) ? "COMPLETED" : r.approvalStatus === "REJECTED" ? "EXCLUDED" : "OPEN",
        latePenaltyActive: r.latePenaltyActive,
        earlyPenaltyActive: r.earlyPenaltyActive,
      }))
      .filter((r) => r.lateMs > 0 || r.earlyMs > 0),
  };
}
