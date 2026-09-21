"use client";
import { type PolicyRecord } from "@/lib/performance";
import { clockedMs, durationLabel } from "@/lib/attendanceTime";

import { useEffect, useState } from "react";
import { formatWorkDate, formatIstTime } from "@/lib/time";

type Record = PolicyRecord & {
  id: string;
  workDate: string;
  unpaidBreakMinutes: number;
  policyVersion: number;
  shiftDurationMinutes: number;
  extraTimeCutoff: string | null;
  extraTimeStatus: string;
  lateClockOutStatus: string;
  extraTimeReason: string | null;
  clockInAt: string | null;
  clockOutAt: string | null;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
};

export default function HistoryPage() {
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/attendance/me")
      .then((r) => r.json())
      .then((data) => setRecords(data.records ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">My Attendance</h1>

      {loading ? (
        <p className="text-sm text-foreground/50">Loading…</p>
      ) : records.length === 0 ? (
        <p className="text-sm text-foreground/50">No attendance records yet.</p>
      ) : (
        <>
          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-muted text-foreground/60 text-left">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">In</th>
                  <th className="px-4 py-2.5 font-medium">Out</th>
                  <th className="px-4 py-2.5 font-medium text-right">Clocked time</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const inAt = r.clockInAt ? new Date(r.clockInAt) : null;
                  const outAt = r.clockOutAt ? new Date(r.clockOutAt) : null;
                  const hours = clockedMs(r);
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-2.5">{formatWorkDate(r.workDate)}</td>
                      <td className="px-4 py-2.5">{formatIstTime(inAt)}</td>
                      <td className="px-4 py-2.5">
                        {outAt ? (
                          formatIstTime(outAt)
                        ) : inAt ? (
                          <span className="text-accent">still in</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium">
                        {durationLabel(hours)}
                        {r.lateClockOutStatus === "PENDING" && <p className="text-xs text-accent">After 10:45 pm: awaiting approval</p>}
                        {r.lateClockOutStatus === "REJECTED" && <p className="text-xs text-accent">After 10:45 pm: not approved</p>}
                        {r.extraTimeReason && <p className="text-xs whitespace-pre-wrap">Reason: {r.extraTimeReason}</p>}
                      </td>
                      <td className="px-4 py-2.5">
                        <ApprovalStatusBadge status={outAt ? r.approvalStatus : null} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-foreground/40">
            Clocked time includes your break. Clock-outs after 10:45 pm require admin approval.
          </p>
        </>
      )}
    </div>
  );
}

function ApprovalStatusBadge({ status }: { status: "PENDING" | "APPROVED" | "REJECTED" | null }) {
  if (!status) return null;
  if (status === "REJECTED") return <span className="text-xs text-danger">Record excluded</span>;
  return <span className="text-xs text-success">✓ Completed</span>;
}
