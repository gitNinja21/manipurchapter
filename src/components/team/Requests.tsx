"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, useAction, useTeamData } from "./useTeamData";
import { ErrorNotice, Pager } from "./TeamCommon";
import { formatIstDateTime, formatWorkDate, todayWorkDate } from "@/lib/time";
type RequestItem = {
  id: string;
  kind: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: string;
  proposedIn: string | null;
  extraTimeCutoff: string | null;
  proposedOut: string | null;
  reviewNote: string | null;
  reviewedBy: string | null;
  user: { name: string; employeeCode: string };
};
export default function Requests({ admin }: { admin: boolean }) {
  const params = useSearchParams();
  const [page, setPage] = useState(1),
    [filter, setFilter] = useState(admin ? "PENDING" : ""),
    [kind, setKind] = useState(params.get("kind") === "LATE_ARRIVAL" ? "LATE_ARRIVAL" : "LEAVE"),
    [from, setFrom] = useState(todayWorkDate()),
    [to, setTo] = useState(todayWorkDate()),
    [reason, setReason] = useState(""),
    [inTime, setInTime] = useState(""),
    [outTime, setOutTime] = useState("");
  const { data, error, loading, reload } = useTeamData<{
    requests: RequestItem[];
    total: number;
  }>(`/api/team/requests?page=${page}&status=${filter}`, 30000);
  const action = useAction(reload);
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">
          {admin ? "Team requests" : "My requests"}
        </h2>
        <p className="text-sm text-foreground/60 mt-1">
          Leave approvals update the calendar, not pay. Accepted corrections
          return the shift to attendance review.
        </p>
      </div>
      {!admin && (
        <details className="admin-panel p-5" open={params.get("kind") === "LATE_ARRIVAL" || undefined}>
          <summary className="font-medium cursor-pointer">
            Submit a request
          </summary>
          <form
            className="space-y-3 mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                await api("/api/team/requests", "POST", {
                  kind,
                  fromDate: from,
                  toDate: to,
                  reason,
                  ...(["CORRECTION", "SHIFT_CHANGE"].includes(kind)
                    ? {
                        proposedIn: inTime ? `${inTime}:00+05:30` : null,
                        proposedOut: outTime ? `${outTime}:00+05:30` : null,
                      }
                    : {}),
                });
                setReason("");
                setPage(1);
              });
            }}
          >
            <label className="block text-sm">
              Request type
              <select
                className="input mt-1"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="LEAVE">Leave</option>
                <option value="CORRECTION">Attendance correction</option>
                <option value="LATE_ARRIVAL">Excused late arrival</option>
                <option value="EARLY_DEPARTURE">Excused early departure</option>
                <option value="SHIFT_CHANGE">Temporary shift change (one day)</option>
              </select>
            </label>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm">
                {kind === "LEAVE" ? "From" : "Work date (clock-in date)"}
                <input
                  type="date"
                  className="input mt-1"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  required
                />
              </label>
              {kind === "LEAVE" && (
                <label className="text-sm">
                  To
                  <input
                    type="date"
                    className="input mt-1"
                    min={from}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    required
                  />
                </label>
              )}
            </div>
            {["CORRECTION", "SHIFT_CHANGE"].includes(kind) && (
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-sm">
                  Start / clock-in (IST)
                  <input
                    type="datetime-local"
                    className="input mt-1"
                    value={inTime}
                    onChange={(e) => setInTime(e.target.value)}
                    required
                  />
                </label>
                <label className="text-sm">
                  Finish / clock-out (IST)
                  <input
                    type="datetime-local"
                    className="input mt-1"
                    value={outTime}
                    onChange={(e) => setOutTime(e.target.value)}
                    required
                  />
                </label>
              </div>
            )}
            {kind === "SHIFT_CHANGE" && <p className="text-sm text-foreground/60">Only an approved request changes your shift for this date. Approval must happen before the new start and before any arrival is recorded. One hour is excluded for break.</p>}
            {kind === "LATE_ARRIVAL" && <p className="text-sm text-foreground/60">Explain why you will be late or are late. Approval excuses the lateness for the selected date only. You must still clock in with your location and selfie; submitting this request does not start paid time.</p>}
            <label className="block text-sm">
              Reason
              <textarea
                className="input mt-1"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                required
                rows={3}
              />
            </label>
            <button className="admin-button" disabled={action.busy}>
              {action.busy ? "Submitting…" : "Submit request"}
            </button>
          </form>
        </details>
      )}
      <ErrorNotice error={error || action.error} />
      <label className="block max-w-xs text-sm">
        Status
        <select
          className="input mt-1"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All requests</option>
          {["PENDING", "APPROVED", "REJECTED", "CANCELLED"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      {loading && <p>Loading requests…</p>}
      <div className="space-y-3">
        {data?.requests.map((r) => (
          <RequestCard key={r.id} r={r} admin={admin} reload={reload} />
        ))}
        {data && !data.requests.length && (
          <p className="admin-panel p-6 text-foreground/60">
            No requests in this view.
          </p>
        )}
      </div>
      {data && <Pager page={page} total={data.total} onPage={setPage} />}
    </div>
  );
}
function RequestCard({
  r,
  admin,
  reload,
}: {
  r: RequestItem;
  admin: boolean;
  reload: () => void;
}) {
  const [note, setNote] = useState("");
  const action = useAction(reload);
  return (
    <article className="admin-panel p-5 space-y-3">
      <div className="flex justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {r.kind === "LEAVE" ? "Leave" : r.kind === "LATE_ARRIVAL" ? "Late arrival" : r.kind === "SHIFT_CHANGE" ? "Temporary shift change" : r.kind === "EARLY_DEPARTURE" ? "Excused early departure" : r.kind === "EXTRA_TIME" ? "Extra time review" : "Attendance correction"}
            {admin ? ` · ${r.user.name}` : ""}
          </h3>
          <p className="text-xs text-foreground/60 mt-1">
            {formatWorkDate(r.fromDate)}
            {r.toDate !== r.fromDate ? ` – ${formatWorkDate(r.toDate)}` : ""}
          </p>
        </div>
        <span className="admin-badge self-start">{r.status}</span>
      </div>
      <p className="text-sm whitespace-pre-wrap break-words">{r.reason}</p>
      {r.proposedIn && r.proposedOut && (
        <p className="text-sm">
          Requested: {formatIstDateTime(new Date(r.proposedIn))} →{" "}
          {formatIstDateTime(new Date(r.proposedOut))}
        </p>
      )}
      {r.reviewedBy && (
        <p className="text-xs text-foreground/60">
          Reviewed by {r.reviewedBy}
          {r.reviewNote ? `: ${r.reviewNote}` : ""}
        </p>
      )}
      {r.kind === "EXTRA_TIME" && r.extraTimeCutoff && <p className="text-sm font-medium">Extra-time threshold: {formatIstDateTime(new Date(r.extraTimeCutoff))}</p>}
      {r.kind === "EXTRA_TIME" && <p className="text-sm text-foreground/60">{admin ? "Approve to count time after the review threshold. Reject to cap payable time at that threshold while keeping the actual clock-out. The 1-hour break still applies. Review and approve attendance separately afterwards." : "Time after the review threshold counts only if your admin approves it. Your actual clock-out is kept. The 1-hour break still applies, and attendance needs separate approval."}</p>}
      <ErrorNotice error={action.error} />
      {r.status === "PENDING" &&
        (admin ? (
          <div className="space-y-2">
            <label className="block text-sm">
              Review note
              <input
                className="input mt-1"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
              />
            </label>
            <div className="flex gap-2">
              {["APPROVED", "REJECTED"].map((s) => (
                <button
                  key={s}
                  className="admin-button"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(() =>
                      api(`/api/team/requests/${r.id}`, "PATCH", {
                        status: s,
                        reviewNote: note,
                      }),
                    )
                  }
                >
                  {s === "APPROVED" ? "Approve request" : "Reject request"}
                </button>
              ))}
            </div>
            {r.kind === "CORRECTION" && (
              <p className="text-xs text-foreground/60">
                Approval changes the times and resets attendance approval.
                Review salary impact in Attendance afterwards.
              </p>
            )}
          </div>
        ) : r.kind !== "EXTRA_TIME" ? (
          <button
            className="admin-button"
            disabled={action.busy}
            onClick={() =>
              void action.run(() =>
                api(`/api/team/requests/${r.id}`, "PATCH", {
                  status: "CANCELLED",
                }),
              )
            }
          >
            Cancel request
          </button>
        ) : null)}
    </article>
  );
}
