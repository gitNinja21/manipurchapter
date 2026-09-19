"use client";
import { salaryCredit, offDay, type PolicyRecord } from "@/lib/performance";
import { netWorkHours } from "@/lib/workPolicy";

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
                  <th className="px-4 py-2.5 font-medium text-right">Net hours</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const inAt = r.clockInAt ? new Date(r.clockInAt) : null;
                  const outAt = r.clockOutAt ? new Date(r.clockOutAt) : null;
                  const hours = netWorkHours(r);
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
                        {r.clockOutAt && !offDay(r.workDate) && <p className="text-xs font-normal">{salaryCredit(r).toFixed(2)} salary hours {r.approvalStatus === "APPROVED" ? "credited" : "if approved"}</p>}
                        {!!r.unpaidBreakMinutes && <p className="text-xs font-normal">{r.unpaidBreakMinutes}m break deducted</p>}
                        {r.policyVersion === 2 && !r.unpaidBreakMinutes && <p className="text-xs font-normal">60m paid break · included in pay</p>}
                        {r.extraTimeStatus !== "NOT_REQUIRED" && r.extraTimeCutoff && <p className="text-xs font-normal">Extra time: {r.extraTimeStatus}</p>}
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
