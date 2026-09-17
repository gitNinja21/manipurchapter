"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type EmployeeStats = {
  userId: string;
  name: string;
  employeeCode: string;
  hourlyRateRs: number;
  dailyRateRs: number;
  active: boolean;
  daysPresent: number;
  daysComplete: number;
  fullDaysWorked: number;
  incompleteDays: number;
  missedDays: number;
  pendingApprovalDays: number;
  rejectedDays: number;
  totalHours: number;
  offDays: number;
  offDaysPayRs: number;
  regularPayRs: number;
  overtimeHours: number;
  bonusDays: number;
  bonusPayRs: number;
  salaryRs: number;
};

function firstOfMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

const rupee = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default function AdminOverviewPage() {
  const [from, setFrom] = useState(firstOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [stats, setStats] = useState<EmployeeStats[]>([]);
  const [totals, setTotals] = useState({
    totalHours: 0,
    totalSalaryRs: 0,
    totalMissed: 0,
    totalPendingApproval: 0,
    totalOvertimeHours: 0,
    totalBonusPayRs: 0,
    totalOffDaysPayRs: 0,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/stats?from=${from}&to=${to}`);
    const data = await res.json();
    setStats(data.stats ?? []);
    setTotals(
      data.totals ?? {
        totalHours: 0,
        totalSalaryRs: 0,
        totalMissed: 0,
        totalPendingApproval: 0,
        totalOvertimeHours: 0,
        totalBonusPayRs: 0,
        totalOffDaysPayRs: 0,
      }
    );
    setLoading(false);
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">Overview</h1>
        <div className="flex items-end gap-3">
          <DateField label="From" value={from} onChange={setFrom} />
          <DateField label="To" value={to} onChange={setTo} />
        </div>
      </div>

      <div className="grid sm:grid-cols-4 gap-4">
        <SummaryCard label="Approved hours" value={totals.totalHours.toFixed(1)} />
        <SummaryCard label="Salary due (approved)" value={rupee.format(totals.totalSalaryRs)} accent />
        <SummaryCard label="Needs approval" value={String(totals.totalPendingApproval)} warn />
        <SummaryCard label="Missed clock-ins" value={String(totals.totalMissed)} warn />
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <SummaryCard label="Paid off-days (Mondays)" value={rupee.format(totals.totalOffDaysPayRs)} />
        <SummaryCard label="Overtime hours" value={totals.totalOvertimeHours.toFixed(1)} />
        <SummaryCard label="Overtime bonus pay" value={rupee.format(totals.totalBonusPayRs)} accent />
      </div>

      {totals.totalPendingApproval > 0 && (
        <div className="bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 text-sm text-foreground/75">
          {totals.totalPendingApproval} completed{" "}
          {totals.totalPendingApproval === 1 ? "day is" : "days are"} waiting on your review in
          the{" "}
          <Link href="/admin/attendance" className="text-brand underline underline-offset-2 hover:text-brand-dark">
            Attendance Log
          </Link>{" "}
          — hours and salary above don&apos;t include them yet.
        </div>
      )}

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="bg-surface-muted text-foreground/60 text-left">
                <th className="px-4 py-2.5 font-medium">Employee</th>
                <th className="px-4 py-2.5 font-medium">Rate/hr</th>
                <th className="px-4 py-2.5 font-medium text-right">Present</th>
                <th className="px-4 py-2.5 font-medium text-right">Missed</th>
                <th className="px-4 py-2.5 font-medium text-right">Forgot out</th>
                <th className="px-4 py-2.5 font-medium text-right">Needs approval</th>
                <th className="px-4 py-2.5 font-medium text-right">Hours</th>
                <th className="px-4 py-2.5 font-medium text-right">Off days</th>
                <th className="px-4 py-2.5 font-medium text-right">OT hours</th>
                <th className="px-4 py-2.5 font-medium text-right">Bonus days</th>
                <th className="px-4 py-2.5 font-medium text-right">Salary</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-6 text-center text-foreground/45">
                    Loading…
                  </td>
                </tr>
              ) : stats.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-6 text-center text-foreground/45">
                    No employees yet. Add one from the Employees tab.
                  </td>
                </tr>
              ) : (
                stats.map((s) => (
                  <tr key={s.userId} className="border-t border-border">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-foreground/45">
                        {s.employeeCode}
                        {!s.active && (
                          <span className="ml-2 text-danger">deactivated</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">₹{s.hourlyRateRs}</td>
                    <td className="px-4 py-2.5 text-right">{s.daysPresent}</td>
                    <td className="px-4 py-2.5 text-right">
                      {s.missedDays > 0 ? (
                        <span className="text-danger font-medium">{s.missedDays}</span>
                      ) : (
                        0
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {s.incompleteDays > 0 ? (
                        <span className="text-accent font-medium">{s.incompleteDays}</span>
                      ) : (
                        0
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {s.pendingApprovalDays > 0 ? (
                        <span className="text-accent font-medium">{s.pendingApprovalDays}</span>
                      ) : (
                        0
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">{s.totalHours.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right">{s.offDays}</td>
                    <td className="px-4 py-2.5 text-right">
                      {s.overtimeHours > 0 ? (
                        <span className="text-brand font-medium">{s.overtimeHours.toFixed(1)}</span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {s.bonusDays > 0 ? (
                        <span className="text-brand font-medium">{s.bonusDays.toFixed(2)}</span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold">
                      {rupee.format(s.salaryRs)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-foreground/40">
        Salary and hour figures on this page are visible to admins only. &ldquo;Missed&rdquo;
        counts calendar days in range (up to today) with no clock-in at all; &ldquo;Forgot
        out&rdquo; counts days clocked in but never clocked out. &ldquo;Needs approval&rdquo;
        counts completed days you haven&apos;t approved or rejected yet in the Attendance
        Log — neither of those, nor rejected days, count toward Hours or Salary.
      </p>
      <p className="text-xs text-foreground/40">
        How salary is worked out: a complete day is 9 hours — working less than that pays for the
        actual hours worked (pro-rated), not zero, and a day with no approved attendance pays
        nothing. Every Monday in the selected range is a paid off-day regardless of attendance
        (&ldquo;Off days&rdquo;). Hours worked beyond 9 in a day (&ldquo;OT hours&rdquo;)
        accumulate across the whole range and convert to bonus days at 8 overtime hours per day
        (&ldquo;Bonus days&rdquo;, fractional) — e.g. 4 accumulated OT hours is half a bonus day,
        16 is two. Salary = off-day pay + regular day pay + bonus-day pay, all at each
        employee&apos;s daily rate (hourly rate × 9).
      </p>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-sm">
      <span className="block text-foreground/55 mb-1">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
      />
    </label>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <p className="text-sm text-foreground/55">{label}</p>
      <p
        className={`mt-1.5 text-2xl font-bold ${
          accent ? "text-brand" : warn ? "text-danger" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
