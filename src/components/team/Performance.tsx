"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, useAction, useTeamData } from "./useTeamData";
import { ErrorNotice } from "./TeamCommon";
import { todayWorkDate, formatIstDateTime } from "@/lib/time";
type Arrival = {
  id: string;
  userId: string;
  arrivedAt: string;
  proposedAt: string | null;
  reason: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
};
type Meeting = {
  id: string;
  userId: string;
  kind: string;
  triggerDate: string;
  status: string;
  note: string | null;
  reviewedBy: string | null;
};
type Referral = {
  id: string;
  userId: string;
  billDate: string;
  billNumber: string;
  partyReference: string;
  reason: string;
  status: string;
  note: string | null;
};
type Data = {
  employees: {
    id: string;
    name: string;
    employeeCode: string;
    attendancePolicyFrom: string | null;
    points: number;
    eligibleShifts: number;
    pointsPerShift: number;
  }[];
  entries: {
    id: string;
    userId: string;
    date: string;
    kind: string;
    points: number;
  }[];
  incidents: {
    id: string;
    userId: string;
    date: string;
    lateMs: number;
    earlyMs: number;
    status: string;
    latePenaltyActive: boolean;
    earlyPenaltyActive: boolean;
  }[];
  meetings: Meeting[];
  arrivals: Arrival[];
  referrals: Referral[];
  audit: {
    id: string;
    action: string;
    actorName: string;
    createdAt: string;
    userId: string;
  }[];
};
const when = (s: string) => formatIstDateTime(new Date(s));
export default function Performance({ admin }: { admin: boolean }) {
  const [month, setMonth] = useState(todayWorkDate().slice(0, 7));
  const { data, error, loading, reload } = useTeamData<Data>(
    `/api/team/performance?month=${month}`,
    30000,
  );
  const params = useSearchParams();
  const [employeeId, setEmployeeId] = useState(params.get("employeeId") || "");
  const visible = (id: string) => !employeeId || id === employeeId;
  const action = useAction(reload);
  const name = (id: string) =>
    data?.employees.find((e) => e.id === id)?.name ?? "Employee";
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Attendance & monthly points</h2>
        <p className="text-sm text-foreground/60 mt-1">
          Pay follows actual clocked time. Time beyond the required shift becomes
          bonus hours automatically. Attendance points update automatically on completion; customer reviews add points immediately and referrals still need approval.
        </p>
      </div>
      <label className="block text-sm max-w-xs">
        Month
        <input
          className="input mt-1"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </label>
      {admin && (
        <label className="block text-sm max-w-xs">
          Employee
          <select
            className="input mt-1"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">Whole team</option>
            {data?.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <nav className="flex flex-wrap gap-2 text-sm">
        <a className="admin-button" href="#manager-clearance">
          Manager clearance (
          {data?.meetings.filter(
            (m) => m.status === "PENDING" && visible(m.userId),
          ).length ?? 0}
          )
        </a>
        <a className="admin-button" href="#referrals">
          Referral reviews (
          {data?.referrals.filter(
            (r) => r.status === "PENDING" && visible(r.userId),
          ).length ?? 0}
          )
        </a>
      </nav>
      <ErrorNotice error={error || action.error} />
      {loading && <p>Loading performance…</p>}
      <div className="grid sm:grid-cols-2 gap-3">
        {data?.employees
          .filter((e) => visible(e.id))
          .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
          .map((e) => (
            <article className="admin-panel p-4" key={e.id}>
              <h3 className="font-semibold">
                {e.name}{" "}
                <span className="admin-badge">
                  {e.points > 0 ? "+" : ""}
                  {e.points} pts
                </span>
              </h3>
              <p className="text-sm mt-2">
                {e.eligibleShifts} completed scheduled shifts ·{" "}
                {e.eligibleShifts ? e.pointsPerShift : "—"} points / shift
              </p>
              {!e.attendancePolicyFrom && (
                <p className="text-xs text-foreground/60">
                  No recurring schedule. Schedule-based awards require a dated
                  shift.
                </p>
              )}
            </article>
          ))}
      </div>
      <details className="admin-panel p-4">
        <summary className="font-medium cursor-pointer">
          How pay and points work
        </summary>
        <div className="text-sm space-y-2 mt-3">
          <p>
            Pay follows actual clocked time, including the paid break, up to 9 hours.
            Complete 9 hours from actual clock-in to avoid early departure.
            Friday part-time shifts require 7 clock hours and pay 6 hours after the break.
            Eligible time beyond the required duration becomes bonus hours.
          </p>
          <p>
            Three consecutive working days more than 15 minutes late, or three
            early departures, require a manager meeting before the next
            clock-in. Mondays and approved leave are skipped. Late and early
            patterns are separate.
          </p>
          <p>
            After the relevant meeting, further late arrivals / early departures receive
            −1.5 points once per day for the rest of that month. Pay follows recorded time; missed minutes are never deducted twice. An
            unresolved meeting carries into the next month. Meeting-day arrival
            must be approved.
          </p>
          <p>
            +0.5 for an on-time completed shift; +1 for actual work
            exceeding 10½ hours; +3 for an approved customer referral. Eligible overtime counts automatically after clock-out. Every 8 bonus hours earns another
            9-hour day’s pay.
          </p>
          <p>
            Regular staff retain paid Mondays; part-time staff have only their assigned working days. Historical attendance keeps
            its previous payroll rules. Approved exceptions do not count as
            incidents.
          </p>
        </div>
      </details>
      <section className="space-y-3">
        <h3 id="manager-clearance" className="text-lg font-semibold">
          Manager clearance
        </h3>
        <p className="text-sm text-foreground/60">
          Use clock-in to record a verified arrival before the meeting. After
          clearance, retry clock-in; the approved arrival time is used.
        </p>
        {data?.meetings.length === 0 && (
          <p className="text-sm">No manager meetings in this view.</p>
        )}
        {data?.meetings
          .filter((e) => visible(e.userId))
          .map((m) => (
            <MeetingCard
              key={m.id}
              meeting={m}
              arrival={data.arrivals.find((a) => a.userId === m.userId)}
              name={name(m.userId)}
              admin={admin}
              reload={reload}
            />
          ))}
        {!admin &&
          data?.arrivals
            .filter((a) => !a.approvedAt)
            .map((a) => (
              <form
                key={a.id}
                className="admin-panel p-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action.run(() =>
                    api("/api/team/performance", "POST", {
                      action: "PROPOSE_ARRIVAL",
                      proposedAt: `${f.get("time")}:00+05:30`,
                      reason: f.get("reason"),
                    }),
                  );
                }}
              >
                <p>
                  Recorded arrival: <strong>{when(a.arrivedAt)}</strong>
                </p>
                <p className="text-sm">
                  If you arrived earlier, propose that time for the manager to
                  verify. This does not change your attendance automatically.
                </p>
                <label className="block text-sm">
                  Actual arrival (IST)
                  <input
                    className="input"
                    name="time"
                    type="datetime-local"
                    required
                  />
                </label>
                <label className="block text-sm">
                  Explanation
                  <textarea
                    className="input"
                    name="reason"
                    maxLength={1000}
                    required
                  />
                </label>
                <button className="admin-button" disabled={action.busy}>
                  Send arrival for approval
                </button>
              </form>
            ))}
      </section>
      <section className="space-y-3">
        <h3 id="referrals" className="text-lg font-semibold">
          Customer referrals
        </h3>
        <p className="text-sm text-foreground/60">
          One verified completed bill earns +3 for one employee. Use a
          consistent party reference: split bills and repeat visits from the
          same party do not earn more points. No customer phone or address is
          needed.
        </p>
        {!admin && (
          <details className="admin-panel p-4">
            <summary className="cursor-pointer font-medium">
              Claim a customer referral
            </summary>
            <form
              className="space-y-3 mt-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const form = e.currentTarget;
                void action.run(async () => {
                  await api("/api/team/performance", "POST", {
                    action: "REFERRAL",
                    billDate: f.get("date"),
                    billNumber: f.get("bill"),
                    partyReference: f.get("party"),
                    reason: f.get("reason"),
                  });
                  form.reset();
                });
              }}
            >
              <label className="block text-sm">
                Bill date
                <input
                  className="input"
                  type="date"
                  name="date"
                  defaultValue={todayWorkDate()}
                  max={todayWorkDate()}
                  required
                />
              </label>
              <label className="block text-sm">
                Bill number
                <input className="input" name="bill" maxLength={80} required />
              </label>
              <label className="block text-sm">
                Party reference (manager can confirm)
                <input
                  className="input"
                  name="party"
                  maxLength={100}
                  required
                />
              </label>
              <label className="block text-sm">
                How did you bring this party in?
                <textarea
                  className="input"
                  name="reason"
                  maxLength={1000}
                  required
                />
              </label>
              <button className="admin-button" disabled={action.busy}>
                Submit for verification
              </button>
            </form>
          </details>
        )}
        {data?.referrals
          .filter((e) => visible(e.userId))
          .map((r) => (
            <ReferralCard
              key={r.id}
              r={r}
              name={name(r.userId)}
              admin={admin}
              reload={reload}
            />
          ))}
      </section>
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Attendance incidents</h3>
        {data?.incidents.length === 0 && (
          <p className="text-sm">No incidents this month.</p>
        )}
        {data?.incidents
          .filter((e) => visible(e.userId))
          .map((i) => (
            <div key={i.id} className="admin-panel p-4 text-sm">
              <strong>
                {name(i.userId)} · {i.date}
              </strong>
              <p>
                {i.lateMs > 0 &&
                  `${(i.lateMs / 60000).toFixed(1)} minutes late${i.latePenaltyActive ? " · deduction applies" : i.lateMs <= 15 * 60000 ? " · within grace" : ""}. `}
                {i.earlyMs > 0 &&
                  `${(i.earlyMs / 60000).toFixed(1)} minutes early${i.earlyPenaltyActive ? " · deduction applies" : ""}.`}{" "}
                Attendance: {i.status.toLowerCase()}.
              </p>
            </div>
          ))}
      </section>
      <section className="space-y-2">
        <h3 className="text-lg font-semibold">Points history</h3>
        {data?.entries.length === 0 && (
          <p className="text-sm">
            No awards or deductions this month.
          </p>
        )}
        {data?.entries
          .filter((e) => visible(e.userId))
          .map((e) => (
            <div
              className="admin-panel p-3 flex justify-between gap-3 text-sm"
              key={e.id}
            >
              <span>
                {e.date} · {name(e.userId)}
                <br />
                {e.kind}
              </span>
              <strong>
                {e.points > 0 ? "+" : ""}
                {e.points}
              </strong>
            </div>
          ))}
      </section>
      <details className="admin-panel p-4">
        <summary className="cursor-pointer font-medium">
          Recent decision history
        </summary>
        <div className="space-y-2 mt-3 text-sm">
          {data?.audit
            .filter((e) => visible(e.userId))
            .map((a) => (
              <p key={a.id}>
                {when(a.createdAt)} · {name(a.userId)} ·{" "}
                {a.action.replaceAll("_", " ")} · {a.actorName}
              </p>
            ))}
        </div>
      </details>
    </div>
  );
}
function MeetingCard({
  meeting: m,
  arrival: a,
  name,
  admin,
  reload,
}: {
  meeting: Meeting;
  arrival?: Arrival;
  name: string;
  admin: boolean;
  reload: () => void;
}) {
  const action = useAction(reload);
  return (
    <article className="admin-panel p-4 space-y-2">
      <h4 className="font-semibold">
        {name} · {m.kind === "LATE" ? "Late arrivals" : "Early departures"}{" "}
        <span className="admin-badge">{m.status}</span>
      </h4>
      <p className="text-sm">Third incident: {m.triggerDate}</p>
      {a && (
        <p className="text-sm">
          Verified arrival: {when(a.arrivedAt)}
          {a.proposedAt && (
            <>
              {" "}
              · Claimed arrival: {when(a.proposedAt)} ({a.reason})
            </>
          )}
          {a.approvedAt && (
            <>
              {" "}
              · Approved arrival: {when(a.approvedAt)} by {a.approvedBy}
            </>
          )}
        </p>
      )}
      {m.note && (
        <p className="text-sm">
          {m.reviewedBy}: {m.note}
        </p>
      )}
      <ErrorNotice error={action.error} />
      {admin && m.status === "PENDING" && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void action.run(() =>
              api("/api/team/performance", "PATCH", {
                action: "CLEAR_MEETING",
                id: m.id,
                note: f.get("note"),
                useProposed: f.get("proposed") === "on",
              }),
            );
          }}
        >
          {a?.proposedAt && (
            <label className="flex gap-2 text-sm">
              <input type="checkbox" name="proposed" />I verified the employee’s
              claimed arrival; use it instead of the recorded attempt.
            </label>
          )}
          <label className="block text-sm">
            Meeting outcome
            <textarea
              className="input"
              name="note"
              maxLength={1000}
              required
              placeholder="Record what was discussed and agreed"
            />
          </label>
          <button disabled={action.busy || !a} className="admin-button">
            Confirm meeting & approve arrival
          </button>
          {!a && (
            <p className="text-sm">
              Waiting for the employee’s verified arrival attempt.
            </p>
          )}
        </form>
      )}
    </article>
  );
}
function ReferralCard({
  r,
  name,
  admin,
  reload,
}: {
  r: Referral;
  name: string;
  admin: boolean;
  reload: () => void;
}) {
  const [note, setNote] = useState(""),
    [party, setParty] = useState(r.partyReference),
    [verified, setVerified] = useState(false);
  const action = useAction(reload);
  const review = (status: string) =>
    void action.run(() =>
      api("/api/team/performance", "PATCH", {
        action: "REVIEW_REFERRAL",
        id: r.id,
        status,
        note,
        partyReference: party,
        verified,
      }),
    );
  return (
    <article className="admin-panel p-4 space-y-2">
      <h4 className="font-semibold">
        {name} · Bill {r.billNumber}{" "}
        <span className="admin-badge">{r.status}</span>
      </h4>
      <p className="text-sm">
        {r.billDate} · Party: {r.partyReference}
      </p>
      <p className="text-sm whitespace-pre-wrap">{r.reason}</p>
      {r.note && <p className="text-sm">Review: {r.note}</p>}
      <ErrorNotice error={action.error} />
      {admin && ["PENDING", "APPROVED"].includes(r.status) && (
        <div className="space-y-3">
          {r.status === "PENDING" && (
            <>
              <label className="block text-sm">
                Verified party reference
                <input
                  className="input"
                  value={party}
                  onChange={(e) => setParty(e.target.value)}
                  maxLength={100}
                />
              </label>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={verified}
                  onChange={(e) => setVerified(e.target.checked)}
                />
                I verified this paid, non-cancelled bill, the employee’s
                referral, and that this party has no previous award (including
                split bills or repeat visits).
              </label>
            </>
          )}
          <label className="block text-sm">
            Review note
            <textarea
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {(r.status === "PENDING"
              ? ["APPROVED", "REJECTED"]
              : ["REVOKED"]
            ).map((s) => (
              <button
                className="admin-button"
                key={s}
                disabled={
                  action.busy || !note.trim() || (s === "APPROVED" && !verified)
                }
                onClick={() => review(s)}
              >
                {s === "APPROVED"
                  ? "Approve +3 points"
                  : s === "REJECTED"
                    ? "Reject"
                    : "Revoke award (refund / invalid claim)"}
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
