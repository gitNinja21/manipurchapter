"use client";
import Link from "next/link";
import { useTeamData } from "./useTeamData";
export default function NotificationBell({ root }: { root: string }) {
  const { data } = useTeamData<{ unread: number }>(
    "/api/team/notifications",
    20000,
  );
  const n = data?.unread ?? 0;
  return (
    <Link
      href={`${root}/notifications`}
      aria-label={`Notifications, ${n} unread`}
      className="relative text-sm rounded-lg px-2 sm:px-3 py-1.5 bg-white/10 border border-white/20 hover:bg-white/20 whitespace-nowrap"
    >
      🔔<span className="hidden lg:inline ml-1">Notifications</span>
      {n > 0 && (
        <span className="ml-1 bg-white text-brand rounded-full px-1.5 text-xs font-semibold">
          {n > 99 ? "99+" : n}
        </span>
      )}
    </Link>
  );
}
