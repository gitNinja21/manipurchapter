// All "work day" bookkeeping is anchored to Asia/Kolkata (IST), regardless of
// where the server itself runs (Railway containers run in UTC).
const TIME_ZONE = "Asia/Kolkata";

/** Returns YYYY-MM-DD for the given instant, in IST. */
export function workDateFor(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date); // en-CA formats as YYYY-MM-DD
}

export function todayWorkDate(): string {
  return workDateFor(new Date());
}

export function formatIstTime(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatIstDateTime(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatWorkDate(workDate: string): string {
  // workDate is YYYY-MM-DD; parse as a plain calendar date (no TZ shift).
  const [y, m, d] = workDate.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    weekday: "short",
  });
}

/** Hours worked (decimal) between clock-in and clock-out, or null if either is missing. */
export function hoursBetween(clockInAt: Date | null, clockOutAt: Date | null): number | null {
  if (!clockInAt || !clockOutAt) return null;
  const ms = clockOutAt.getTime() - clockInAt.getTime();
  if (ms <= 0) return 0;
  return Math.round((ms / 1000 / 60 / 60) * 100) / 100;
}
