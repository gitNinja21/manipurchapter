"use client";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
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
  const router = useRouter(), pathname = usePathname();
  const section = ["points", "history", "clearance", "referrals"].includes(params.get("section") ?? "") ? params.get("section")! : "points";
  function openSection(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("section", id);
    router.replace(`${pathname}?${next}`, {scroll: false});
  }
  const [employeeId, setEmployeeId] = useState(params.get("employeeId") || "");
  const visible = (id: string) => !employeeId || id === employeeId;
  const action = useAction(reload);
  const name = (id: string) =>
    data?.employees.find((e) => e.id === id)?.name ?? "Employee";
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Performance</h2>
        <p className="text-sm text-foreground/60 mt-1">
          Your points and manager follow-ups, in one place.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
      <label className="block text-sm w-full sm:w-48">
        Month
        <input
          className="input mt-1"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </label>
      {admin && (
        <label className="block text-sm w-full sm:w-64">
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
      </div>
      <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="Performance sections">
        {[["points", "Points"], ["history", "Points history"], ["clearance", `Manager clearance (${data?.meetings.filter(m => m.status === "PENDING" && visible(m.userId)).length ?? 0})`], ["referrals", "Referrals"]].map(([id, label]) => (
          <button key={id} className={`admin-button shrink-0 ${section === id ? "!bg-brand !text-white" : ""}`} aria-current={section === id ? "page" : undefined} onClick={() => openSection(id)}>{label}</button>
        ))}
      </nav>
      <ErrorNotice error={error || action.error} />
      {loading && <p>Loading performance…</p>}
      {section === "points" && <>
      {!loading && data && <PointsOverview employees={data.employees.filter(e => visible(e.id))} entries={data.entries.filter(e => visible(e.userId))} />}
      <details className="admin-panel p-4">
        <summary className="font-medium cursor-pointer">How attendance points work</summary>
        <div className="text-sm space-y-2 mt-3">
          <p>+0.5 for an on-time completed shift; +1 for eligible work exceeding 10½ hours; +3 for an approved customer referral. Customer reviews add up to 1 point each.</p>
          <p>Three consecutive working days more than 15 minutes late, or three early departures, require a manager meeting. After the meeting, further incidents receive −1.5 points once per day for the rest of the month.</p>
          <p>Clock out by 10:30–10:45 pm. Time after 10:45 pm requires admin approval before it contributes to awards. Always record your actual leaving time.</p>
        </div>
      </details>
      </>}
      {section === "clearance" && <section className="space-y-3">
        <h3 id="manager-clearance" className="text-lg font-semibold">
          Manager clearance
        </h3>
        <p className="text-sm text-foreground/60">
          Confirm completed meetings at any time. Review recorded arrival times separately below.
        </p>
        {data?.meetings.filter(m => visible(m.userId)).length === 0 && (
          <p className="text-sm">No manager meetings in this view.</p>
        )}
        {data?.meetings
          .filter((e) => visible(e.userId))
          .sort((a, b) => Number(b.status === "PENDING") - Number(a.status === "PENDING"))
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
        {admin && data?.arrivals.filter(a => visible(a.userId) && !a.approvedAt).map(a => (
          <form key={a.id} className="admin-panel p-4 space-y-3" onSubmit={e => {
            e.preventDefault(); const f = new FormData(e.currentTarget);
            void action.run(() => api("/api/team/performance", "PATCH", {action:"APPROVE_ARRIVAL",id:a.id,note:f.get("note"),useProposed:f.get("proposed") === "on"}));
          }}>
            <h4 className="font-semibold">{name(a.userId)} · Arrival approval</h4>
            <p className="text-sm">Recorded arrival: {when(a.arrivedAt)}</p>
            {a.proposedAt && <label className="flex gap-2 text-sm"><input type="checkbox" name="proposed" />Use verified claimed arrival: {when(a.proposedAt)} ({a.reason})</label>}
            <label className="block text-sm">Arrival review note<textarea className="input" name="note" required maxLength={1000} /></label>
            <button className="admin-button" disabled={action.busy}>Approve arrival time</button>
            <p className="text-xs text-foreground/60">The employee can retry clock-in once arrival is approved and all meetings are cleared.</p>
          </form>
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
      </section>}
      {section === "referrals" && <section className="space-y-3">
        <h3 id="referrals" className="text-lg font-semibold">
          Customer referrals
        </h3>
        <p className="text-sm text-foreground/60">
          +3 points per verified party. Split bills and repeat visits do not earn extra points.
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
        {data?.referrals.filter(r => visible(r.userId)).length === 0 && <p className="text-sm text-foreground/60">No referrals this month.</p>}
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
      </section>}
      {section === "history" && <>
      <details className="admin-panel p-4 space-y-3">
        <summary className="font-semibold cursor-pointer">Attendance incidents</summary>
        {data?.incidents.filter(e => visible(e.userId)).length === 0 && (
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
      </details>
      <section className="space-y-2">
        <h3 className="text-lg font-semibold">Points history</h3>
        {data?.entries.filter(e => visible(e.userId)).length === 0 && (
          <p className="text-sm">
            No awards or deductions this month.
          </p>
        )}
        {data?.entries
          .filter((e) => visible(e.userId))
          .sort((a, b) => b.date.localeCompare(a.date))
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
      </>}
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
              }),
            );
          }}
        >
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
          <button disabled={action.busy} className="admin-button">
            Confirm meeting completed
          </button>
          <p className="text-xs text-foreground/60">This clears the meeting only. Arrival is reviewed separately.</p>
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

function PointsOverview({employees, entries}: {employees: Data["employees"]; entries: Data["entries"]}) {
  const earned = entries.reduce((sum, e) => sum + Math.max(0, e.points), 0);
  const deducted = entries.reduce((sum, e) => sum + Math.max(0, -e.points), 0);
  const format = (n: number) => Number(n.toFixed(2)).toLocaleString();
  const groups = new Map<string, number>();
  for (const entry of entries) {
    const label = entry.kind.startsWith("Customer review") ? "Customer reviews" : entry.kind;
    groups.set(label, (groups.get(label) ?? 0) + entry.points);
  }
  const rows = employees.length > 1
    ? employees.map(e => ({id:e.id,label:e.name,value:e.points})).sort((a,b) => b.value-a.value)
    : [...groups].map(([label,value]) => ({id:label,label,value}));
  const maximum = Math.max(1, ...rows.map(r => Math.abs(r.value)));
  return <section className="space-y-4" aria-label="Points overview">
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      {[["Net points", earned-deducted], ["Earned", earned], ["Deducted", deducted]].map(([label,value]) => <div key={label} className="admin-panel p-3 sm:p-5">
        <p className="text-xs sm:text-sm text-foreground/60">{label}</p>
        <p className="mt-2 text-2xl sm:text-3xl font-semibold tabular-nums">{format(Number(value))}</p>
      </div>)}
    </div>
    <div className="admin-panel p-4 sm:p-6 space-y-5">
      <div><h3 className="font-semibold">{employees.length > 1 ? "Team points" : "Points breakdown"}</h3><p className="text-xs text-foreground/60 mt-1">Green: earned or positive total · Red: deducted or negative total</p></div>
      {!entries.length && <p className="text-sm text-foreground/60">No points recorded for this selection yet.</p>}
      {rows.map(row => <div key={row.id} className="space-y-2">
        <div className="flex justify-between gap-4 text-sm"><span>{row.label}</span><strong className="tabular-nums whitespace-nowrap">{row.value > 0 ? "+" : ""}{format(row.value)} pts</strong></div>
        <div aria-hidden="true" className="h-3 rounded-full bg-surface-muted overflow-hidden"><div className={`h-full rounded-full ${row.value < 0 ? "bg-danger" : "bg-success"}`} style={{width:`${Math.abs(row.value)/maximum*100}%`}} /></div>
      </div>)}
    </div>
    {employees.length === 1 && <p className="text-xs text-foreground/60">{employees[0].name} · {employees[0].eligibleShifts} completed shifts · {format(employees[0].pointsPerShift)} points / shift</p>}
  </section>;
}
