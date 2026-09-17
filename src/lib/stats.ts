import { prisma } from "./prisma";
import { hoursBetween, todayWorkDate, workDateFor } from "./time";
import { APPROVAL_STATUS } from "./attendanceApproval";

// --- Payroll rules ---
// A "complete day" is 9 hours worked. Working fewer hours than that is paid
// pro-rata for the actual hours worked (not zero) — it just doesn't reach a
// full day's pay. Hours worked beyond 9 in a day count as overtime and are
// tracked across the whole date range being calculated (normally a calendar
// month): every 8 accumulated overtime hours converts to one extra day's
// pay (so 4 accumulated OT hours = half a day's bonus, 8 = a full day, and
// so on — fractional bonus days are paid, not rounded down).
const FULL_DAY_HOURS = 9;
const OVERTIME_CHUNK_HOURS = 8;

export type EmployeeStats = {
  userId: string;
  name: string;
  employeeCode: string;
  hourlyRateRs: number;
  dailyRateRs: number; // hourlyRateRs * FULL_DAY_HOURS — what one complete day (or paid off-day) is worth
  active: boolean;
  daysPresent: number; // has a clock-in
  daysComplete: number; // has both clock-in and clock-out (regardless of approval)
  fullDaysWorked: number; // approved days with >= 9 hours worked
  incompleteDays: number; // clocked in, forgot to clock out (no hours counted)
  missedDays: number; // calendar days in range (up to today) with no record at all
  pendingApprovalDays: number; // complete, but admin hasn't approved or rejected yet — not counted
  rejectedDays: number; // complete, but admin rejected it — not counted
  totalHours: number; // only from APPROVED days
  offDays: number; // Mondays in range — paid leave regardless of attendance
  offDaysPayRs: number;
  regularPayRs: number; // pay for actual working days (full-day rate or pro-rated short-day pay)
  overtimeHours: number; // hours worked beyond 9/day on working days, accumulated over the range
  bonusDays: number; // overtimeHours / 8, fractional
  bonusPayRs: number;
  salaryRs: number; // offDaysPayRs + regularPayRs + bonusPayRs
};

function daysInRange(fromDate: string, toDate: string): string[] {
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  const start = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);
  const days: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    days.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** True if the given "YYYY-MM-DD" work-date string falls on a Monday. */
function isMonday(workDate: string): boolean {
  const [y, m, d] = workDate.split("-").map(Number);
  return new Date(y, m - 1, d).getDay() === 1;
}

/** Computes per-employee stats + payroll for [fromDate, toDate] (inclusive, "YYYY-MM-DD", IST work-date strings). */
export async function computeStatsForRange(
  fromDate: string,
  toDate: string
): Promise<EmployeeStats[]> {
  const today = todayWorkDate();
  const effectiveToDate = toDate > today ? today : toDate;

  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE" },
    orderBy: { name: "asc" },
  });

  const records = await prisma.attendanceRecord.findMany({
    where: {
      workDate: { gte: fromDate, lte: toDate },
      userId: { in: employees.map((e) => e.id) },
    },
  });

  const recordsByUser = new Map<string, typeof records>();
  for (const r of records) {
    const list = recordsByUser.get(r.userId) || [];
    list.push(r);
    recordsByUser.set(r.userId, list);
  }

  return employees.map((emp) => {
    // Nothing before an employee actually joined the system counts against
    // (or in favor of) them — no missed days, no paid Mondays, no salary —
    // regardless of what date range is being viewed. "Joined" is when their
    // account was created, whether via self-signup or the admin's manual
    // add, not when (or if) they've been approved yet.
    const joinWorkDate = workDateFor(emp.createdAt);
    const effectiveFromDate = joinWorkDate > fromDate ? joinWorkDate : fromDate;
    const allDays = effectiveFromDate <= effectiveToDate ? daysInRange(effectiveFromDate, effectiveToDate) : [];
    // Mondays are paid off-days with no attendance expected, so they shouldn't
    // inflate "missed clock-ins" — only non-Monday calendar days count there.
    const workingCalendarDays = allDays.filter((d) => !isMonday(d)).length;

    const empRecords = recordsByUser.get(emp.id) || [];
    const recordsByDate = new Map(empRecords.map((r) => [r.workDate, r]));

    const daysPresent = empRecords.filter((r) => r.clockInAt).length;
    const complete = empRecords.filter((r) => r.clockInAt && r.clockOutAt);
    const daysComplete = complete.length;
    const incompleteDays = empRecords.filter((r) => r.clockInAt && !r.clockOutAt).length;
    const daysPresentOnWorkingDays = empRecords.filter(
      (r) => r.clockInAt && !isMonday(r.workDate)
    ).length;
    const missedDays = Math.max(workingCalendarDays - daysPresentOnWorkingDays, 0);

    const pendingApprovalDays = complete.filter(
      (r) => r.approvalStatus === APPROVAL_STATUS.PENDING
    ).length;
    const rejectedDays = complete.filter(
      (r) => r.approvalStatus === APPROVAL_STATUS.REJECTED
    ).length;

    // Only admin-approved days count toward paid hours — a completed day
    // sits in pendingApprovalDays (unpaid, but visible) until someone
    // reviews it from the Attendance Log.
    const totalHours = complete
      .filter((r) => r.approvalStatus === APPROVAL_STATUS.APPROVED)
      .reduce((sum, r) => sum + (hoursBetween(r.clockInAt, r.clockOutAt) ?? 0), 0);

    const dailyRateRs = emp.hourlyRateRs * FULL_DAY_HOURS;

    let offDays = 0;
    let regularPayRs = 0;
    let overtimeHours = 0;
    let fullDaysWorked = 0;

    for (const day of allDays) {
      if (isMonday(day)) {
        // Off day: paid leave, no attendance required.
        offDays += 1;
        continue;
      }

      const record = recordsByDate.get(day);
      const approvedHours =
        record && record.approvalStatus === APPROVAL_STATUS.APPROVED
          ? hoursBetween(record.clockInAt, record.clockOutAt) ?? 0
          : 0;

      if (approvedHours <= 0) continue; // absent (or not yet approved) — no pay for this working day

      if (approvedHours >= FULL_DAY_HOURS) {
        fullDaysWorked += 1;
        regularPayRs += dailyRateRs;
        overtimeHours += approvedHours - FULL_DAY_HOURS;
      } else {
        // Short day: pro-rated for actual hours worked, not a full day's pay.
        regularPayRs += approvedHours * emp.hourlyRateRs;
      }
    }

    const bonusDays = overtimeHours / OVERTIME_CHUNK_HOURS;
    const bonusPayRs = bonusDays * dailyRateRs;
    const offDaysPayRs = offDays * dailyRateRs;

    const round2 = (n: number) => Math.round(n * 100) / 100;

    return {
      userId: emp.id,
      name: emp.name,
      employeeCode: emp.employeeCode,
      hourlyRateRs: emp.hourlyRateRs,
      dailyRateRs: round2(dailyRateRs),
      active: emp.active,
      daysPresent,
      daysComplete,
      fullDaysWorked,
      incompleteDays,
      missedDays,
      pendingApprovalDays,
      rejectedDays,
      totalHours: round2(totalHours),
      offDays,
      offDaysPayRs: round2(offDaysPayRs),
      regularPayRs: round2(regularPayRs),
      overtimeHours: round2(overtimeHours),
      bonusDays: round2(bonusDays),
      bonusPayRs: round2(bonusPayRs),
      salaryRs: round2(offDaysPayRs + regularPayRs + bonusPayRs),
    };
  });
}
