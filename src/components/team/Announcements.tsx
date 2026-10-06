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
  audience: string;
  sendSms: boolean;
  sendCall: boolean;
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
  const [audience, setAudience] = useState("ALL");
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [sendSms, setSendSms] = useState(true), [sendCall, setSendCall] = useState(true);
  const url = selected
    ? `/api/announcements/${encodeURIComponent(selected)}/detail`
    : `/api/announcements?page=${page}`;
  const { data, error, loading, reload } = useTeamData<{
    announcements?: Announcement[];
    announcement?: Announcement;
    total?: number;
    voiceConfigured?: boolean;
    smsConfigured?: boolean;
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
            Updates for everyone or selected team members.
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
                await api("/api/announcements", "POST", { title, body, audience, recipientIds, sendSms, sendCall });
                setTitle("");
                setBody("");
                setPage(1);
                if (selected) router.replace(path);
              });
            }}
          >
            <label className="block text-sm">Send to
              <select className="input mt-1" value={audience} onChange={e=>setAudience(e.target.value)}>
                <option value="ALL">All employees</option>
                <option value="SELECTED">Selected employees</option>
              </select>
            </label>
            {audience === "SELECTED" && <RecipientPicker selected={recipientIds} onChange={setRecipientIds} />}
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <legend className="mb-2">Phone delivery</legend>
              <label className="flex items-center gap-2"><input type="checkbox" checked={sendSms} onChange={e=>setSendSms(e.target.checked)} />SMS</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={sendCall} onChange={e=>setSendCall(e.target.checked)} />Phone call</label>
            </fieldset>
            {sendSms && data && !data.smsConfigured && <p className="text-sm text-accent" role="status">SMS is not configured. The announcement will be saved, but texts will not be sent. Delivery reports will show “SMS not configured”.</p>}
            <p className="text-xs text-foreground/60">Only recipients and admins can read this announcement. Website notifications are included. “All employees” includes active, approved employees at posting time.</p>
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
              Calls use English. Press 1 acknowledges; unanswered calls retry once after five minutes.
              SMS contains the title and message; longer texts cost multiple SMS segments. SMS delivery does not mark an announcement as read.
            </p>
            {sendSms && <p className={`text-xs ${title.length+body.length>1500 ? "text-danger" : "text-foreground/60"}`}>{title.length+body.length} / 1,500 characters for SMS</p>}
            <button className="admin-button" disabled={action.busy || (audience === "SELECTED" && !recipientIds.length) || (sendSms && title.length+body.length>1500)}>
              {action.busy ? "Posting…" : "Post and notify recipients"}
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
            {admin && <> · {a.audience === "SELECTED" ? "Selected employees" : "All employees"} · {[a.sendSms && "SMS",a.sendCall && "Call","Website"].filter(Boolean).join(" + ")}</>}
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
            {report ? "Hide delivery report" : "Delivery & acknowledgements"}
          </button>
        )}
      </div>
      {report && <Acknowledgements id={a.id} />}
    </article>
  );
}
function Acknowledgements({ id }: { id: string }) {
  const { data, error } = useTeamData<{
    sms: {userId:string;status:string;error:string|null;user:{name:string;employeeCode:string}}[];
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
            {data.people.length} recipients acknowledged
          </p>
          <h3 className="font-semibold text-sm mt-4">SMS</h3>
          {!data.sms?.length && <p className="text-xs text-foreground/60">No SMS scheduled.</p>}
          <ul className="divide-y divide-border mt-2">{data.sms?.map(message=><li key={message.userId} className="py-2 text-sm">
            <strong>{message.user.name}</strong> · {smsLabel(message.status)}
            {message.error && <p className="text-xs text-accent">{message.error}</p>}
          </li>)}</ul>
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

function RecipientPicker({selected,onChange}:{selected:string[];onChange:(ids:string[])=>void}) {
  const {data,error} = useTeamData<{employees:{id:string;name:string;employeeCode:string}[]}>("/api/announcements/recipients",30000);
  const [search,setSearch] = useState("");
  return <fieldset className="rounded-lg border border-border p-3 space-y-2">
    <legend className="text-sm">Select employees ({selected.length})</legend>
    <ErrorNotice error={error} />
    <input className="input" placeholder="Search employees" aria-label="Search employees" value={search} onChange={e=>setSearch(e.target.value)} />
    {!data && !error && <p className="text-sm">Loading employees…</p>}
    <div className="max-h-56 overflow-auto space-y-2">{data?.employees.filter(e=>`${e.name} ${e.employeeCode}`.toLowerCase().includes(search.toLowerCase())).map(e=><label key={e.id} className="flex gap-2 items-center text-sm">
      <input type="checkbox" checked={selected.includes(e.id)} onChange={event=>onChange(event.target.checked ? [...selected,e.id] : selected.filter(id=>id!==e.id))} />{e.name} <span className="text-foreground/60">{e.employeeCode}</span>
    </label>)}</div>
  </fieldset>;
}
function smsLabel(status:string) {
  const labels:Record<string,string> = {QUEUED:"Waiting to send",SENDING:"Sending",ACCEPTED:"Accepted by provider",PROVIDER_QUEUED:"Queued by provider",SENDING_PROVIDER:"Sending through provider",SENT:"Sent (delivery unconfirmed)",DELIVERED:"Delivered",FAILED:"Failed",UNDELIVERED:"Undelivered",UNKNOWN:"Delivery unknown",NOT_CONFIGURED:"SMS not configured",INVALID_NUMBER:"Missing or invalid phone number",SKIPPED:"Skipped"};
  return labels[status] ?? status;
}
