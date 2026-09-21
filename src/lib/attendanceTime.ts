export function clockedMs(record: {clockInAt?: Date | string | null; clockOutAt?: Date | string | null}) {
  return record.clockInAt && record.clockOutAt ? Math.max(0,+new Date(record.clockOutAt)-+new Date(record.clockInAt)) : null;
}
export function durationLabel(ms: number | null) {
  if (ms === null) return "—";
  const minutes = Math.max(0,Math.round(ms/60000));
  return `${Math.floor(minutes/60)}h ${String(minutes%60).padStart(2,"0")}m`;
}
export function lateClockOutRule(workDate: string, out: Date | null, approved = false) {
  const cutoff = new Date(`${workDate}T22:45:00+05:30`);
  return {lateClockOutCutoff: out && out > cutoff ? cutoff : null,
    lateClockOutStatus: out && out > cutoff ? approved ? "APPROVED" : "PENDING" : "NOT_REQUIRED"};
}
