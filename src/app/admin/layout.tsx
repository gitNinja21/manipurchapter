import { getSession } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <div className="flex-1 flex flex-col bg-background">
      <AppHeader
        name={session?.name ?? ""}
        subtitle="Admin Dashboard"
        tabs={[
          { href: "/admin", label: "Overview" },
          { href: "/admin/employees", label: "Employees" },
          { href: "/admin/employee-dashboard", label: "Employee view" },
          { href: "/admin/attendance", label: "Attendance" },
          { href: "/admin/payroll", label: "Payroll" },
          { href: "/admin/audit", label: "Audit history" },
          { href: "/admin/announcements", label: "Announcements" },
          { href: "/admin/team", label: "Team" },
        ]}
      />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}
