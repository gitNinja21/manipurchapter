import { salaryCredit, overtimeMs } from "./performance";
import { paidTimeMs, recurringRule } from "./workPolicy";
import { prisma } from "./prisma";
import { todayWorkDate, workDateFor } from "./time";
import { APPROVAL_STATUS, countsForPayroll } from "./attendanceApproval";

// --- Payroll rules ---
// Version 2 uses actual clocked time including paid breaks, capped at the
// shift's regular target. Version 0/1 records retain historical calculations.
// Every eight eligible bonus hours earns one nine-hour day; remainders carry.
const FULL_DAY_HOURS = 9;
const OVERTIME_CHUNK_HOURS = 8;

export type EmployeeStats = {
  userId: string;
  name: string;
  employeeCode: string;
  hourlyRateRs: number;
  dailyRateRs: number; // hourlyRateRs * FULL_DAY_HOURS — what one complete day (or paid off-day) is worth
  active: boolean;
  billingFromDate: string | null; // null when employment does not overlap the selected range
  daysPresent: number; // has a clock-in
  daysComplete: number; // has both clock-in and clock-out (regardless of approval)
  paidWorkDays: number; // eligible regular-day equivalents, including prorated shifts
  fullDaysWorked: number; // eligible days with 9 regular salary-credit hours
  incompleteDays: number; // clocked in, forgot to clock out (no hours counted)
  missedDays: number; // calendar days in range (up to today) with no record at all
  pendingApprovalDays: number; // retained for API compatibility; always zero
  rejectedDays: number; // complete, but admin rejected it — not counted
  totalHours: number; // completed, non-excluded days
  offDays: number; // Mondays in range — paid leave regardless of attendance
  offDaysPayRs: number;
  regularPayRs: number; // scheduled salary credit or pro-rated work, with deductions included
  overtimeHours: number; // hours worked beyond 9/day on working days, accumulated over the range
  overtimeBalanceHours: number; // unconverted hours as of the report end
  bonusDays: number; // whole 8-hour blocks earned within the selected range
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
  toDate: string,
  preview?: { userId: string; recordId?: string; approvalStatus?: string },
): Promise<EmployeeStats[]> {
  const today = todayWorkDate();
  const effectiveToDate = toDate > today ? today : toDate;

  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE", ...(preview ? { id: preview.userId } : {}) },
    orderBy: { name: "asc" },
  });

  const records = await prisma.attendanceRecord.findMany({
    where: {
      workDate: { lte: effectiveToDate },
      userId: { in: employees.map((e) => e.id) },
    },
  });

  const recordsByUser = new Map<string, typeof records>();
  for (const original of records) {
    const r =
      preview && preview.approvalStatus && preview.recordId === original.id
        ? { ...original, approvalStatus: preview.approvalStatus }
        : original;
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
    const allDays =
      effectiveFromDate <= effectiveToDate
        ? daysInRange(effectiveFromDate, effectiveToDate)
        : [];
    // Mondays are paid off-days with no attendance expected, so they shouldn't
    // inflate "missed clock-ins" — only non-Monday calendar days count there.
    const weeklyApplies = (d: string) => (!!emp.masterScheduleJson && !!emp.masterScheduleFrom && d >= emp.masterScheduleFrom) || (!!emp.weeklyScheduleJson && !!emp.attendancePolicyFrom && d >= emp.attendancePolicyFrom);
    const expectedDay = (d: string) => !isMonday(d) && (!weeklyApplies(d) || !!recurringRule(emp, d));
    const workingCalendarDays = allDays.filter(expectedDay).length;

    const empRecords = (recordsByUser.get(emp.id) || []).filter(
      (record) =>
        record.workDate >= effectiveFromDate &&
        record.workDate <= effectiveToDate,
    );
    const recordsByDate = new Map(empRecords.map((r) => [r.workDate, r]));

    const daysPresent = empRecords.filter((r) => r.clockInAt).length;
    const complete = empRecords.filter((r) => r.clockInAt && r.clockOutAt);
    const daysComplete = complete.length;
    const incompleteDays = empRecords.filter(
      (r) => r.clockInAt && !r.clockOutAt,
    ).length;
    const daysPresentOnWorkingDays = empRecords.filter(
      (r) => r.clockInAt && expectedDay(r.workDate),
    ).length;
    const missedDays = Math.max(
      workingCalendarDays - daysPresentOnWorkingDays,
      0,
    );

    const pendingApprovalDays = 0; // Compatibility field; attendance no longer waits for review.
    const rejectedDays = complete.filter(
      (r) => r.approvalStatus === APPROVAL_STATUS.REJECTED,
    ).length;

    // Completion automatically enables regular pay; eligible extra time counts automatically.
    const totalHours = complete
      .filter(countsForPayroll)
      .reduce(
        (sum, r) => sum + (paidTimeMs(r) ?? 0) / 3600000,
        0,
      );

    const dailyRateRs = emp.hourlyRateRs * FULL_DAY_HOURS;

    let offDays = 0;
    let regularPayRs = 0;

    let fullDaysWorked = 0;
    let paidWorkDays = 0;

    for (const day of allDays) {
      if (isMonday(day)) {
        // Off day: paid leave, no attendance required.
        if (!weeklyApplies(day) || emp.paidWeeklyOff !== false) offDays += 1;
        continue;
      }

      const record = recordsByDate.get(day);
      const creditedHours =
        record && countsForPayroll(record)
          ? salaryCredit(record)
          : 0;

      if (creditedHours <= 0) continue; // absent or excluded — no pay for this working day

      paidWorkDays += Math.min(creditedHours / FULL_DAY_HOURS, 1);
      if (creditedHours >= FULL_DAY_HOURS) {
        fullDaysWorked += 1;
        regularPayRs += record?.policyVersion === 3 ? creditedHours * emp.hourlyRateRs : dailyRateRs;
      } else {
        // Short day: pro-rated for actual hours worked, not a full day's pay.
        regularPayRs += creditedHours * emp.hourlyRateRs;
      }
    }

    // Use exact elapsed milliseconds so rounding cannot award a bonus early.
    // Subtract previously earned blocks to attribute each bonus to the period
    // in which its threshold was reached, retaining the earlier remainder.
    const hourMs = 60 * 60 * 1000;
    const blockMs = OVERTIME_CHUNK_HOURS * hourMs;
    let priorOvertimeMs = 0;
    let periodOvertimeMs = 0;
    for (const record of recordsByUser.get(emp.id) || []) {
      if (
        record.workDate < joinWorkDate ||
        record.workDate > effectiveToDate ||
        isMonday(record.workDate) ||
        !countsForPayroll(record) ||
        !record.clockInAt ||
        !record.clockOutAt
      )
        continue;
      const extraMs = overtimeMs(record);
      if (record.workDate < effectiveFromDate) priorOvertimeMs += extraMs;
      else periodOvertimeMs += extraMs;
    }
    const accumulatedOvertimeMs = priorOvertimeMs + periodOvertimeMs;
    const bonusDays =
      Math.floor(accumulatedOvertimeMs / blockMs) -
      Math.floor(priorOvertimeMs / blockMs);
    const overtimeHours = periodOvertimeMs / hourMs;
    // Truncate the displayed balance so 7h 59m never appears to have reached 8h.
    const overtimeBalanceHours =
      Math.floor(((accumulatedOvertimeMs % blockMs) / hourMs) * 100) / 100;
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
      billingFromDate:
        effectiveFromDate <= effectiveToDate ? effectiveFromDate : null,
      daysPresent,
      daysComplete,
      fullDaysWorked,
      paidWorkDays: round2(paidWorkDays),
      incompleteDays,
      missedDays,
      pendingApprovalDays,
      rejectedDays,
      totalHours: round2(totalHours),
      offDays,
      offDaysPayRs: round2(offDaysPayRs),
      regularPayRs: round2(regularPayRs),
      overtimeHours: round2(overtimeHours),
      overtimeBalanceHours,
      bonusDays,
      bonusPayRs: round2(bonusPayRs),
      salaryRs: round2(offDaysPayRs + regularPayRs + bonusPayRs),
    };
  });
}
