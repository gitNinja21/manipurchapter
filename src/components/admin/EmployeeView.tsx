"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import EmployeeDashboard from "@/components/EmployeeDashboard";

type Employee = { id: string; name: string; employeeCode: string; active: boolean; approved: boolean; mustChangePassword: boolean };
export default function EmployeeView({ employees, employee }: { employees: Employee[]; employee: Employee }) {
  const router = useRouter();
  const query = encodeURIComponent(employee.id);
  return (
    <div className="space-y-6">
      <section className="admin-panel p-5 space-y-3">
        <h1 className="text-2xl font-semibold">Employee view</h1>
        <label className="block text-sm">
          Choose employee
          <select className="input mt-2" value={employee.id} onChange={e => router.push(`/admin/employee-dashboard?employeeId=${encodeURIComponent(e.target.value)}`)}>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name} · {e.employeeCode}{!e.active ? " · Inactive" : !e.approved ? " · Awaiting approval" : e.mustChangePassword ? " · Onboarding" : ""}</option>)}
          </select>
        </label>
        <p className="text-sm"><strong>Viewing {employee.name}’s dashboard · Read only</strong></p>
        <p className="text-sm text-foreground/60">Live attendance, schedule and monthly totals from their dashboard. Refreshes every 30 seconds. You remain signed in as admin; clock controls are disabled and unread counts stay unchanged.</p>
        {(!employee.active || !employee.approved || employee.mustChangePassword) && <p className="text-sm text-accent">This employee cannot access their dashboard yet: {!employee.active ? "account deactivated" : employee.mustChangePassword ? "onboarding incomplete" : "awaiting account approval"}. Their attendance information is shown below.</p>}
        <div className="flex flex-wrap gap-3 text-sm">
          <Link className="text-brand underline" href={`/admin/attendance?userId=${query}`}>Attendance history</Link>
          <Link className="text-brand underline" href={`/admin/team?view=performance&employeeId=${query}`}>Points & manager talks</Link>
          <Link className="text-brand underline" href="/admin/employees">Back to employees</Link>
        </div>
      </section>
      <EmployeeDashboard key={employee.id} previewEmployeeId={employee.id} />
    </div>
  );
}
