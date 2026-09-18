"use client";
import { useState } from "react";
import type { EmployeeStats } from "@/lib/stats";
import { formatWorkDate } from "@/lib/time";
type Status = "PENDING" | "APPROVED" | "REJECTED";
type Preview = {
  from: string;
  to: string;
  before: EmployeeStats;
  after: EmployeeStats;
  expectedUpdatedAt: string;
};
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    n,
  );
export default function AttendanceReview({
  id,
  status,
  complete,
  onSaved,
}: {
  id: string;
  status: Status;
  complete: boolean;
  onSaved: () => void;
}) {
  const [target, setTarget] = useState<Status | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function review(next: Status) {
    setTarget(next);
    setPreview(null);
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `/api/admin/attendance/${id}/preview?status=${next}`,
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not load salary preview.");
      setPreview(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load preview.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!preview || !target) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/attendance/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalStatus: target,
          expectedUpdatedAt: preview.expectedUpdatedAt,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not save decision.");
      setTarget(null);
      setPreview(null);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save decision.");
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  if (!complete) return <span className="admin-badge">Not clocked out</span>;
  return (
    <div className="space-y-2 min-w-40">
      <span
        className={`admin-badge ${status === "APPROVED" ? "!bg-success/10 !text-success" : status === "REJECTED" ? "!bg-danger/10 !text-danger" : ""}`}
      >
        {status === "PENDING"
          ? "Awaiting review"
          : status === "APPROVED"
            ? "Approved"
            : "Rejected"}
      </span>
      {!target && (
        <div>
          <button
            className="text-brand text-xs underline underline-offset-4"
            onClick={() =>
              review(status === "PENDING" ? "APPROVED" : "PENDING")
            }
          >
            {status === "PENDING"
              ? "Review salary & approve"
              : "Review & reset"}
          </button>
          {status === "PENDING" && (
            <button
              className="ml-3 text-xs text-danger underline underline-offset-4"
              onClick={() => review("REJECTED")}
            >
              Reject
            </button>
          )}
        </div>
      )}
      {target && (
        <div
          className="rounded-xl border border-border bg-background p-3 w-72 whitespace-normal text-xs space-y-3"
          aria-label="Salary impact preview"
        >
          <p className="font-semibold text-sm">
            {target === "APPROVED"
              ? "Approve"
              : target === "REJECTED"
                ? "Reject"
                : "Reset"}{" "}
            this shift?
          </p>
          {busy && (
            <p role="status">
              {preview ? "Saving…" : "Calculating salary impact…"}
            </p>
          )}
          {preview && (
            <>
              <p className="text-foreground/65">
                {formatWorkDate(preview.from)} – {formatWorkDate(preview.to)}
              </p>
              <dl className="space-y-2">
                {[
                  [
                    "Regular pay",
                    preview.before.regularPayRs,
                    preview.after.regularPayRs,
                  ],
                  [
                    "Paid Mondays",
                    preview.before.offDaysPayRs,
                    preview.after.offDaysPayRs,
                  ],
                  [
                    "Bonus pay",
                    preview.before.bonusPayRs,
                    preview.after.bonusPayRs,
                  ],
                  [
                    "Total salary",
                    preview.before.salaryRs,
                    preview.after.salaryRs,
                  ],
                ].map(([label, before, after]) => (
                  <div key={label} className="space-y-0.5">
                    <dt className="text-foreground/65">{label}</dt>
                    <dd>
                      {money(Number(before))} →{" "}
                      <strong>{money(Number(after))}</strong>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-foreground/60">
                Month estimate with this decision. Changes to earlier shifts may
                also affect later overtime bonuses.
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            {preview ? (
              <button
                disabled={busy}
                className="admin-button !bg-brand !text-white !text-xs"
                onClick={save}
              >
                Confirm {target.toLowerCase()}
              </button>
            ) : (
              !busy && (
                <button
                  className="admin-button !text-xs"
                  onClick={() => review(target)}
                >
                  Refresh preview
                </button>
              )
            )}
            <button
              disabled={busy}
              className="admin-button !text-xs"
              onClick={() => {
                setTarget(null);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
