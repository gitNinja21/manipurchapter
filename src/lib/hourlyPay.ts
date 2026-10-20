/** Flexible dates pay exact elapsed time minus the admin-entered unpaid break.
 * The paid break is included in elapsed time, never added to it. */
export const HOURLY_POLICY = 4;
export function hourlyPaidMs(r: {clockInAt?: Date|string|null;clockOutAt?: Date|string|null;unpaidBreakMinutes?:number}) {
  if (!r.clockInAt || !r.clockOutAt) return 0;
  return Math.max(0,+new Date(r.clockOutAt)-+new Date(r.clockInAt)-(r.unpaidBreakMinutes ?? 0)*60000);
}
export function hourlySnapshot(unpaidBreakMinutes=0) {
  return {policyVersion:HOURLY_POLICY,paidBreakMinutes:60,unpaidBreakMinutes,
    scheduledStartAt:null,scheduledEndAt:null,shiftDurationMinutes:0,
    extraTimeCutoff:null,extraTimeStatus:"NOT_REQUIRED",lateClockOutCutoff:null,
    lateClockOutStatus:"NOT_REQUIRED",latePenaltyActive:false,earlyPenaltyActive:false,
    lateExcused:false,earlyExcused:false};
}
