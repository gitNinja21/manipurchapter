"use client";
import Link from "next/link";
import { useTeamData } from "./useTeamData";
import { formatWorkDate, formatIstDateTime } from "@/lib/time";
import { ErrorNotice } from "./TeamCommon";
type Home = {
  today: string;
  month: string;
  birthdayToday: boolean;
  requests: number;
  unread: number;
  chatUnread: number;
  summary: null | {
    totalHours: number;
    overtimeHours: number;
    bonusDays: number;
    overtimeBalanceHours: number;
    pendingApprovalDays: number;
    fullDaysWorked: number;
  };
  nextShift: null | { startsAt: string; endsAt: string; note: string };
  birthdays: { id: string; name: string; nextDate: string; shared: boolean }[];
};
export default function HomeSummary({ admin = false }: { admin?: boolean }) {
  const { data, error } = useTeamData<Home>("/api/team/home", 30000);
  const root = admin ? "/admin" : "/employee";
  return (
    <div className="space-y-4">
      <ErrorNotice error={error} />
      {data?.birthdayToday && (
        <div className="admin-panel p-5 text-brand font-semibold">
          🎂 Happy birthday! Wishing you a wonderful day.
        </div>
      )}
      {data && (
        <>
          {!admin && (
            <div className="admin-panel p-5">
              <h2 className="font-semibold">Your next shift</h2>
              {data.nextShift ? (
                <>
                  <p className="text-sm mt-2">
                    {formatIstDateTime(new Date(data.nextShift.startsAt))} –{" "}
                    {formatIstDateTime(new Date(data.nextShift.endsAt))}
                  </p>
                  <p className="text-xs mt-1 text-foreground/60">
                    {data.nextShift.note}
                  </p>
                </>
              ) : (
                <p className="text-sm text-foreground/60 mt-2">
                  No upcoming shift assigned.
                </p>
              )}
              <Link
                className="text-sm text-brand underline mt-3 inline-block"
                href={`${root}/team?view=schedule`}
              >
                View weekly schedule
              </Link>
            </div>
          )}
          <div className="grid grid-cols-1 min-[400px]:grid-cols-3 gap-2">
            {[
              [`${root}/announcements`, "Announcements", data.unread],
              [`${root}/team?view=chat`, "Team chat", data.chatUnread],
              [`${root}/team?view=requests`, "Requests", data.requests],
            ].map(([href, label, count]) => (
              <Link
                key={label}
                href={String(href)}
                className="admin-panel p-3 text-sm"
              >
                <span className="block font-semibold">{label}</span>
                <span className="block text-foreground/60 mt-1">
                  {count} {label === "Requests" ? "pending" : "unread"}
                </span>
              </Link>
            ))}
          </div>
          {data.summary && (
            <div className="admin-panel p-5 space-y-3">
              <h2 className="font-semibold">Your attendance this month</h2>
              <p className="text-xs text-foreground/60">
                {formatWorkDate(data.month)} – {formatWorkDate(data.today)} ·
                approved work
              </p>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                {[
                  ["Hours worked", data.summary.totalHours],
                  ["Extra hours this month", data.summary.overtimeHours],
                  ["Bonus days earned", data.summary.bonusDays],
                  [
                    "Shifts awaiting approval",
                    data.summary.pendingApprovalDays,
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-foreground/60">{label}</dt>
                    <dd className="text-xl font-semibold mt-1">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-sm">
                {data.summary.overtimeBalanceHours.toFixed(2)} / 8 hours toward
                your next bonus day
              </p>
              <progress
                className="w-full accent-brand"
                max="8"
                value={data.summary.overtimeBalanceHours}
              />
            </div>
          )}
          <div className="admin-panel p-5">
            <div className="flex justify-between gap-3">
              <h2 className="font-semibold">Upcoming birthdays</h2>
              <Link
                className="text-sm text-brand underline"
                href={`${root}/team?view=birthdays`}
              >
                See all
              </Link>
            </div>
            {data.birthdays.map((b) => (
              <p className="text-sm mt-3" key={b.id}>
                {b.nextDate === data.today ? "🎂 " : ""}
                {b.name} · {formatWorkDate(b.nextDate)}
                {!b.shared ? " · Private" : ""}
              </p>
            ))}
            {!data.birthdays.length && (
              <p className="text-sm text-foreground/60 mt-3">
                No birthdays shared yet.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
