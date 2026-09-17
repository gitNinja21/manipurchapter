"use client";

import { useEffect, useState, useCallback } from "react";
import { formatWorkDate, formatIstTime, hoursBetween } from "@/lib/time";

type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

type Employee = { id: string; name: string; employeeCode: string };
type AttendanceRecord = {
  id: string;
  workDate: string;
  clockInAt: string | null;
  clockInPhoto: string | null;
  clockInFaceMatch: boolean | null;
  clockOutAt: string | null;
  clockOutPhoto: string | null;
  clockOutFaceMatch: boolean | null;
  approvalStatus: ApprovalStatus;
  user: { name: string; employeeCode: string };
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function AdminAttendancePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState(daysAgoISO(6));
  const [to, setTo] = useState(todayISO());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [pendingOnly, setPendingOnly] = useState(false);

  useEffect(() => {
    fetch("/api/admin/employees")
      .then((r) => r.json())
      .then((d) => setEmployees(d.employees ?? []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ from, to });
    if (userId) params.set("userId", userId);
    const res = await fetch(`/api/admin/attendance?${params.toString()}`);
    const data = await res.json();
    setRecords(data.records ?? []);
    setLoading(false);
  }, [from, to, userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string) {
    const res = await fetch(`/api/admin/attendance/${id}`, { method: "DELETE" });
    if (res.ok) {
      setRecords((prev) => prev.filter((r) => r.id !== id));
    }
    return res.ok;
  }

  async function handleSetApproval(id: string, approvalStatus: ApprovalStatus) {
    const res = await fetch(`/api/admin/attendance/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalStatus }),
    });
    if (res.ok) {
      setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, approvalStatus } : r)));
    }
    return res.ok;
  }

  const visibleRecords = pendingOnly
    ? records.filter((r) => r.clockOutAt && r.approvalStatus === "PENDING")
    : records;

  return (
    <div className="space-y-6">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
        Attendance Log
      </h1>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-foreground/55 mb-1">Employee</span>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="input !w-auto min-w-[10rem]"
          >
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.employeeCode})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-foreground/55 mb-1">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="input !w-auto"
          />
        </label>
        <label className="text-sm">
          <span className="block text-foreground/55 mb-1">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="input !w-auto"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground/70 pb-2">
          <input
            type="checkbox"
            checked={pendingOnly}
            onChange={(e) => setPendingOnly(e.target.checked)}
          />
          Needs approval only
        </label>
      </div>

      <p className="text-xs text-foreground/45">
        A day&apos;s hours only count toward salary on the Overview page once you approve it
        here. Days you haven&apos;t reviewed yet show as <span className="text-accent font-medium">Pending</span>.
      </p>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1040px]">
            <thead>
              <tr className="bg-surface-muted text-foreground/60 text-left">
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Employee</th>
                <th className="px-4 py-2.5 font-medium">In</th>
                <th className="px-4 py-2.5 font-medium">Out</th>
                <th className="px-4 py-2.5 font-medium text-right">Hours</th>
                <th className="px-4 py-2.5 font-medium">Approval</th>
                <th className="px-4 py-2.5 font-medium">Photos</th>
                <th className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-foreground/45">
                    Loading…
                  </td>
                </tr>
              ) : visibleRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-foreground/45">
                    {pendingOnly ? "Nothing waiting on approval." : "No records in this range."}
                  </td>
                </tr>
              ) : (
                visibleRecords.map((r) => {
                  const inAt = r.clockInAt ? new Date(r.clockInAt) : null;
                  const outAt = r.clockOutAt ? new Date(r.clockOutAt) : null;
                  const hours = hoursBetween(inAt, outAt);
                  return (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {formatWorkDate(r.workDate)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{r.user.name}</div>
                        <div className="text-xs text-foreground/45">{r.user.employeeCode}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        {formatIstTime(inAt)}
                        <FaceMatchBadge match={r.clockInFaceMatch} />
                      </td>
                      <td className="px-4 py-2.5">
                        {formatIstTime(outAt)}
                        <FaceMatchBadge match={r.clockOutFaceMatch} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {hours !== null ? hours.toFixed(2) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <ApprovalCell
                          record={r}
                          onSetApproval={(status) => handleSetApproval(r.id, status)}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-2">
                          {r.clockInPhoto && (
                            <Thumb
                              url={`/api/photos/${r.clockInPhoto}`}
                              onOpen={setLightbox}
                              title="Clock-in photo"
                            />
                          )}
                          {r.clockOutPhoto && (
                            <Thumb
                              url={`/api/photos/${r.clockOutPhoto}`}
                              onOpen={setLightbox}
                              title="Clock-out photo"
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <DeleteRecordButton onDelete={() => handleDelete(r.id)} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Attendance selfie"
            className="max-h-[85vh] max-w-full rounded-xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}

function DeleteRecordButton({ onDelete }: { onDelete: () => Promise<boolean> }) {
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

function ApprovalCell({
  record,
  onSetApproval,
}: {
  record: AttendanceRecord;
  onSetApproval: (status: ApprovalStatus) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  if (!record.clockOutAt) {
    return <span className="text-xs text-foreground/40">not clocked out yet</span>;
  }

  async function set(status: ApprovalStatus) {
    setBusy(true);
    setError(false);
    const ok = await onSetApproval(status);
    setBusy(false);
    if (!ok) setError(true);
  }

  if (busy) {
    return <span className="text-xs text-foreground/40">Saving…</span>;
  }

  return (
    <div className="space-y-1">
      {record.approvalStatus === "APPROVED" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-success font-medium">✓ Approved</span>
          <button
            type="button"
            onClick={() => set("PENDING")}
            className="text-xs text-foreground/40 underline underline-offset-2 hover:text-foreground/70"
          >
            Undo
          </button>
        </div>
      )}
      {record.approvalStatus === "REJECTED" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-danger font-medium">✗ Rejected</span>
          <button
            type="button"
            onClick={() => set("PENDING")}
            className="text-xs text-foreground/40 underline underline-offset-2 hover:text-foreground/70"
          >
            Undo
          </button>
        </div>
      )}
      {record.approvalStatus === "PENDING" && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => set("APPROVED")}
            className="text-xs bg-success text-white rounded px-2 py-1 hover:brightness-110"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => set("REJECTED")}
            className="text-xs text-danger underline underline-offset-2 hover:text-danger/80"
          >
            Reject
          </button>
        </div>
      )}
      {error && <p className="text-xs text-danger">Couldn&apos;t save — try again.</p>}
    </div>
  );
}

function FaceMatchBadge({ match }: { match: boolean | null }) {
  if (match === null) return null;
  return match ? (
    <div className="text-xs text-success/80">✓ face matched</div>
  ) : (
    <div className="text-xs text-danger font-medium">⚠ face didn&apos;t match — review photo</div>
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
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={title}
      title={title}
      onClick={() => onOpen(url)}
      className="w-12 h-12 rounded-lg object-cover border border-border cursor-pointer hover:opacity-80"
    />
  );
}
