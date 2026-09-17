import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";
import ChangePasswordForm from "@/components/ChangePasswordForm";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const tabs =
    user.role === "ADMIN"
      ? [
          { href: "/admin", label: "Overview" },
          { href: "/admin/employees", label: "Employees" },
          { href: "/admin/attendance", label: "Attendance Log" },
          { href: "/admin/announcements", label: "Announcements" },
        ]
      : [
          { href: "/employee", label: "Clock In / Out" },
          { href: "/employee/history", label: "My Attendance" },
          { href: "/employee/announcements", label: "Announcements" },
        ];

  return (
    <div className="flex-1 flex flex-col bg-background">
      <AppHeader
        name={user.name}
        subtitle={user.role === "ADMIN" ? "Admin Dashboard" : "Staff Attendance"}
        tabs={tabs}
      />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">
        <div className="max-w-sm space-y-6">
          <div className="flex items-center gap-4">
            {user.profilePhoto && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/photos/${user.profilePhoto}`}
                alt=""
                className="w-16 h-16 rounded-full object-cover border border-border"
              />
            )}
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
                My account
              </h1>
              <p className="text-sm text-foreground/55 mt-1">
                Signed in as <span className="font-medium">{user.employeeCode}</span>
              </p>
            </div>
          </div>
          <div className="bg-surface border border-border rounded-2xl p-6">
            <ChangePasswordForm />
          </div>
        </div>
      </main>
    </div>
  );
}
