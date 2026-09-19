import type { Prisma, User } from "@prisma/client";
import { prisma } from "./prisma";
import { policyApplies, policyTimes } from "./workPolicy";
import { attendancePoints, deviations, offDay } from "./performance";
import { todayWorkDate } from "./time";
import { TeamError, notify } from "./team";
type Db = Prisma.TransactionClient;
type ScheduleUser = Pick<
  User,
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
  if (shift)
    return {
      start: shift.startsAt,
      end: shift.endsAt,
      opens: new Date(`${date}T00:00:00+05:30`),
      breakMinutes: 60,
    };
  if (!policyApplies(u, date)) return null;
  const t = policyTimes(date, u);
  return {
    start: new Date(+t.lateAt - 60000),
    end: t.closesAt,
    opens: t.opensAt,
    breakMinutes: 60,
  };
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
  const original = await effectiveSchedule(db, employee, date);
  if (original && +original.start <= Date.now())
    throw new TeamError(
      "The original shift has already started. Use an attendance exception or correction instead.",
      409,
    );
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
      where: { userId, policyVersion: 1, workDate: { lt: today } },
      orderBy: { workDate: "asc" },
    }),
    db.staffRequest.findMany({
      where: { userId, kind: "LEAVE", status: "APPROVED" },
    }),
    db.scheduledShift.findMany({ where: { userId } }),
    db.managerMeeting.findMany({ where: { userId } }),
  ]);
  const byDay = new Map(records.map((r) => [r.workDate, r]));
  const triggers = new Set<string>();
  if (records.length) {
    const first = records[0].workDate;
    const days: string[] = [];
    for (let t = Date.parse(first); t < Date.parse(today); t += 86400000)
      days.push(new Date(t).toISOString().slice(0, 10));
    for (const kind of ["LATE", "EARLY"]) {
      let streak = 0;
      let awaiting = false;
      for (const day of days) {
        const clears = meetings.filter(
          (m) =>
            m.kind === kind && m.status === "CLEARED" && m.clearedDate === day,
        );
        if (clears.length) {
          streak = 0;
          awaiting = false;
        }
        if (
          offDay(day) ||
          leave.some((l) => l.fromDate <= day && l.toDate >= day)
        )
          continue;
        const r = byDay.get(day);
        if (
          !r?.scheduledStartAt &&
          !policyApplies(user, day) &&
          !shifts.some((s) => s.workDate === day)
        )
          continue;
        const afterMeeting = meetings.some(
          (m) =>
            m.kind === kind &&
            m.status === "CLEARED" &&
            m.clearedDate &&
            m.clearedDate < day &&
            m.clearedDate.slice(0, 7) === day.slice(0, 7),
        );
        if (afterMeeting) {
          streak = 0;
          continue;
        }
        if (awaiting) continue;
        const d = r ? deviations(r) : { lateMs: 0, earlyMs: 0 };
        const incident =
          r &&
          r.approvalStatus !== "REJECTED" &&
          (kind === "LATE" ? d.lateMs > 15 * 60000 : d.earlyMs > 0);
        streak = incident ? streak + 1 : 0;
        if (streak === 3) {
          triggers.add(`${kind}:${day}`);
          awaiting = true;
        }
      }
    }
  }
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
  const [records, referrals] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { ...where, workDate: { startsWith: month } },
      orderBy: { workDate: "desc" },
    }),
    prisma.referralClaim.findMany({
      where: { ...where, billDate: { startsWith: month }, status: "APPROVED" },
    }),
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
      r.approvalStatus === "APPROVED" &&
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
  for (const t of totals.values())
    t.pointsPerShift = t.eligibleShifts
      ? Math.round((t.points / t.eligibleShifts) * 100) / 100
      : 0;
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
        status: r.approvalStatus,
        latePenaltyActive: r.latePenaltyActive,
        earlyPenaltyActive: r.earlyPenaltyActive,
      }))
      .filter((r) => r.lateMs > 0 || r.earlyMs > 0),
  };
}
