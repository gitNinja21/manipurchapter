"use client";

import { useEffect, useState } from "react";
import { formatWorkDate, formatIstTime, hoursBetween } from "@/lib/time";

type Record = {
  id: string;
  workDate: string;
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
                  <th className="px-4 py-2.5 font-medium text-right">Hours</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const inAt = r.clockInAt ? new Date(r.clockInAt) : null;
                  const outAt = r.clockOutAt ? new Date(r.clockOutAt) : null;
                  const hours = hoursBetween(inAt, outAt);
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
                        {hours !== null ? hours.toFixed(2) : "—"}
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
            A day&apos;s hours count toward pay once your manager approves it — that usually
            happens within a day or two of your shift.
          </p>
        </>
      )}
    </div>
  );
}

function ApprovalStatusBadge({ status }: { status: "PENDING" | "APPROVED" | "REJECTED" | null }) {
  if (!status) return null;
  if (status === "APPROVED") return <span className="text-xs text-success">✓ Approved</span>;
  if (status === "REJECTED") return <span className="text-xs text-danger">Not approved</span>;
  return <span className="text-xs text-accent">Pending review</span>;
}
