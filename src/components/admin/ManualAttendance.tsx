"use client";
import { useEffect, useState } from "react";
import { api, useAction, useTeamData } from "@/components/team/useTeamData";
import { todayWorkDate } from "@/lib/time";
type RecordTimes = {
  id: string;
  updatedAt: string;
  policyVersion: number;
  unpaidBreakMinutes: number;
  clockInAt: string | null;
  clockOutAt: string | null;
};
const localTime = (value: string | null) =>
  value
    ? new Date(+new Date(value) + 330 * 60000).toISOString().slice(0, 16)
    : "";
export default function ManualAttendance({ onSaved, dateRevision = 0 }: { onSaved: () => void; dateRevision?: number }) {
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
  const [unpaidHours,setUnpaidHours]=useState("0");
  const [day,setDay]=useState<{mode:string;revision:number}|null>(null);
  const [message, setMessage] = useState("");
  const action = useAction();
  const [expanded,setExpanded]=useState(false);
  useEffect(()=>{const d=new URLSearchParams(window.location.search).get("correctionDate");if(d && /^\d{4}-\d{2}-\d{2}$/.test(d)){setDate(d);setExpanded(true);}},[]);
  useEffect(()=>{setLoaded(false);},[dateRevision]);
  const paidOff=day?.mode==="PAID_OFF" || (!day && new Date(`${date}T12:00:00Z`).getUTCDay()===1);
  return (
    <details className="admin-panel p-5" open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}>
      <summary className="font-semibold cursor-pointer">
        Correct Employee Attendance
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
            const d = await api<{ record: RecordTimes | null;day:{mode:string;revision:number}|null }>(
              `/api/admin/attendance/manual?${new URLSearchParams({ userId, workDate: date })}`,
            );
            setRecord(d.record);
            setStart(localTime(d.record?.clockInAt ?? null));
            setEnd(localTime(d.record?.clockOutAt ?? null));
            setReason("");
            setDay(d.day);
            setUnpaidHours(String(d.record?.policyVersion===4 ? (d.record.unpaidBreakMinutes ?? 0)/60 : 0));
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
                expectedDayRevision:day?.revision ?? 0,
                unpaidBreakMinutes:Math.round(Number(unpaidHours)*60),
                reason,
                expectedRecordId: record?.id ?? null,
                expectedUpdatedAt: record?.updatedAt ?? null,
              });
              setLoaded(false);
              setMessage(
                "Attendance saved. Completed hours minus unpaid breaks count at the hourly rate. An open shift can be clocked out normally by the employee.",
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
          <p className="text-sm">Paid break: 1 hour included within the clocked time. No extra hour is added.</p>
          <label className="block text-sm">Unpaid break (hours)<input className="input mt-1" type="number" min="0" max="24" step="any" required value={unpaidHours} onChange={e=>setUnpaidHours(e.target.value)} /></label>
          {paidOff && <p role="alert" className="text-red-700">This is a paid off day. For Monday attendance, open that Monday first, then reload.</p>}
          <p className="text-sm text-foreground/60">
            Saving updates payroll using actual clocked hours minus your unpaid break. There is no shift cap, late deduction or overtime conversion.
          </p>
          <button className="admin-button" disabled={action.busy || paidOff}>
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
