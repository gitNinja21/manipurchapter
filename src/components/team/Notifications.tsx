"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, useAction, useTeamData } from "./useTeamData";
import { ErrorNotice, Pager } from "./TeamCommon";
import { formatIstDateTime } from "@/lib/time";
import PushSettings from "./PushSettings";
type Notice = {
  id: string;
  title: string;
  kind: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};
export default function Notifications() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useTeamData<{
    items: Notice[];
    total: number;
    unread: number;
  }>(`/api/team/notifications?page=${page}`, 20000);
  const action = useAction(reload);
  const router = useRouter();
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="text-sm text-foreground/60 mt-1">
            {data?.unread ?? 0} unread · opening a notice is separate from
            acknowledging an announcement.
          </p>
        </div>
        <button
          className="admin-button"
          disabled={action.busy || !data?.unread}
          onClick={() =>
            void action.run(() =>
              api("/api/team/notifications", "PATCH", { all: true }),
            )
          }
        >
          Mark all read
        </button>
      </div>
      <ErrorNotice error={error || action.error} />
      {loading && <p>Loading notifications…</p>}
      <div className="admin-panel divide-y divide-border overflow-hidden">
        {data?.items.map((n) => (
          <button
            key={n.id}
            className={`block w-full text-left p-4 hover:bg-surface-muted ${n.readAt ? "" : "bg-brand/5"}`}
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await api("/api/team/notifications", "PATCH", { id: n.id });
                router.push(n.href);
              })
            }
          >
            <span className="font-medium text-sm">
              {!n.readAt ? "● " : ""}
              {n.title}
            </span>
            <span className="block text-xs text-foreground/60 mt-1">
              {formatIstDateTime(new Date(n.createdAt))} ·{" "}
              {n.kind.toLowerCase().replaceAll("_", " ")}
            </span>
          </button>
        ))}
        {data && !data.items.length && (
          <p className="p-6 text-sm text-foreground/60">
            You’re all caught up.
          </p>
        )}
      </div>
      {data && <Pager page={page} total={data.total} onPage={setPage} />}
      <PushSettings />
    </div>
  );
}
