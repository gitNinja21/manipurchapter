import type {MasterRecord} from "./masterPolicy";
import {workDateFor} from "./time";
export const FLEXIBLE_NINE_POLICY=5;
export function flexibleNineSnapshot(date:string){
 return {policyVersion:5,shiftDurationMinutes:780,paidBreakMinutes:60,unpaidBreakMinutes:0,
 scheduledStartAt:new Date(`${date}T09:30:00+05:30`),scheduledEndAt:new Date(`${date}T22:30:00+05:30`),
 extraTimeCutoff:null,extraTimeStatus:"NOT_REQUIRED"};
}
export function flexibleNineSchedule(date:string){
 const snapshot=flexibleNineSnapshot(date);
 return {policyVersion:5,start:snapshot.scheduledStartAt,end:snapshot.scheduledEndAt,arrivalStart:snapshot.scheduledStartAt,
 opens:new Date(`${date}T00:00:00+05:30`),durationMinutes:780,paidBreakMinutes:60,breakMinutes:0};
}
/** No double counting: inside-window time is regular/unpaid; outside is bonus. */
export function flexibleNinePay(r:MasterRecord){
 if(!r.clockInAt||!r.clockOutAt)return {regularMs:0,bonusMs:0,unpaidMs:0};
 const arrival=+new Date(r.clockInAt),date=r.workDate??workDateFor(new Date(r.clockInAt));
 const start=+new Date(`${date}T09:30:00+05:30`),finish=+new Date(`${date}T22:30:00+05:30`);
 let out=+new Date(r.clockOutAt);
 if(r.lateClockOutCutoff&&["PENDING","REJECTED"].includes(r.lateClockOutStatus??""))out=Math.min(out,+new Date(r.lateClockOutCutoff));
 if(r.extraTimeCutoff&&r.extraTimeStatus==="REJECTED")out=Math.min(out,+new Date(r.extraTimeCutoff));
 const inside=Math.max(0,Math.min(out,finish)-Math.max(arrival,start));
 const regularMs=Math.min(9*3600000,inside);
 const bonusMs=Math.max(0,Math.min(out,start)-arrival)+Math.max(0,out-Math.max(arrival,finish));
 return {regularMs,bonusMs,unpaidMs:Math.max(0,inside-regularMs)};
}
