import { workDateFor } from "./time";
export type AttendanceReminder = {
  kind: "ATTENDANCE_IN" | "ATTENDANCE_OUT";
  key: string;
  message: string;
  href: string;
};
type ReminderInput = {
  now: Date;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  onLeave: boolean;
  arrived: boolean;
  recordedToday: boolean;
  open: { id: string; clockInAt: Date; scheduledEndAt: Date | null } | null;
  repeatMinutes?: number;
};
/** Shared server clock and eligibility for foreground audio and background push. */
export function attendanceReminder(input: ReminderInput): AttendanceReminder | null {
  const { now, open, scheduledStart, scheduledEnd } = input;
  const date = workDateFor(now);
  const at = (time: string) => +new Date(`${date}T${time}:00+05:30`);
  const repeat = input.repeatMinutes ?? 5;
  const slot = (deadline: number) => repeat > 0 ? Math.floor((+now - deadline) / (repeat * 60000)) : 0;
  if (open) {
    const stale = +now - +open.clockInAt > 24 * 3600000;
    const shiftDate = stale ? date : workDateFor(open.clockInAt);
    const deadline = +new Date(`${shiftDate}T22:30:00+05:30`);
    if (+now < deadline) return null;
    return { kind: "ATTENDANCE_OUT", key: `${workDateFor(new Date(deadline))}:${open.id}:${slot(deadline)}`,
      message: stale ? "Your previous shift is still open. Submit a correction with your actual leaving time." : "Please finish and clock out by 10:45 pm. Always record your actual leaving time; later clock-outs require admin approval.",
      href: stale ? "/employee/team?view=requests" : "/employee" };
  }
  if (input.onLeave || input.arrived || input.recordedToday || !scheduledStart || !scheduledEnd) return null;
  const deadline = Math.max(at("10:30"), +scheduledStart);
  // No clock-in alarms after the scheduled shift has ended.
  if (+now < deadline || +now >= +scheduledEnd) return null;
  return { kind: "ATTENDANCE_IN", key: `${date}:${slot(deadline)}`,
    message: "Your shift has started and you have not clocked in. Clock in when you arrive.", href: "/employee" };
}
