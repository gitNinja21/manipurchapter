"use client";
import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import type { EmployeeStats } from "@/lib/stats";
import { todayWorkDate, formatWorkDate } from "@/lib/time";
import { csvCell, validRange } from "@/lib/reporting";
import ReportControls from "@/components/admin/ReportControls";
import MetricCard from "@/components/admin/MetricCard";
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
export default function PayrollPage() {
  const today = todayWorkDate();
  const [range, setRange] = useState({
    from: `${today.slice(0, 7)}-01`,
    to: today,
  });
  const [stats, setStats] = useState<EmployeeStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setStats([]);
    setError("");
    setLoading(true);
    setExpanded(null);
    if (!validRange(range.from, range.to)) {
      setError("Choose a valid date range.");
      setLoading(false);
      return;
    }
    fetch(`/api/admin/stats?${new URLSearchParams(range)}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not load payroll.");
        return d;
      })
      .then((d) => setStats(d.stats))
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [range, retry]);
  const visible = stats.filter(
    (s) =>
      `${s.name} ${s.employeeCode}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (status === "all" ||
        (status === "active" && s.active) ||
        (status === "inactive" && !s.active) ||
        (status === "pending" && s.pendingApprovalDays > 0)),
  );
  const sum = (
    key: "salaryRs" | "regularPayRs" | "offDaysPayRs" | "bonusPayRs",
  ) => visible.reduce((n, s) => n + s[key], 0);
  function download() {
    const headers = [
      "Employee",
      "Employee code",
      "Status",
      "Report from",
      "Report to",
      "Billing from",
      "Hourly rate INR",
      "Daily rate INR",
      "Approved hours",
      "Paid day equivalents",
      "Paid Mondays",
      "Overtime hours in period",
      "Bonus days earned in period",
      "Overtime balance at period end",
      "Regular pay INR",
      "Off-day pay INR",
      "Bonus pay INR",
      "Total salary INR",
      "Pending approval days",
      "Rejected days",
    ];
    const rows = visible.map((s) => [
      s.name,
      s.employeeCode,
      s.active ? "Active" : "Inactive",
      range.from,
      range.to,
      s.billingFromDate,
      s.hourlyRateRs,
      s.dailyRateRs,
      s.totalHours,
      paidDays(s),
      s.offDays,
      s.overtimeHours,
      s.bonusDays,
      s.overtimeBalanceHours,
      s.regularPayRs,
      s.offDaysPayRs,
      s.bonusPayRs,
      s.salaryRs,
      s.pendingApprovalDays,
      s.rejectedDays,
    ]);
    const blob = new Blob(
      [
        "\uFEFF" +
          [headers, ...rows]
            .map((row) => row.map(csvCell).join(","))
            .join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8;" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${range.from}-to-${range.to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-foreground/55 mb-2">
            Pay with confidence
          </p>
          <h1 className="text-3xl font-semibold">Payroll</h1>
          <p className="text-sm text-foreground/60 mt-2">
            Review earnings, resolve pending shifts, and export your selected
            period.
          </p>
        </div>
        <button
          className="admin-button"
          disabled={loading || !!error || !visible.length}
          onClick={download}
        >
          Export CSV · {visible.length}{" "}
          {visible.length === 1 ? "employee" : "employees"}
        </button>
      </div>
      <section className="admin-panel p-4 space-y-4">
        <ReportControls
          {...range}
          onChange={(from, to) => setRange({ from, to })}
        />
        <div className="flex flex-wrap gap-3">
          <label className="flex-1 min-w-48">
            <span className="sr-only">Search employees</span>
            <input
              className="input"
              placeholder="Search employee name or ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">Employee status</span>
            <select
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All employees</option>
              <option value="active">Active employees</option>
              <option value="inactive">Inactive employees</option>
              <option value="pending">Needs attendance approval</option>
            </select>
          </label>
        </div>
      </section>
      {error && (
        <div role="alert" className="admin-panel p-4 text-danger">
          {error}{" "}
          <button className="underline" onClick={() => setRetry((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Total salary"
          value={loading || error ? "—" : money(sum("salaryRs"))}
          detail="Selected period · filtered employees"
        />
        <MetricCard
          label="Regular work"
          value={loading || error ? "—" : money(sum("regularPayRs"))}
          detail="Approved shifts only"
        />
        <MetricCard
          label="Paid Mondays"
          value={loading || error ? "—" : money(sum("offDaysPayRs"))}
          detail="From each employee’s join date"
        />
        <MetricCard
          label="Overtime bonus"
          value={loading || error ? "—" : money(sum("bonusPayRs"))}
          detail="Whole bonus days earned in period"
        />
      </div>
      <div className="admin-panel overflow-hidden">
        <div className="px-5 py-4 flex flex-wrap gap-2 justify-between">
          <h2 className="font-semibold">Employee earnings</h2>
          <span className="text-xs text-foreground/60">
            Select an employee to see the calculation
          </span>
        </div>
        <div className="admin-table-scroll">
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr>
                {[
                  "Employee",
                  "Billing from",
                  "Paid days*",
                  "Extra hours",
                  "Bonus days",
                  "Total salary",
                ].map((h) => (
                  <th key={h} className="text-left px-5 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <Fragment key={s.userId}>
                  <tr className="border-t border-border">
                    <td className="px-5 py-4">
                      <button
                        className="text-left font-medium hover:text-brand"
                        aria-expanded={expanded === s.userId}
                        aria-controls={`breakdown-${s.userId}`}
                        onClick={() =>
                          setExpanded(expanded === s.userId ? null : s.userId)
                        }
                      >
                        {s.name}{" "}
                        <span aria-hidden="true">
                          {expanded === s.userId ? "−" : "+"}
                        </span>
                        <span className="block text-xs font-normal text-foreground/55 mt-1">
                          {s.employeeCode}
                          {!s.active ? " · Inactive" : ""}
                        </span>
                      </button>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      {s.billingFromDate
                        ? formatWorkDate(s.billingFromDate)
                        : "Outside range"}
                    </td>
                    <td className="px-5 py-4 tabular-nums">{paidDays(s)}</td>
                    <td className="px-5 py-4 tabular-nums">
                      {s.overtimeHours.toFixed(2)} h
                      <span className="block text-xs text-foreground/55">
                        In this period
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-medium">{s.bonusDays} earned</span>
                      <span className="block text-xs text-foreground/60 mt-1">
                        {s.overtimeBalanceHours.toFixed(2)} / 8 h toward next
                      </span>
                      <progress
                        className="w-28 h-1.5 accent-brand"
                        max={8}
                        value={s.overtimeBalanceHours}
                        aria-label={`${s.name}: hours toward next bonus day`}
                      />
                    </td>
                    <td className="px-5 py-4 font-semibold whitespace-nowrap">
                      {money(s.salaryRs)}
                      {s.pendingApprovalDays > 0 && (
                        <span className="block font-normal text-xs text-foreground/60 mt-1">
                          {s.pendingApprovalDays}{" "}
                          {s.pendingApprovalDays === 1 ? "shift" : "shifts"}{" "}
                          pending
                        </span>
                      )}
                    </td>
                  </tr>
                  {expanded === s.userId && (
                    <tr id={`breakdown-${s.userId}`}>
                      <td colSpan={6} className="!static !bg-background p-5">
                        <div className="grid sm:grid-cols-2 gap-6">
                          <div>
                            <h3 className="font-semibold mb-3">
                              {s.name} · Salary breakdown
                            </h3>
                            <dl className="space-y-2">
                              {[
                                [
                                  "Regular approved work",
                                  money(s.regularPayRs),
                                ],
                                [
                                  `Paid Mondays (${s.offDays})`,
                                  money(s.offDaysPayRs),
                                ],
                                [
                                  `Bonus days (${s.bonusDays})`,
                                  money(s.bonusPayRs),
                                ],
                                ["Total salary", money(s.salaryRs)],
                              ].map(([label, value]) => (
                                <div
                                  className="flex justify-between gap-4"
                                  key={label}
                                >
                                  <dt className="text-foreground/65">
                                    {label}
                                  </dt>
                                  <dd className="font-medium">{value}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                          <div className="space-y-2 text-sm text-foreground/70">
                            <p>
                              Rate: {money(s.hourlyRateRs)}/hour ·{" "}
                              {money(s.dailyRateRs)}/day
                            </p>
                            <p>
                              {s.totalHours.toFixed(2)} approved hours ·{" "}
                              {s.fullDaysWorked} full shifts
                            </p>
                            <p>
                              {s.pendingApprovalDays} pending · {s.rejectedDays}{" "}
                              rejected · {s.incompleteDays} not clocked out
                            </p>
                            <p>
                              At the period end:{" "}
                              {s.overtimeBalanceHours.toFixed(2)} hours carried
                              toward the next bonus day.
                            </p>
                            <Link
                              className="inline-block text-brand underline underline-offset-4 mt-2"
                              href={`/admin/attendance?from=${range.from}&to=${range.to}&userId=${s.userId}`}
                            >
                              Review attendance →
                            </Link>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {loading ? (
            <p role="status" className="p-8 text-center text-foreground/60">
              Loading payroll…
            </p>
          ) : !visible.length && !error ? (
            <p className="p-8 text-center text-foreground/60">
              No employees match this view.
            </p>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-foreground/60">
        *Paid days are equivalent regular days plus paid Mondays; bonus days are
        separate. Short shifts are prorated. CSV exports match the filters above
        and contain calculated earnings, not payment confirmations.
      </p>
      <details className="admin-panel p-5 text-sm">
        <summary className="cursor-pointer font-medium">
          How salary is calculated
        </summary>
        <div className="mt-3 space-y-2 text-foreground/70">
          <p>
            New shifts are paid for actual clocked time up to 9 hours, including the paid break. Friday part-time shifts require 7 clock hours and pay 6 after the unpaid break. Missing hours are not topped up or deducted twice. A bonus day is worth the hourly rate × 9.
          </p>
          <p>
            Billing starts at account creation in IST. Regular staff have paid Mondays; part-time staff are paid for their assigned shifts. Only approved, completed working-day shifts count toward
            regular earnings and overtime.
          </p>
          <p>
            Approved clock hours beyond the required shift (normally 9; Friday part-time 7) accumulate per employee. Every
            completed 8 hours earns one bonus day. Unused hours carry across
            months; only bonuses earned within the selected dates appear here.
          </p>
          <p>
            Salary = regular pay + paid Monday pay + earned bonus pay.
            Historical attendance decisions can change later overtime balances;
            review the audit history when reconciling an earlier export.
          </p>
        </div>
      </details>
    </div>
  );
}
function paidDays(s: EmployeeStats) {
  return (s.paidWorkDays + s.offDays).toFixed(2);
}
