"use client";
import { recurringDescription, recurringRule, type PolicySchedule } from "@/lib/workPolicy";
import { useState } from "react";
import { api, useAction, useTeamData } from "./useTeamData";
import { ErrorNotice } from "./TeamCommon";
import { todayWorkDate, formatWorkDate, formatIstDateTime } from "@/lib/time";
import { weekStart } from "@/lib/reporting";
function plus(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
type ScheduleData = {
  recurring: ({id: string; name: string; employeeCode: string; attendancePolicyFrom: string} & PolicySchedule)[];
  shifts: {
    id: string;
    userId: string;
    workDate: string;
    startsAt: string;
    endsAt: string;
    note: string;
    user: { name: string };
  }[];
  leave: {
    id: string;
    userId: string;
    fromDate: string;
    toDate: string;
    user: { name: string };
  }[];
  employees: { id: string; name: string }[];
};
export default function Schedule({ admin }: { admin: boolean }) {
  const [from, setFrom] = useState(weekStart(todayWorkDate())),
    [userId, setUserId] = useState(""),
    [date, setDate] = useState(todayWorkDate()),
    [start, setStart] = useState("09:00"),
    [end, setEnd] = useState("18:00"),
    [overnight, setOvernight] = useState(false),
    [note, setNote] = useState("");
  const { data, error, loading, reload } = useTeamData<ScheduleData>(
    `/api/team/schedule?from=${from}&to=${plus(from, 6)}`,
    30000,
  );
  const action = useAction(reload);
  const recurringForDay = (day: string) => (data?.recurring ?? []).filter(person =>
    day >= person.attendancePolicyFrom && new Date(`${day}T12:00:00Z`).getUTCDay() !== 1 && !!recurringRule(person, day) &&
    !data?.shifts.some(shift => shift.userId === person.id && shift.workDate === day) &&
    !data?.leave.some(leave => leave.userId === person.id && leave.fromDate <= day && leave.toDate >= day)
  );
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">
          {admin ? "Team schedule" : "My schedule"}
        </h2>
        <p className="text-sm text-foreground/60 mt-1">
          All times in IST. Approved dated shifts set attendance rules for that day. Attendance needs separate approval for payroll.
        </p>
      </div>
      {!!data?.recurring?.length && <section className="admin-panel p-5 space-y-3">
        <h3 className="font-semibold">Daily attendance rules</h3>
        <p className="text-sm">Complete 9 clock hours including the paid break; Friday part-time shifts require 7 hours with a one-hour unpaid break. The required finish moves with actual clock-in. Extra time requires a reason and approval.</p>
        {data.recurring.map(person => <div key={person.id} className="text-sm border-t border-border pt-2">
          <strong>{person.name}</strong> · from {formatWorkDate(person.attendancePolicyFrom)}
          <p>{recurringDescription(person)}</p>
          <p className="text-foreground/60">Actual clock-out determines hours. {person.attendanceAllowEarly ? "Early clock-in is allowed." : "Clock-in opens at the start time."}</p>
        </div>)}
        <p className="text-xs text-foreground/60">Monday remains a paid off-day for regular staff. Part-time staff work only their listed days, without automatic Monday pay. Approved temporary shifts change the arrival time; required duration stays the same.</p>
      </section>}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          className="admin-button"
          onClick={() => setFrom(plus(from, -7))}
        >
          ← Previous week
        </button>
        <button
          className="admin-button"
          onClick={() => setFrom(weekStart(todayWorkDate()))}
        >
          This week
        </button>
        <button className="admin-button" onClick={() => setFrom(plus(from, 7))}>
          Next week →
        </button>
        <span className="text-sm">
          {formatWorkDate(from)} – {formatWorkDate(plus(from, 6))}
        </span>
      </div>
      {admin && (
        <details className="admin-panel p-5">
          <summary className="cursor-pointer font-medium">
            Assign or update a shift
          </summary>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                await api("/api/team/schedule", "POST", {
                  userId,
                  workDate: date,
                  startsAt: `${date}T${start}:00+05:30`,
                  endsAt: `${overnight ? plus(date, 1) : date}T${end}:00+05:30`,
                  note,
                });
                setFrom(weekStart(date));
                setNote("");
              });
            }}
          >
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm">
                Employee
                <select
                  className="input mt-1"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  required
                >
                  <option value="">Choose employee</option>
                  {data?.employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Work date
                <input
                  type="date"
                  className="input mt-1"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </label>
              <label className="text-sm">
                Starts at
                <input
                  type="time"
                  className="input mt-1"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  required
                />
              </label>
              <label className="text-sm">
                Ends at
                <input
                  type="time"
                  className="input mt-1"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  required
                />
              </label>
            </div>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={overnight}
                onChange={(e) => setOvernight(e.target.checked)}
              />
              Ends the following day
            </label>
            <label className="block text-sm">
              Note
              <input
                className="input mt-1"
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <p className="text-xs text-foreground/60">
              Saving replaces this employee’s assignment for the selected work
              date and notifies them.
            </p>
            <button className="admin-button" disabled={action.busy}>
              Save shift
            </button>
          </form>
        </details>
      )}
      <ErrorNotice error={error || action.error} />
      {loading && <p>Loading schedule…</p>}
      <div className="grid md:grid-cols-2 gap-3">
        {Array.from({ length: 7 }, (_, i) => plus(from, i)).map((day) => (
          <section className="admin-panel p-4 space-y-3" key={day}>
            <h3 className="font-semibold text-sm">
              {formatWorkDate(day)}
              {day === todayWorkDate() ? " · Today" : ""}
            </h3>
            {data?.shifts
              .filter((s) => s.workDate === day)
              .map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg bg-surface-muted p-3 text-sm"
                >
                  <strong>{s.user.name}</strong>
                  <p className="mt-1">
                    {formatIstDateTime(new Date(s.startsAt))} –{" "}
                    {formatIstDateTime(new Date(s.endsAt))}
                  </p>
                  {s.note && (
                    <p className="mt-1 text-foreground/60 break-words">
                      {s.note}
                    </p>
                  )}
                  {admin && (
                    <button
                      className="text-xs text-danger underline mt-2"
                      disabled={action.busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Cancel this shift and notify the employee?",
                          )
                        )
                          void action.run(() =>
                            api(`/api/team/schedule/${s.id}`, "DELETE"),
                          );
                      }}
                    >
                      Cancel shift
                    </button>
                  )}
                </div>
              ))}
            {recurringForDay(day).map(person => (
              <div key={`daily-${person.id}`} className="rounded-lg bg-surface-muted p-3 text-sm">
                <strong>{person.name}</strong>
                <p>{recurringDescription(person)}</p>
                <p className="text-xs text-foreground/60">Finish is measured from actual clock-in</p>
              </div>
            ))}
            {data?.leave
              .filter((l) => l.fromDate <= day && l.toDate >= day)
              .map((l) => (
                <p key={l.id} className="text-sm text-brand">
                  {l.user.name} · Approved leave
                </p>
              ))}
            {data &&
              !recurringForDay(day).length &&
              !data.shifts.some((s) => s.workDate === day) &&
              !data.leave.some((l) => l.fromDate <= day && l.toDate >= day) && (
                <p className="text-sm text-foreground/50">No shift assigned</p>
              )}
          </section>
        ))}
      </div>
    </div>
  );
}
