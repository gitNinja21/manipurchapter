import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeStatsForRange } from "@/lib/stats";
import { formatWorkDate, todayWorkDate } from "@/lib/time";
import HomeSummary from "@/components/team/HomeSummary";
import MetricCard from "@/components/admin/MetricCard";

export const dynamic = "force-dynamic";
export default async function AdminOverviewPage() {
  if (!(await requireAdmin())) redirect("/");
  const today = todayWorkDate();
  const month = `${today.slice(0, 7)}-01`;
  const [
    employees,
    stats,
    pendingCount,
    incompleteCount,
    pending,
    incomplete,
    signups,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { role: "EMPLOYEE", active: true, approved: true },
      select: {
        id: true,
        name: true,
        employeeCode: true,
        attendance: {
          where: { workDate: today },
          select: { clockInAt: true, clockOutAt: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    computeStatsForRange(month, today),
    prisma.attendanceRecord.count({
      where: {
        workDate: { lte: today },
        clockInAt: { not: null },
        clockOutAt: { not: null },
        approvalStatus: "PENDING",
      },
    }),
    prisma.attendanceRecord.count({
      where: {
        workDate: { lt: today },
        clockInAt: { not: null },
        clockOutAt: null,
      },
    }),
    prisma.attendanceRecord.findMany({
      where: {
        workDate: { lte: today },
        clockInAt: { not: null },
        clockOutAt: { not: null },
        approvalStatus: "PENDING",
      },
      include: { user: { select: { name: true } } },
      orderBy: { workDate: "asc" },
      take: 4,
    }),
    prisma.attendanceRecord.findMany({
      where: {
        workDate: { lt: today },
        clockInAt: { not: null },
        clockOutAt: null,
      },
      include: { user: { select: { name: true } } },
      orderBy: { workDate: "asc" },
      take: 4,
    }),
    prisma.user.findMany({
      where: { role: "EMPLOYEE", approved: false },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const present = employees.filter((e) =>
    e.attendance.some((r) => r.clockInAt),
  ).length;
  const monday = new Date(`${today}T00:00:00Z`).getUTCDay() === 1;
  const missing = monday ? 0 : employees.length - present;
  const salary = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(stats.reduce((n, s) => n + s.salaryRs, 0));
  const attendanceLink = (status: string) =>
    `/admin/attendance?from=2000-01-01&to=${today}&status=${status}`;
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-foreground/55 mb-2">
            Your daily workspace
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-foreground/60 mt-2">
            {formatWorkDate(today)} · IST
            {monday ? " · Paid Monday off-day" : ""}
          </p>
        </div>
        <Link
          className="admin-button"
          href={`/admin/attendance?from=${today}&to=${today}`}
        >
          View today’s attendance →
        </Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          label="Present today"
          value={`${present} / ${employees.length}`}
          detail="Active, approved employees"
          href={`/admin/attendance?from=${today}&to=${today}`}
        />
        <MetricCard
          label="Missing clock-ins"
          value={missing}
          detail={
            monday ? "No attendance expected today" : "Not clocked in yet today"
          }
          href="#today-team"
        />
        <MetricCard
          label="Awaiting approval"
          value={pendingCount}
          detail="Completed shifts · all dates"
          href={attendanceLink("PENDING")}
        />
        <MetricCard
          label="Salary this month"
          value={salary}
          detail={`${formatWorkDate(month)} – ${formatWorkDate(today)}`}
          href="/admin/payroll"
        />
      </div>
      <section className="admin-panel p-5 sm:p-6">
        <div className="flex justify-between gap-3 items-center">
          <h2 className="text-lg font-semibold">Needs attention</h2>
          <span className="admin-badge">
            {pendingCount + incompleteCount + signups.length} items
          </span>
        </div>
        <p className="text-sm text-foreground/60 mt-1 mb-5">
          Review outstanding items before finalising payroll.
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              title: "Attendance to approve",
              count: pendingCount,
              href: attendanceLink("PENDING"),
              items: pending.map((r) => ({
                id: r.id,
                label: r.user.name,
                detail: formatWorkDate(r.workDate),
                href: `/admin/attendance?from=${r.workDate}&to=${r.workDate}&userId=${r.userId}&status=PENDING`,
              })),
            },
            {
              title: "Missing clock-outs",
              count: incompleteCount,
              href: attendanceLink("INCOMPLETE"),
              items: incomplete.map((r) => ({
                id: r.id,
                label: r.user.name,
                detail: formatWorkDate(r.workDate),
                href: `/admin/attendance?from=${r.workDate}&to=${r.workDate}&userId=${r.userId}&status=INCOMPLETE`,
              })),
            },
            {
              title: "New employee requests",
              count: signups.length,
              href: "/admin/employees?status=pending",
              items: signups.slice(0, 4).map((e) => ({
                id: e.id,
                label: e.name,
                detail: "Awaiting account approval",
                href: `/admin/employees?status=pending&q=${encodeURIComponent(e.name)}`,
              })),
            },
          ].map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-semibold">
                {group.title}{" "}
                <span className="text-foreground/50">({group.count})</span>
              </h3>
              <ul className="mt-2 divide-y divide-border">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      className="block py-3 hover:text-brand"
                      href={item.href}
                    >
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-foreground/55 mt-1">
                        {item.detail}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
              {!group.count && (
                <p className="text-sm text-foreground/55 py-4">All clear.</p>
              )}
              {group.count > 0 && (
                <Link
                  className="text-sm font-medium text-brand underline underline-offset-4"
                  href={group.href}
                >
                  Review all →
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="admin-panel overflow-hidden" id="today-team">
        <div className="p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Today’s team</h2>
            <p className="text-sm text-foreground/60 mt-1">
              {monday
                ? "Monday is a paid off-day."
                : "Live clock-in status; a missing clock-in is not a final absence."}
            </p>
          </div>
          <Link className="admin-button" href="/admin/employees">
            Manage employees
          </Link>
        </div>
        <div className="admin-table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left px-5 py-3">Employee</th>
                <th className="text-left px-5 py-3">Today</th>
                <th className="text-right px-5 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-5 py-3 font-medium">
                    {e.name}
                    <span className="block text-xs font-normal text-foreground/55">
                      {e.employeeCode}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="admin-badge">
                      {e.attendance[0]?.clockOutAt
                        ? "Shift finished"
                        : e.attendance[0]?.clockInAt
                          ? "Clocked in"
                          : monday
                            ? "Paid off-day"
                            : "Not clocked in"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      className="text-brand underline underline-offset-4"
                      href={`/admin/attendance?from=${today}&to=${today}&userId=${e.id}`}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!employees.length && (
            <p className="p-6 text-sm text-foreground/60">
              No active, approved employees yet.
            </p>
          )}
        </div>
      </section>
      <HomeSummary admin />
      <p className="text-xs text-foreground/60">
        Salary includes approved work, paid Mondays, and earned overtime
        bonuses. Review the full breakdown in Payroll.
      </p>
    </div>
  );
}
