import { getSession } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <div className="flex-1 flex flex-col bg-background">
      <AppHeader
        name={session?.name ?? ""}
        subtitle="Staff Attendance"
        tabs={[
          { href: "/employee", label: "Clock In / Out" },
          { href: "/employee/history", label: "My Attendance" },
          { href: "/employee/announcements", label: "Announcements" },
          { href: "/employee/team", label: "Team" },
          { href: "/employee/reviews", label: "Reviews" },
        ]}
      />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}
