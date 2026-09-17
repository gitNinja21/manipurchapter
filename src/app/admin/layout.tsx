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
          { href: "/admin/attendance", label: "Attendance Log" },
          { href: "/admin/announcements", label: "Announcements" },
        ]}
      />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}
