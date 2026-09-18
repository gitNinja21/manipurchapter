"use client";
import Link from "next/link";
import { formatWorkDate } from "@/lib/time";
import { useTeamData } from "./useTeamData";
import { ErrorNotice } from "./TeamCommon";
export default function Birthdays() {
  const { data, error, loading } = useTeamData<{
    today: string;
    admin: boolean;
    birthdays: {
      id: string;
      name: string;
      nextDate: string;
      shareBirthday: boolean;
    }[];
  }>("/api/team/birthdays", 60000);
  return (
    <div className="space-y-4">
      <div className="flex justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Team birthdays</h2>
          <p className="text-sm text-foreground/60">
            Upcoming celebrations · no ages displayed
          </p>
        </div>
        <Link className="admin-button" href="/account">
          My birthday
        </Link>
      </div>
      <ErrorNotice error={error} />
      {loading && <p>Loading birthdays…</p>}
      <div className="grid sm:grid-cols-2 gap-3">
        {data?.birthdays.map((p) => (
          <div className="admin-panel p-5" key={p.id}>
            <p className="font-semibold">
              {p.nextDate === data.today ? "🎂 " : ""}
              {p.name}
            </p>
            <p className="text-sm mt-2">
              {p.nextDate === data.today
                ? "Happy birthday today!"
                : formatWorkDate(p.nextDate)}
            </p>
            {!p.shareBirthday && (
              <span className="admin-badge mt-2">
                Private · visible to you and admins
              </span>
            )}
          </div>
        ))}
      </div>
      {data && !data.birthdays.length && (
        <p className="admin-panel p-6 text-foreground/60">
          No birthdays have been shared yet.
        </p>
      )}
    </div>
  );
}
