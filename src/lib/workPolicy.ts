import { workDateFor } from "./time";

export function policyApplies(user: { attendancePolicyFrom?: string | null }, date: string) {
  return !!user.attendancePolicyFrom && date >= user.attendancePolicyFrom;
}
export function policyTimes(date: string) {
  return {
    opensAt: new Date(`${date}T09:30:00+05:30`),
    // The entire displayed 10:30 minute belongs to the arrival window.
    lateAt: new Date(`${date}T10:31:00+05:30`),
    closesAt: new Date(`${date}T22:30:00+05:30`),
  };
}
export function arrivalState(now: Date, date = workDateFor(now)) {
  const times = policyTimes(date);
  return now < times.opensAt ? "EARLY" : now >= times.lateAt ? "LATE" : "ON_TIME";
}
type WorkRecord = {
  clockInAt: Date | string | null;
  clockOutAt: Date | string | null;
  unpaidBreakMinutes?: number;
  extraTimeCutoff?: Date | string | null;
  extraTimeStatus?: string;
};
/** Exact net time; approval for the whole day remains a separate payroll gate. */
export function netWorkMs(record: WorkRecord): number | null {
  if (!record.clockInAt || !record.clockOutAt) return null;
  const start = +new Date(record.clockInAt);
  let end = +new Date(record.clockOutAt);
  if (record.extraTimeCutoff && record.extraTimeStatus !== "APPROVED") {
    end = Math.min(end, +new Date(record.extraTimeCutoff));
  }
  return Math.max(0, end - start - (record.unpaidBreakMinutes ?? 0) * 60000);
}
export function netWorkHours(record: WorkRecord): number | null {
  const ms = netWorkMs(record);
  return ms === null ? null : ms / 3600000;
}
