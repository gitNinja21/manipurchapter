"use client";
import { useState } from "react";
import { api, useAction, useTeamData } from "@/components/team/useTeamData";
import { todayWorkDate } from "@/lib/time";
type RecordTimes = {
  id: string;
  updatedAt: string;
  policyVersion: number;
  clockInAt: string | null;
  clockOutAt: string | null;
};
const localTime = (value: string | null) =>
  value
    ? new Date(+new Date(value) + 330 * 60000).toISOString().slice(0, 16)
    : "";
export default function ManualAttendance({ onSaved }: { onSaved: () => void }) {
  const { data } = useTeamData<{
    employees: {
      id: string;
      name: string;
      employeeCode: string;
      approved: boolean;
    }[];
  }>("/api/admin/employees");
  const [userId, setUserId] = useState(""),
    [date, setDate] = useState(todayWorkDate());
  const [loaded, setLoaded] = useState(false),
    [record, setRecord] = useState<RecordTimes | null>(null);
  const [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [reason, setReason] = useState("");
  const [applyCurrentPolicy, setApplyCurrentPolicy] = useState(false);
  const [meeting, setMeeting] = useState(false),
    [message, setMessage] = useState("");
  const action = useAction();
  return (
    <details className="admin-panel p-5">
      <summary className="font-semibold cursor-pointer">
        Add / correct attendance — system issue
      </summary>
      <p className="text-sm text-foreground/60 mt-3">
        Record the employee’s actual arrival or leaving time when login,
        location or camera problems prevent clocking in/out. Times are in IST.
        Every change records your name, the original times and your reason.
      </p>
      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        <label className="text-sm">
          Employee
          <select
            disabled={action.busy}
            className="input mt-1"
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setLoaded(false);
              setMessage("");
            }}
          >
            <option value="">Choose employee</option>
            {data?.employees
              .filter((e) => e.approved)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.employeeCode}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm">
          Work date (arrival date)
          <input
            className="input mt-1"
            type="date"
            disabled={action.busy}
            value={date}
            max={todayWorkDate()}
            onChange={(e) => {
              setDate(e.target.value);
              setLoaded(false);
              setMessage("");
            }}
          />
        </label>
      </div>
      <button
        className="admin-button mt-3"
        disabled={!userId || !date || action.busy}
        onClick={() =>
          void action.run(async () => {
            setLoaded(false);
            setMessage("");
            const d = await api<{ record: RecordTimes | null }>(
              `/api/admin/attendance/manual?${new URLSearchParams({ userId, workDate: date })}`,
            );
            setRecord(d.record);
            setStart(localTime(d.record?.clockInAt ?? null));
            setEnd(localTime(d.record?.clockOutAt ?? null));
            setReason("");
            setMeeting(false);
            setApplyCurrentPolicy(false);
            setLoaded(true);
          })
        }
      >
        Load attendance
      </button>
      {loaded && (
        <form
          className="space-y-3 mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              await api("/api/admin/attendance/manual", "POST", {
                userId,
                workDate: date,
                clockInAt: record?.clockInAt && start === localTime(record.clockInAt) ? record.clockInAt : `${start}:00+05:30`,
                clockOutAt: record?.clockOutAt && end === localTime(record.clockOutAt) ? record.clockOutAt : end ? `${end}:00+05:30` : null,
                applyCurrentPolicy,
                reason,
                expectedRecordId: record?.id ?? null,
                expectedUpdatedAt: record?.updatedAt ?? null,
                managerMeetingCompleted: meeting,
              });
              setLoaded(false);
              setMessage(
                "Attendance saved. Review extra time if requested, then approve the completed shift for payroll. An open shift can be clocked out normally by the employee.",
              );
              onSaved();
            });
          }}
        >
          <p className="text-sm font-medium">
            {record
              ? "Editing an existing attendance record"
              : "No attendance record found — this will create one"}
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm">
              Actual clock-in (IST)
              <input
                className="input mt-1"
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </label>
            <label className="text-sm">
              Actual clock-out (IST)
              <input
                className="input mt-1"
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required={date < todayWorkDate()}
              />
            </label>
          </div>
          <p className="text-xs text-foreground/60">
            Leave clock-out empty only if the employee is still working today.
            Existing selfies stay as evidence of their original attempts; manual
            times do not create selfie verification.
          </p>
          <label className="block text-sm">
            Reason / system issue
            <textarea
              className="input mt-1"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              required
              placeholder="For example: location permission failed; I verified arrival at 11:30 am."
            />
          </label>
          {record?.clockInAt && record.clockOutAt && <label className="flex gap-2 text-sm">
            <input type="checkbox" checked={applyCurrentPolicy} disabled={action.busy} onChange={e => setApplyCurrentPolicy(e.target.checked)} />
            <span>Recalculate this record using the current pay policy.
              <span className="block text-xs text-foreground/60">Normally 9 clock hours including the paid break; Tokili Friday is 7 clock hours with 6 paid. Recalculates pay, bonus hours and incidents. Leave times unchanged if they are correct. Requires approval again.</span>
            </span>
          </label>}
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={meeting}
              onChange={(e) => setMeeting(e.target.checked)}
            />
            If a manager meeting is pending, I confirm it has taken place. The
            reason above includes the meeting outcome.
          </label>
          <p className="text-sm text-foreground/60">
            Saving resets attendance to pending review. Breaks, scheduled hours
            and extra-time review still apply.
          </p>
          <button className="admin-button" disabled={action.busy}>
            Save actual attendance times
          </button>
        </form>
      )}
      {action.error && (
        <p role="alert" className="text-danger mt-3">
          {action.error}
        </p>
      )}
      {message && (
        <p role="status" className="text-success mt-3">
          {message}
        </p>
      )}
    </details>
  );
}
