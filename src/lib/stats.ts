import { prisma } from "./prisma";
import { hoursBetween, todayWorkDate } from "./time";
import { APPROVAL_STATUS } from "./attendanceApproval";

export type EmployeeStats = {
  userId: string;
  name: string;
  employeeCode: string;
  hourlyRateRs: number;
  active: boolean;
  daysPresent: number; // has a clock-in
  daysComplete: number; // has both clock-in and clock-out (regardless of approval)
  incompleteDays: number; // clocked in, forgot to clock out (no hours counted)
  missedDays: number; // calendar days in range (up to today) with no record at all
  pendingApprovalDays: number; // complete, but admin hasn't approved or rejected yet — not counted
  rejectedDays: number; // complete, but admin rejected it — not counted
  totalHours: number; // only from APPROVED days
  salaryRs: number;
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

/** Computes per-employee stats for [fromDate, toDate] (inclusive, "YYYY-MM-DD", IST work-date strings). */
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

  const totalCalendarDays = daysInRange(fromDate, effectiveToDate).length;

  return employees.map((emp) => {
    const empRecords = recordsByUser.get(emp.id) || [];
    const daysPresent = empRecords.filter((r) => r.clockInAt).length;
    const complete = empRecords.filter((r) => r.clockInAt && r.clockOutAt);
    const daysComplete = complete.length;
    const incompleteDays = empRecords.filter((r) => r.clockInAt && !r.clockOutAt).length;
    const missedDays = Math.max(totalCalendarDays - daysPresent, 0);

    const approved = complete.filter((r) => r.approvalStatus === APPROVAL_STATUS.APPROVED);
    const pendingApprovalDays = complete.filter(
      (r) => r.approvalStatus === APPROVAL_STATUS.PENDING
    ).length;
    const rejectedDays = complete.filter(
      (r) => r.approvalStatus === APPROVAL_STATUS.REJECTED
    ).length;

    // Only admin-approved days count toward paid hours/salary — a completed
    // day sits in pendingApprovalDays (unpaid, but visible) until someone
    // reviews it from the Attendance Log.
    const totalHours = approved.reduce((sum, r) => {
      const h = hoursBetween(r.clockInAt, r.clockOutAt);
      return sum + (h ?? 0);
    }, 0);

    const roundedHours = Math.round(totalHours * 100) / 100;
    const salaryRs = Math.round(roundedHours * emp.hourlyRateRs * 100) / 100;

    return {
      userId: emp.id,
      name: emp.name,
      employeeCode: emp.employeeCode,
      hourlyRateRs: emp.hourlyRateRs,
      active: emp.active,
      daysPresent,
      daysComplete,
      incompleteDays,
      missedDays,
      pendingApprovalDays,
      rejectedDays,
      totalHours: roundedHours,
      salaryRs,
    };
  });
}
