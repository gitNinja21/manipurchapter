"use client";
import { salaryCredit, offDay, type PolicyRecord } from "@/lib/performance";
import { clockedMs, durationLabel } from "@/lib/attendanceTime";
import { overtimeMs } from "@/lib/performance";
import { useEffect, useState } from "react";
import {
  formatWorkDate,
  formatIstTime,
  todayWorkDate,
} from "@/lib/time";
import { validRange, weekStart } from "@/lib/reporting";
import ReportControls from "@/components/admin/ReportControls";
import ManualAttendance from "@/components/admin/ManualAttendance";
import AttendanceReview from "@/components/admin/AttendanceReview";
type AttendanceRecord = PolicyRecord & {
  id: string;
  workDate: string;
  unpaidBreakMinutes: number;
  policyVersion: number;
  shiftDurationMinutes: number;
  extraTimeCutoff: string | null;
  extraTimeStatus: string;
  lateClockOutStatus: string;
  lateClockOutCutoff: string | null;
  extraTimeReason: string | null;
  clockInAt: string | null;
  clockOutAt: string | null;
  clockInPhoto: string | null;
  clockOutPhoto: string | null;
  clockInFaceMatch: boolean | null;
  clockOutFaceMatch: boolean | null;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  user: { name: string; employeeCode: string };
};
export default function AdminAttendancePage() {
  const today = todayWorkDate();
  const [filters, setFilters] = useState({
    from: weekStart(today),
    to: today,
    status: "",
    q: "",
    userId: "",
  });
  const [ready, setReady] = useState(false),
    [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setFilters((f) => ({
      from: p.get("from") || f.from,
      to: p.get("to") || f.to,
      status: p.get("status") || "",
      q: "",
      userId: p.get("userId") || "",
    }));
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setRecords([]);
    if (!validRange(filters.from, filters.to)) {
      setError("Choose a valid date range.");
      setLoading(false);
      return;
    }
    fetch(
      `/api/admin/attendance?${new URLSearchParams({ ...filters, page: String(page) })}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not load attendance.");
        return d;
      })
      .then((d) => {
        setRecords(d.records);
        setTotal(d.total);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters, page, reload, ready]);
  useEffect(() => {
    if (!lightbox) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [lightbox]);
  function update(next: Partial<typeof filters>) {
    setFilters((f) => ({ ...f, ...next }));
    setPage(1);
  }
  async function remove(id: string) {
    try {
      const r = await fetch(`/api/admin/attendance/${id}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const d = await r.json();
        setError(d.error || "Could not delete shift.");
        return false;
      }
      setPage(1);
      setReload((n) => n + 1);
      return true;
    } catch {
      setError("Could not delete shift. Please try again.");
      return false;
    }
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Attendance</h1>
        <p className="text-sm text-foreground/60 mt-2">
          Completed shifts count automatically. Review records and correct mistakes here.
        </p>
      </div>
      <ManualAttendance onSaved={() => setReload(n => n+1)} />
      <section className="admin-panel p-4 space-y-4">
        <ReportControls
          from={filters.from}
          to={filters.to}
          onChange={(from, to) => update({ from, to })}
        />
        <div className="flex flex-wrap gap-3">
          <label className="flex-1 min-w-48">
            <span className="sr-only">Search employees</span>
            <input
              className="input"
              placeholder="Search employee name or ID…"
              value={filters.q}
              onChange={(e) => update({ q: e.target.value })}
            />
          </label>
          <label>
            <span className="sr-only">Attendance status</span>
            <select
              className="input"
              value={filters.status}
              onChange={(e) => update({ status: e.target.value })}
            >
              <option value="">All shifts</option>
              <option value="COMPLETE">Completed · counted automatically</option>
              <option value="REJECTED">Rejected</option>
              <option value="INCOMPLETE">Missing clock-outs · past days</option>
              <option value="OPEN">Clocked in · today</option>
            </select>
          </label>
          {filters.userId && (
            <button
              className="admin-button"
              onClick={() => update({ userId: "" })}
            >
              Show all employees
            </button>
          )}
        </div>
      </section>
      {error && (
        <p role="alert" className="text-danger">
          {error}{" "}
          <button className="underline" onClick={() => setReload((n) => n + 1)}>
            Try again
          </button>
        </p>
      )}
      <div className="admin-panel overflow-hidden">
        <div className="admin-table-scroll">
          <table className="w-full text-sm min-w-[920px]">
            <thead>
              <tr>
                {[
                  "Employee",
                  "Date",
                  "Clock-in",
                  "Clock-out",
                  "Clocked time",
                  "Review",
                  "Photos",
                  "",
                ].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const inAt = r.clockInAt ? new Date(r.clockInAt) : null,
                  outAt = r.clockOutAt ? new Date(r.clockOutAt) : null;
                return (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-4 py-4">
                      <div className="font-medium whitespace-nowrap">
                        {r.user.name}
                      </div>
                      <div className="text-xs text-foreground/55">
                        {r.user.employeeCode}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {formatWorkDate(r.workDate)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {formatIstTime(inAt)}
                      <FaceMatchBadge match={r.clockInFaceMatch} />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {formatIstTime(outAt)}
                      <FaceMatchBadge match={r.clockOutFaceMatch} />
                    </td>
                    <td className="px-4 py-4 tabular-nums">
                      <p className="font-medium">{durationLabel(clockedMs(r))} clocked</p>
                      {r.clockOutAt && !offDay(r.workDate) && r.approvalStatus !== "REJECTED" && <>
                        <p className="text-xs">Regular: {durationLabel(salaryCredit(r)*3600000)}</p>
                        <p className="text-xs">Bonus: {durationLabel(overtimeMs(r))}</p>
                      </>}
                      {r.approvalStatus === "REJECTED" && <p className="text-xs text-danger">Regular and bonus time excluded</p>}
                      {r.policyVersion === 2 && !r.unpaidBreakMinutes && <p className="text-xs text-foreground/55">1-hour break included</p>}
                      {!!r.unpaidBreakMinutes && <p className="text-xs text-foreground/55">{r.unpaidBreakMinutes}m unpaid break</p>}
                      {r.lateClockOutStatus === "PENDING" && <a className="text-xs text-accent underline" href="/admin/team?view=requests">Time after 10:45 pm awaiting approval</a>}
                      {r.lateClockOutStatus === "REJECTED" && <p className="text-xs text-danger">Time after 10:45 pm excluded</p>}
                      {r.extraTimeReason && <p className="text-xs max-w-48 whitespace-pre-wrap">{r.extraTimeReason}</p>}
                    </td>
                    <td className="px-4 py-4">
                      <AttendanceReview
                        id={r.id}
                        status={r.approvalStatus}
                        complete={!!r.clockInAt && !!r.clockOutAt}
                        onSaved={() => {
                          setPage(1);
                          setReload((n) => n + 1);
                        }}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        {r.clockInPhoto && (
                          <Thumb
                            url={`/api/photos/${r.clockInPhoto}`}
                            title="Clock-in photo"
                            onOpen={setLightbox}
                          />
                        )}
                        {r.clockOutPhoto && (
                          <Thumb
                            url={`/api/photos/${r.clockOutPhoto}`}
                            title="Clock-out photo"
                            onOpen={setLightbox}
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <DeleteRecordButton onDelete={() => remove(r.id)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {loading ? (
            <p role="status" className="p-8 text-center text-foreground/60">
              Loading shifts…
            </p>
          ) : (
            !records.length &&
            !error && (
              <p className="p-8 text-center text-foreground/60">
                No shifts match this view.
              </p>
            )
          )}
        </div>
        <div className="p-4 border-t border-border flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-foreground/60">
            {loading
              ? "Loading…"
              : `${total} shifts · Page ${page} of ${Math.max(1, Math.ceil(total / 50))}`}
          </span>
          <div className="flex gap-2">
            <button
              className="admin-button"
              disabled={loading || page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <button
              className="admin-button"
              disabled={loading || page * 50 >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
      <p className="text-xs text-foreground/60">
        Completed shifts count automatically toward hours and salary, unless explicitly excluded. Time after 10:45 pm requires admin approval.
        Attendance decisions and deletions are recorded in Audit history.
      </p>
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/75 flex flex-col items-center justify-center p-6 z-50"
          onClick={() => setLightbox(null)}
        >
          <button
            autoFocus
            className="admin-button mb-3"
            onClick={() => setLightbox(null)}
          >
            Close photo
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Attendance selfie"
            className="max-h-[80vh] max-w-full rounded-xl"
          />
        </div>
      )}
    </div>
  );
}
function DeleteRecordButton({
  onDelete,
}: {
  onDelete: () => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);

  if (deleting) {
    return <span className="text-xs text-foreground/40">Deleting…</span>;
  }

  if (confirming) {
    return (
      <div className="flex items-center justify-end gap-2">
        {error && <span className="text-xs text-danger">Failed</span>}
        <button
          type="button"
          onClick={async () => {
            setDeleting(true);
            setError(false);
            const ok = await onDelete();
            if (!ok) {
              setError(true);
              setDeleting(false);
            }
            // On success the row disappears with the parent's state update,
            // so there's no need to reset local state here.
          }}
          className="text-xs bg-danger text-white rounded px-2 py-1 hover:brightness-110"
        >
          Confirm delete
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-xs text-foreground/50 hover:text-foreground/80"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="text-xs text-danger/80 underline underline-offset-2 hover:text-danger"
    >
      Delete
    </button>
  );
}

function FaceMatchBadge({ match }: { match: boolean | null }) {
  if (match === null) return null;
  return match ? (
    <div className="text-xs text-success/80">✓ face matched</div>
  ) : (
    <div className="text-xs text-danger font-medium">
      ⚠ face didn&apos;t match — review photo
    </div>
  );
}

function Thumb({
  url,
  title,
  onOpen,
}: {
  url: string;
  title: string;
  onOpen: (url: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`View ${title.toLowerCase()}`}
      onClick={() => onOpen(url)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={title}
        className="w-10 h-10 rounded-lg object-cover border border-border hover:opacity-80"
      />
    </button>
  );
}
