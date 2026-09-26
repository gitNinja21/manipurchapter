/** Version 3 is effective by IST work date, never by deployment/approval time. */
export const MASTER_POLICY_FROM = "2026-09-26";
export const ARRIVAL_GRACE_MS = 15 * 60000;
export function usesMasterPolicy(date: string) { return date >= MASTER_POLICY_FROM; }
export type MasterRecord = {
  policyVersion?: number; workDate?: string; clockInAt: Date | string | null; clockOutAt: Date | string | null;
  scheduledStartAt?: Date | string | null; scheduledEndAt?: Date | string | null;
  shiftDurationMinutes?: number; unpaidBreakMinutes?: number; lateExcused?: boolean;
  lateClockOutCutoff?: Date | string | null; lateClockOutStatus?: string;
  extraTimeCutoff?: Date | string | null; extraTimeStatus?: string;
};
export function unpaidFraction(r: MasterRecord) {
  return Math.min(1,Math.max(0,(r.unpaidBreakMinutes ?? 0)/(r.shiftDurationMinutes || 540)));
}
export function masterLateMs(r: MasterRecord) {
  return r.clockInAt && r.scheduledStartAt && !r.lateExcused
    ? Math.max(0,+new Date(r.clockInAt)-+new Date(r.scheduledStartAt)-ARRIVAL_GRACE_MS) : 0;
}
/** Grace covers only arrival lateness inside the scheduled interval, never bonus time. */
export function masterPay(r: MasterRecord) {
  if (!r.clockInAt || !r.clockOutAt) return {regularMs:0,bonusMs:0,graceMs:0,unpaidMs:0};
  const arrival=+new Date(r.clockInAt), start=r.scheduledStartAt ? +new Date(r.scheduledStartAt) : arrival;
  const finish=r.scheduledEndAt ? +new Date(r.scheduledEndAt) : start+(r.shiftDurationMinutes ?? 540)*60000;
  let out=+new Date(r.clockOutAt);
  if (r.lateClockOutCutoff && ["PENDING","REJECTED"].includes(r.lateClockOutStatus ?? "")) out=Math.min(out,+new Date(r.lateClockOutCutoff));
  if (r.extraTimeCutoff && r.extraTimeStatus === "REJECTED") out=Math.min(out,+new Date(r.extraTimeCutoff));
  const overlap=Math.max(0,Math.min(out,finish)-Math.max(arrival,start));
  const graceMs=out>arrival && arrival<finish ? Math.min(ARRIVAL_GRACE_MS,Math.max(0,arrival-start)) : 0;
  const fraction=unpaidFraction(r);
  const regularGross=Math.min(Math.max(0,finish-start),overlap+graceMs);
  const bonusGross=Math.max(0,out-Math.max(arrival,finish));
  return {regularMs:regularGross*(1-fraction),bonusMs:bonusGross*(1-fraction),graceMs,
    unpaidMs:(overlap+bonusGross)*fraction};
}
export function monthlyLateness(records: (MasterRecord & {workDate:string;approvalStatus?:string})[],month:string) {
  const days=new Map<string,number>();
  for(const r of records) if(r.workDate.startsWith(month) && usesMasterPolicy(r.workDate) && r.approvalStatus!=="REJECTED") {
    const late=masterLateMs(r); if(late>0) days.set(r.workDate,Math.max(late,days.get(r.workDate) ?? 0));
  }
  const lateDays=days.size;
  return {lateDays,lateMinutes:[...days.values()].reduce((a,b)=>a+b,0)/60000,awardEligible:lateDays<5,lateWarning:lateDays>=3};
}
