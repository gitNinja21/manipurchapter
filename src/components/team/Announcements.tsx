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
              sends push alerts to subscribed devices when configured.
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
            {report ? "Hide acknowledgements" : "Who has acknowledged?"}
          </button>
        )}
      </div>
      {report && <Acknowledgements id={a.id} />}
    </article>
  );
}
function Acknowledgements({ id }: { id: string }) {
  const { data, error } = useTeamData<{
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
