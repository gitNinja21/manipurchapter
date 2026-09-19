import { workDateFor } from "./time";

export function policyApplies(user: { attendancePolicyFrom?: string | null }, date: string) {
  return !!user.attendancePolicyFrom && date >= user.attendancePolicyFrom;
}
export type PolicySchedule = {
  attendanceStartMinute?: number;
  attendanceLatestMinute?: number;
  attendanceEndMinute?: number;
  attendanceAllowEarly?: boolean;
};
export function minuteLabel(minute: number) {
  const hour = Math.floor(minute / 60);
  return `${hour % 12 || 12}:${String(minute % 60).padStart(2, "0")} ${hour >= 12 ? "pm" : "am"}`;
}
export function scheduleLabels(schedule: PolicySchedule = {}) {
  const start = schedule.attendanceStartMinute ?? 570;
  const latest = schedule.attendanceLatestMinute ?? 630;
  return {
    arrival: start === latest ? minuteLabel(start) : `${minuteLabel(start)}–${minuteLabel(latest)}`,
    latest: minuteLabel(latest),
    opening: minuteLabel(start),
    finish: minuteLabel(schedule.attendanceEndMinute ?? 1350),
    fixed: start === latest,
    allowEarly: schedule.attendanceAllowEarly ?? false,
  };
}
export function policyTimes(date: string, schedule: PolicySchedule = {}) {
  const midnight = +new Date(`${date}T00:00:00+05:30`);
  return {
    opensAt: new Date(midnight + (schedule.attendanceAllowEarly ? 0 : schedule.attendanceStartMinute ?? 570) * 60000),
    // Include the entire displayed deadline minute.
    lateAt: new Date(midnight + ((schedule.attendanceLatestMinute ?? 630) + 1) * 60000),
    closesAt: new Date(midnight + (schedule.attendanceEndMinute ?? 1350) * 60000),
  };
}
export function arrivalState(now: Date, date = workDateFor(now), schedule: PolicySchedule = {}) {
  const times = policyTimes(date, schedule);
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
