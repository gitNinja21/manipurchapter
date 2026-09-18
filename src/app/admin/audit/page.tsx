"use client";
import { useEffect, useState } from "react";
import { formatIstDateTime, formatWorkDate, todayWorkDate } from "@/lib/time";
import { validRange } from "@/lib/reporting";
import ReportControls from "@/components/admin/ReportControls";
type Entry = {
  id: string;
  employeeName: string;
  employeeCode: string;
  actorName: string;
  workDate: string;
  action: string;
  beforeJson: string;
  afterJson: string | null;
  createdAt: string;
};
const actions: Record<string, string> = {
  APPROVED: "Approved",
  CORRECTED: "Attendance corrected",
  EXTRA_TIME_APPROVED: "Extra time approved",
  EXTRA_TIME_REJECTED: "Extra time rejected",
  REJECTED: "Rejected",
  PENDING: "Reset to pending",
  DELETED: "Shift deleted",
  EMPLOYEE_DELETED: "Employee deleted",
};
export default function AuditPage() {
  const today = todayWorkDate();
  const [filters, setFilters] = useState({
    from: `${today.slice(0, 7)}-01`,
    to: today,
    q: "",
    action: "",
  });
  const [entries, setEntries] = useState<Entry[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setEntries([]);
    if (!validRange(filters.from, filters.to)) {
      setError("Choose a valid date range.");
      setLoading(false);
      return;
    }
    fetch(
      `/api/admin/audit?${new URLSearchParams({ ...filters, page: String(page) })}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not load audit history.");
        return d;
      })
      .then((d) => {
        setEntries(d.entries);
        setTotal(d.total);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters, page, retry]);
  function update(next: Partial<typeof filters>) {
    setFilters((f) => ({ ...f, ...next }));
    setPage(1);
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Audit history</h1>
        <p className="text-sm text-foreground/60 mt-2">
          Who changed attendance, when, and what changed. History begins when
          this feature is installed.
        </p>
      </div>
      <section className="admin-panel p-4 space-y-4">
        <p className="text-xs text-foreground/60">
          Filter by the shift’s work date. Changes are listed newest first.
        </p>
        <ReportControls
          from={filters.from}
          to={filters.to}
          onChange={(from, to) => update({ from, to })}
        />
        <div className="flex flex-wrap gap-3">
          <label className="flex-1 min-w-48">
            <span className="sr-only">Search audit history</span>
            <input
              className="input"
              placeholder="Search employee, ID, or administrator…"
              value={filters.q}
              onChange={(e) => update({ q: e.target.value })}
            />
          </label>
          <label>
            <span className="sr-only">Action</span>
            <select
              className="input"
              value={filters.action}
              onChange={(e) => update({ action: e.target.value })}
            >
              <option value="">All actions</option>
              {Object.entries(actions).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      {error && (
        <p role="alert" className="text-danger">
          {error}{" "}
          <button className="underline" onClick={() => setRetry((n) => n + 1)}>
            Try again
          </button>
        </p>
      )}
      <div className="admin-panel overflow-hidden">
        <div className="admin-table-scroll">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr>
                {[
                  "Employee",
                  "Shift date",
                  "Change",
                  "Administrator",
                  "Changed at (IST)",
                ].map((h) => (
                  <th key={h} className="px-5 py-3 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-border align-top">
                  <td className="px-5 py-4 font-medium">
                    {e.employeeName}
                    <span className="block text-xs font-normal text-foreground/55">
                      {e.employeeCode}
                    </span>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    {formatWorkDate(e.workDate)}
                  </td>
                  <td className="px-5 py-4">
                    <span className="admin-badge">
                      {actions[e.action] || e.action}
                    </span>
                    <details className="mt-2">
                      <summary className="text-xs cursor-pointer text-brand">
                        Before and after
                      </summary>
                      <div className="text-xs mt-2 space-y-2">
                        <Snapshot label="Before" json={e.beforeJson} />
                        <Snapshot label="After" json={e.afterJson} />
                      </div>
                    </details>
                  </td>
                  <td className="px-5 py-4">{e.actorName}</td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    {formatIstDateTime(new Date(e.createdAt))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading ? (
            <p role="status" className="p-8 text-center text-foreground/60">
              Loading history…
            </p>
          ) : (
            !entries.length &&
            !error && (
              <p className="p-8 text-center text-foreground/60">
                No attendance changes recorded for this view.
              </p>
            )
          )}
        </div>
        <div className="p-4 border-t border-border flex justify-between items-center gap-3">
          <span className="text-xs text-foreground/60">
            {total} changes · Page {page} of{" "}
            {Math.max(1, Math.ceil(total / 50))}
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
    </div>
  );
}
function Snapshot({ label, json }: { label: string; json: string | null }) {
  const s = json
    ? (JSON.parse(json) as {
        approvalStatus: string;
        clockInAt: string | null;
        clockOutAt: string | null;
        unpaidBreakMinutes?: number;
        extraTimeStatus?: string;
        extraTimeReason?: string;
      })
    : null;
  return (
    <div>
      <p className="font-medium">
        {label}:{" "}
        {s ? actions[s.approvalStatus] || s.approvalStatus : "Record deleted"}
      </p>
      {s && (
        <p className="text-foreground/60">
          In: {s.clockInAt ? formatIstDateTime(new Date(s.clockInAt)) : "—"}
          <br />
          Out: {s.clockOutAt ? formatIstDateTime(new Date(s.clockOutAt)) : "—"}
          {s.unpaidBreakMinutes !== undefined && <><br />Unpaid break: {s.unpaidBreakMinutes} minutes</>}
          {s.extraTimeStatus && <><br />Extra time: {s.extraTimeStatus}</>}
          {s.extraTimeReason && <><br />Reason: {s.extraTimeReason}</>}
        </p>
      )}
    </div>
  );
}
