import { netWorkMs } from "./workPolicy";
export const HOUR = 3600000;
export type PolicyRecord = Parameters<typeof netWorkMs>[0] & {
  policyVersion?: number;
  scheduledStartAt?: Date | string | null;
  scheduledEndAt?: Date | string | null;
  latePenaltyActive?: boolean;
  earlyPenaltyActive?: boolean;
  lateExcused?: boolean;
  earlyExcused?: boolean;
  approvalStatus?: string;
  workDate?: string;
};
export const offDay = (date: string) =>
  new Date(`${date}T12:00:00+05:30`).getUTCDay() === 1;
export function deviations(r: PolicyRecord) {
  const lateMs =
    r.scheduledStartAt && r.clockInAt && !r.lateExcused
      ? Math.max(0, +new Date(r.clockInAt) - +new Date(r.scheduledStartAt))
      : 0;
  const earlyMs =
    r.scheduledEndAt && r.clockOutAt && !r.earlyExcused
      ? Math.max(0, +new Date(r.scheduledEndAt) - +new Date(r.clockOutAt))
      : 0;
  return { lateMs, earlyMs };
}
/** Salary credit never becomes actual overtime. Each missing minute is deducted once. */
export function salaryCredit(r: PolicyRecord) {
  const actual = (netWorkMs(r) ?? 0) / HOUR;
  if (!r.clockInAt || !r.clockOutAt) return 0;
  if (!r.policyVersion || !r.scheduledStartAt || !r.scheduledEndAt)
    return Math.min(9, actual);
  const { lateMs, earlyMs } = deviations(r);
  const coveredEnd =
    r.extraTimeCutoff && r.extraTimeStatus !== "APPROVED"
      ? Math.min(+new Date(r.clockOutAt), +new Date(r.extraTimeCutoff))
      : +new Date(r.clockOutAt);
  const endUnapproved = coveredEnd < +new Date(r.scheduledEndAt) && !earlyMs;
  // Before counselling the 15-minute arrival grace does not reduce full-shift pay.
  const incomplete =
    (lateMs > 15 * 60000 && !r.latePenaltyActive) ||
    (earlyMs > 0 && !r.earlyPenaltyActive) ||
    endUnapproved;
  if (incomplete) return Math.min(9, actual); // already pro-rated; do not deduct again
  const deduction =
    (r.latePenaltyActive ? lateMs : 0) + (r.earlyPenaltyActive ? earlyMs : 0);
  return Math.max(0, 9 - deduction / HOUR);
}
export function attendancePoints(r: PolicyRecord) {
  const result: { kind: string; points: number }[] = [];
  if (
    !r.policyVersion ||
    r.approvalStatus !== "APPROVED" ||
    !r.clockInAt ||
    !r.clockOutAt ||
    (r.workDate && offDay(r.workDate))
  )
    return result;
  const { lateMs, earlyMs } = deviations(r);
  if (
    r.scheduledStartAt &&
    r.scheduledEndAt &&
    +new Date(r.clockInAt) <= +new Date(r.scheduledStartAt) &&
    +new Date(r.clockOutAt) >= +new Date(r.scheduledEndAt) &&
    salaryCredit(r) >= 9
  )
    result.push({ kind: "On-time full shift", points: 0.5 });
  if ((netWorkMs(r) ?? 0) > 10.5 * HOUR && r.extraTimeStatus === "APPROVED")
    result.push({ kind: "Approved extra shift", points: 1 });
  if (
    (r.latePenaltyActive && lateMs > 0) ||
    (r.earlyPenaltyActive && earlyMs > 0)
  )
    result.push({ kind: "Late / early after manager meeting", points: -1.5 });
  return result;
}
export function extraCutoff(
  start: Date,
  breakMinutes: number,
  end?: Date | null,
) {
  return new Date(
    Math.min(
      +start + 10.5 * HOUR + breakMinutes * 60000,
      end ? +end : Infinity,
    ),
  );
}
