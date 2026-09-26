import { masterPay, unpaidFraction } from "./masterPolicy";
import { todayWorkDate, workDateFor } from "./time";

export function policyApplies(user: { attendancePolicyFrom?: string | null; masterScheduleFrom?: string | null }, date: string) {
  return (!!user.masterScheduleFrom && date >= user.masterScheduleFrom) || (!!user.attendancePolicyFrom && date >= user.attendancePolicyFrom);
}
export type PolicySchedule = {
  masterScheduleFrom?: string | null;
  masterScheduleJson?: string | null;
  unpaidBreakFrom?: string | null;
  scheduledUnpaidBreakMinutes?: number | null;
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
  scheduledStartAt?: Date | string | null;
  scheduledEndAt?: Date | string | null;
  shiftDurationMinutes?: number;
  policyVersion?: number;
  clockInAt: Date | string | null;
  clockOutAt: Date | string | null;
  unpaidBreakMinutes?: number;
  extraTimeCutoff?: Date | string | null;
  extraTimeStatus?: string;
  lateClockOutCutoff?: Date | string | null;
  lateClockOutStatus?: string;
};
/** Exact net time; only historically rejected extra time stays capped at the saved cutoff. */
export function netWorkMs(record: WorkRecord): number | null {
  if (!record.clockInAt || !record.clockOutAt) return null;
  const start = +new Date(record.clockInAt);
  let end = +new Date(record.clockOutAt);
  if (record.lateClockOutCutoff && ["PENDING", "REJECTED"].includes(record.lateClockOutStatus ?? ""))
    end = Math.min(end, +new Date(record.lateClockOutCutoff));
  if (record.extraTimeCutoff && record.extraTimeStatus === "REJECTED") {
    end = Math.min(end, +new Date(record.extraTimeCutoff));
  }
  if (record.policyVersion === 3) return Math.max(0,(end-start)*(1-unpaidFraction(record)-60/(record.shiftDurationMinutes || 540)));
  return Math.max(0, end - start - (record.policyVersion === 2 ? Math.max(60, record.unpaidBreakMinutes ?? 0) : record.unpaidBreakMinutes ?? 0) * 60000);
}
export function netWorkHours(record: WorkRecord): number | null {
  const ms = netWorkMs(record);
  return ms === null ? null : ms / 3600000;
}

export type DayRule = { start: number; latest: number; duration: number; unpaidBreak: number; unpaidBreakPercent?: number };
export function scheduledBreak(user: PolicySchedule, date: string, fallback = 0) {
  return user.unpaidBreakFrom && date >= user.unpaidBreakFrom
    ? user.scheduledUnpaidBreakMinutes ?? fallback : fallback;
}
/** Explicit weekly schedules have no implicit shifts on omitted weekdays. */
export function recurringRule(user: PolicySchedule, date: string): DayRule | null {
  if (user.masterScheduleFrom && date >= user.masterScheduleFrom && user.masterScheduleJson) return (JSON.parse(user.masterScheduleJson) as Record<string,DayRule>)[String(new Date(`${date}T12:00:00+05:30`).getUTCDay())] ?? null;
  if (user.weeklyScheduleJson) {
    const rules = JSON.parse(user.weeklyScheduleJson) as Record<string, DayRule>;
    const rule = rules[String(new Date(`${date}T12:00:00+05:30`).getUTCDay())];
    return rule ? {...rule, unpaidBreak: scheduledBreak(user, date, rule.unpaidBreak)} : null;
  }
  return { start: user.attendanceStartMinute ?? 570, latest: user.attendanceLatestMinute ?? 630, duration: 540, unpaidBreak: scheduledBreak(user, date) };
}
export function recurringDescription(user: PolicySchedule, date = todayWorkDate()) {
  if (user.masterScheduleFrom && date >= user.masterScheduleFrom && user.masterScheduleJson) {
    const days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    return Object.entries(JSON.parse(user.masterScheduleJson) as Record<string,DayRule>).map(([d,r]) => `${days[Number(d)]}: ${minuteLabel(r.start)}–${minuteLabel(r.start+r.duration)} · ${((r.duration-r.unpaidBreak)/60)} paid hours · ${r.unpaidBreak ? `${(r.unpaidBreak/r.duration*100).toFixed(2)}% unpaid; ` : ""}1-hour paid break`).join("; ");
  }
  const breakLabel = (fallback = 0) => { const minutes = scheduledBreak(user, date, fallback); return minutes ? `${minutes / 60}-hour unpaid break` : "1-hour paid break"; };
  if (!user.weeklyScheduleJson) return `Arrival: ${scheduleLabels(user).arrival} IST · 9 hours from actual clock-in · ${breakLabel()}`;
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return Object.entries(JSON.parse(user.weeklyScheduleJson) as Record<string, DayRule>).map(([day, r]) =>
    `${names[Number(day)]}: ${minuteLabel(r.start)}${r.latest !== r.start ? `–${minuteLabel(r.latest)}` : ""} · ${r.duration / 60} hours including a ${breakLabel(r.unpaidBreak)}`).join("; ");
}
/** Payroll time includes the paid break under version 2; actual work does not. */
export function paidTimeMs(record: WorkRecord): number | null {
  if (record.policyVersion === 3) { if (!record.clockInAt || !record.clockOutAt) return null; const pay=masterPay(record); return pay.regularMs+pay.bonusMs; }
  if (!record.clockInAt || !record.clockOutAt) return null;
  let end = +new Date(record.clockOutAt);
  if (record.lateClockOutCutoff && ["PENDING", "REJECTED"].includes(record.lateClockOutStatus ?? ""))
    end = Math.min(end, +new Date(record.lateClockOutCutoff));
  if (record.extraTimeCutoff && record.extraTimeStatus === "REJECTED") end = Math.min(end, +new Date(record.extraTimeCutoff));
  return Math.max(0, end - +new Date(record.clockInAt) - (record.unpaidBreakMinutes ?? 0) * 60000);
}
