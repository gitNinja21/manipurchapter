"use client";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, useAction, useTeamData } from "./useTeamData";
import { ErrorNotice, Pager } from "./TeamCommon";
import { formatIstDateTime } from "@/lib/time";
type Announcement = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  author: { name: string };
  acknowledgements: { acknowledgedAt: string }[];
};
export default function Announcements({ admin }: { admin: boolean }) {
  const params = useSearchParams(),
    router = useRouter(),
    path = usePathname(),
    selected = params.get("announcement");
  const [page, setPage] = useState(1),
    [title, setTitle] = useState(""),
    [body, setBody] = useState("");
  const url = selected
    ? `/api/announcements/${encodeURIComponent(selected)}/detail`
    : `/api/announcements?page=${page}`;
  const { data, error, loading, reload } = useTeamData<{
    announcements?: Announcement[];
    announcement?: Announcement;
    total?: number;
    voiceConfigured?: boolean;
  }>(url, 30000);
  const action = useAction(reload);
  const items = data?.announcement
    ? [data.announcement]
    : (data?.announcements ?? []);
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Announcements</h1>
          <p className="text-sm text-foreground/60 mt-1">
            Important updates for the whole team.
          </p>
        </div>
        {selected && (
          <button className="admin-button" onClick={() => router.replace(path)}>
            All announcements
          </button>
        )}
      </div>
      {admin && data && !data.voiceConfigured && <p className="admin-panel p-4 text-sm text-accent">Voice calling is not configured. Announcements will still be posted, but employees will not receive calls until the calling account is connected.</p>}
      {admin && (
        <details className="admin-panel p-5">
          <summary className="font-medium cursor-pointer">
            Post an announcement
          </summary>
          <form
            className="space-y-3 mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                await api("/api/announcements", "POST", { title, body });
                setTitle("");
                setBody("");
                setPage(1);
                if (selected) router.replace(path);
              });
            }}
          >
            <label className="block text-sm">
              Title
              <input
                className="input mt-1"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={150}
                required
              />
            </label>
            <label className="block text-sm">
              Message
              <textarea
                className="input mt-1"
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={10000}
                required
              />
            </label>
            <p className="text-xs text-foreground/60">
              Posting creates in-app notifications for active team members and
              sends push alerts to subscribed devices when configured. When voice calling is connected, every new announcement also calls all active employees in English. Press 1 acknowledges; unanswered calls retry once after five minutes.
            </p>
            <button className="admin-button" disabled={action.busy}>
              {action.busy ? "Posting…" : "Post and notify team"}
            </button>
          </form>
        </details>
      )}
      <ErrorNotice error={error || action.error} />
      {loading && <p>Loading announcements…</p>}
      {items.map((a) => (
        <AnnouncementCard
          key={a.id}
          a={a}
          admin={admin}
          reload={reload}
          afterDelete={() => {
            reload();
            if (selected) router.replace(path);
          }}
        />
      ))}
      {data && !items.length && (
        <p className="admin-panel p-6 text-foreground/60">
          No announcements yet.
        </p>
      )}
      {!selected && data && (
        <Pager page={page} total={data.total ?? 0} size={20} onPage={setPage} />
      )}
    </div>
  );
}
function AnnouncementCard({
  a,
  admin,
  reload,
  afterDelete,
}: {
  a: Announcement;
  admin: boolean;
  reload: () => void;
  afterDelete: () => void;
}) {
  const action = useAction(reload);
  const [report, setReport] = useState(false);
  return (
    <article className="admin-panel p-5 space-y-3">
      <div className="flex justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg break-words">{a.title}</h2>
          <p className="text-xs text-foreground/60 mt-1">
            {formatIstDateTime(new Date(a.createdAt))} · {a.author.name}
          </p>
        </div>
        {admin && (
          <button
            className="text-xs text-danger underline self-start"
            disabled={action.busy}
            onClick={() => {
              if (
                window.confirm(
                  "Delete this announcement and its notifications?",
                )
              )
                void action.run(async () => {
                  await api(`/api/announcements/${a.id}`, "DELETE");
                  afterDelete();
                });
            }}
          >
            Delete
          </button>
        )}
      </div>
      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
        {a.body}
      </p>
      <ErrorNotice error={action.error} />
      <div className="flex flex-wrap gap-3 items-center">
        {a.acknowledgements.length ? (
          <span className="admin-badge !text-success">
            ✓ Acknowledged{" "}
            {formatIstDateTime(new Date(a.acknowledgements[0].acknowledgedAt))}
          </span>
        ) : (
          <button
            className="admin-button"
            disabled={action.busy}
            onClick={() =>
              void action.run(() =>
                api(`/api/announcements/${a.id}/ack`, "POST", {}),
              )
            }
          >
            I’ve read this
          </button>
        )}
        {admin && (
          <button className="admin-button" onClick={() => setReport(!report)}>
            {report ? "Hide delivery report" : "Calls & acknowledgements"}
          </button>
        )}
      </div>
      {report && <Acknowledgements id={a.id} />}
    </article>
  );
}
function Acknowledgements({ id }: { id: string }) {
  const { data, error } = useTeamData<{
    calls: {userId:string;status:string;attempts:number;nextAttemptAt:string;acknowledgedAt:string|null;error:string|null;user:{name:string;employeeCode:string}}[];
    people: {
      id: string;
      name: string;
      employeeCode: string;
      acknowledgements: { acknowledgedAt: string }[];
    }[];
  }>(`/api/announcements/${id}/ack`, 30000);
  return (
    <div className="rounded-lg bg-surface-muted p-4">
      <ErrorNotice error={error} />
      {!data ? (
        <p className="text-sm">Loading…</p>
      ) : (
        <>
          <p className="font-medium text-sm">
            {data.people.filter((p) => p.acknowledgements.length).length} of{" "}
            {data.people.length} current employees acknowledged
          </p>
          <h3 className="font-semibold text-sm mt-4">Voice calls</h3>
          {!data.calls?.length && <p className="text-xs text-foreground/60">No voice calls were scheduled for this announcement.</p>}
          <ul className="divide-y divide-border mt-2">{data.calls?.map(c=><li key={c.userId} className="py-2 text-sm">
            <strong>{c.user.name}</strong> · {callLabel(c.status)} · {c.attempts} of 2 attempts
            {c.status === "RETRY_WAIT" && <p className="text-xs">Retry after {formatIstDateTime(new Date(c.nextAttemptAt))}</p>}
            {c.acknowledgedAt && <p className="text-xs">Pressed 1 at {formatIstDateTime(new Date(c.acknowledgedAt))}</p>}
            {c.error && <p className="text-xs text-accent">{c.error}</p>}
          </li>)}</ul>
          <h3 className="font-semibold text-sm mt-4">All acknowledgements</h3>
          <ul className="divide-y divide-border max-h-72 overflow-auto mt-2">
            {data.people.map((p) => (
              <li
                className="py-2 text-sm flex justify-between gap-3"
                key={p.id}
              >
                <span>
                  {p.name}{" "}
                  <span className="text-xs text-foreground/55">
                    {p.employeeCode}
                  </span>
                </span>
                <span className="text-xs">
                  {p.acknowledgements.length
                    ? formatIstDateTime(
                        new Date(p.acknowledgements[0].acknowledgedAt),
                      )
                    : "Not acknowledged"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function callLabel(status:string) {
  const labels:Record<string,string>={QUEUED:"Waiting to call",SENDING:"Starting call",CALLING:"Call in progress",ACKNOWLEDGED:"Acknowledged by phone",ACKNOWLEDGED_ON_WEB:"Acknowledged on website",RETRY_WAIT:"Unanswered / failed · retry scheduled",UNANSWERED:"Unanswered",FAILED:"Failed",NO_ACK:"Call ended without acknowledgement",UNKNOWN:"Delivery unknown",INVALID_NUMBER:"Missing or invalid phone number",NOT_CONFIGURED:"Calling not configured",SKIPPED:"Skipped"};
  return labels[status] ?? status;
}
