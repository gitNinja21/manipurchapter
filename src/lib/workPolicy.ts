import { workDateFor } from "./time";

export function policyApplies(user: { attendancePolicyFrom?: string | null }, date: string) {
  return !!user.attendancePolicyFrom && date >= user.attendancePolicyFrom;
}
export type PolicySchedule = {
  weeklyScheduleJson?: string | null;
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
    opening: minuteLabel(Math.max(0, start - 15)),
    finish: minuteLabel(schedule.attendanceEndMinute ?? 1350),
    fixed: start === latest,
    allowEarly: true,
  };
}
export function policyTimes(date: string, schedule: PolicySchedule = {}) {
  const midnight = +new Date(`${date}T00:00:00+05:30`);
  return {
    opensAt: new Date(midnight + Math.max(0, (schedule.attendanceStartMinute ?? 570) - 15) * 60000),
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
  policyVersion?: number;
  clockInAt: Date | string | null;
  clockOutAt: Date | string | null;
  unpaidBreakMinutes?: number;
  extraTimeCutoff?: Date | string | null;
  extraTimeStatus?: string;
};
/** Exact net time; only historically rejected extra time stays capped at the saved cutoff. */
export function netWorkMs(record: WorkRecord): number | null {
  if (!record.clockInAt || !record.clockOutAt) return null;
  const start = +new Date(record.clockInAt);
  let end = +new Date(record.clockOutAt);
  if (record.extraTimeCutoff && record.extraTimeStatus === "REJECTED") {
    end = Math.min(end, +new Date(record.extraTimeCutoff));
  }
  return Math.max(0, end - start - (record.policyVersion === 2 ? 60 : record.unpaidBreakMinutes ?? 0) * 60000);
}
export function netWorkHours(record: WorkRecord): number | null {
  const ms = netWorkMs(record);
  return ms === null ? null : ms / 3600000;
}

export type DayRule = { start: number; latest: number; duration: number; unpaidBreak: number };
/** Explicit weekly schedules have no implicit shifts on omitted weekdays. */
export function recurringRule(user: PolicySchedule, date: string): DayRule | null {
  if (user.weeklyScheduleJson) {
    const rules = JSON.parse(user.weeklyScheduleJson) as Record<string, DayRule>;
    return rules[String(new Date(`${date}T12:00:00+05:30`).getUTCDay())] ?? null;
  }
  return { start: user.attendanceStartMinute ?? 570, latest: user.attendanceLatestMinute ?? 630, duration: 540, unpaidBreak: 0 };
}
export function recurringDescription(user: PolicySchedule) {
  if (!user.weeklyScheduleJson) return `Arrival: ${scheduleLabels(user).arrival} IST · 9 hours from actual clock-in · 1-hour paid break`;
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return Object.entries(JSON.parse(user.weeklyScheduleJson) as Record<string, DayRule>).map(([day, r]) =>
    `${names[Number(day)]}: ${minuteLabel(r.start)}${r.latest !== r.start ? `–${minuteLabel(r.latest)}` : ""} · ${r.duration / 60} hours including a 1-hour ${r.unpaidBreak ? "unpaid" : "paid"} break`).join("; ");
}
/** Payroll time includes the paid break under version 2; actual work does not. */
export function paidTimeMs(record: WorkRecord): number | null {
  if (!record.clockInAt || !record.clockOutAt) return null;
  let end = +new Date(record.clockOutAt);
  if (record.extraTimeCutoff && record.extraTimeStatus === "REJECTED") end = Math.min(end, +new Date(record.extraTimeCutoff));
  return Math.max(0, end - +new Date(record.clockInAt) - (record.unpaidBreakMinutes ?? 0) * 60000);
}
