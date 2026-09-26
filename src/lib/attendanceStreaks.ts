import { usesMasterPolicy } from "./masterPolicy";
import { deviations, offDay, type PolicyRecord } from "./performance";
import { policyApplies, recurringRule, type PolicySchedule } from "./workPolicy";
export type TalkStatus = "NONE" | "SOON" | "DUE_TODAY" | "PENDING" | "CLEARED" | "FOLLOW_UP";
export type StreakDay = {
  date: string; eligible: boolean; onLeave: boolean;
  lateMs: number; earlyMs: number;
  lateStreak: number; earlyStreak: number;
  lateTalkStreak: number; earlyTalkStreak: number;
  lateTalk: TalkStatus; earlyTalk: TalkStatus;
};
type StreakRecord = PolicyRecord & {workDate:string};
type Meeting = {kind:string;status:string;triggerDate:string;clearedDate:string|null};
type Input = {
  user: PolicySchedule & {attendancePolicyFrom?:string|null};
  records: StreakRecord[];
  leave: {fromDate:string;toDate:string}[];
  shifts: {workDate:string}[];
  meetings: Meeting[];
  from: string; to: string; today: string;
};
/** One rule engine for manager triggers and the date-wise report. Today's rows are provisional. */
export function attendanceStreaks({user,records,leave,shifts,meetings,from,to,today}:Input) {
  const byDay=new Map(records.map(r=>[r.workDate,r]));
  const shiftDays=new Set(shifts.map(s=>s.workDate));
  const first=records.reduce((day,r)=>r.workDate<day ? r.workDate : day,from);
  const triggers=new Set<string>(),days:StreakDay[]=[];
  const counters={LATE:{actual:0,cycle:0,awaiting:false},EARLY:{actual:0,cycle:0,awaiting:false}};
  for(let time=Date.parse(first);time<=Date.parse(to);time+=86400000) {
    const date=new Date(time).toISOString().slice(0,10),r=byDay.get(date);
    const onLeave=leave.some(l=>l.fromDate<=date && l.toDate>=date);
    const eligible=!offDay(date) && !onLeave &&
      (!(user.weeklyScheduleJson || (user.masterScheduleFrom && date>=user.masterScheduleFrom && user.masterScheduleJson)) || !!recurringRule(user,date) || shiftDays.has(date)) &&
      (!!r?.scheduledStartAt || policyApplies(user,date) || shiftDays.has(date));
    const d=r ? deviations(r) : {lateMs:0,earlyMs:0};
    const states:Record<"LATE"|"EARLY",TalkStatus>={LATE:"NONE",EARLY:"NONE"};
    for(const kind of ["LATE","EARLY"] as const) {
      if (usesMasterPolicy(date)) { counters[kind]={actual:0,cycle:0,awaiting:false}; continue; }
      const c=counters[kind];
      const cleared=meetings.some(m=>m.kind===kind && m.status==="CLEARED" && m.clearedDate===date);
      if(cleared) {c.cycle=0;c.awaiting=false;}
      const afterMeeting=meetings.some(m=>m.kind===kind && m.status==="CLEARED" && m.clearedDate && m.clearedDate<date && m.clearedDate.slice(0,7)===date.slice(0,7));
      // A day is final once past. Today, arrival is known at clock-in; early departure only at clock-out.
      const known=date<today || !!(kind==="LATE" ? r?.clockInAt : r?.clockOutAt);
      const incident=!!r && r.approvalStatus!=="REJECTED" && (kind==="LATE" ? d.lateMs>15*60000 : d.earlyMs>0);
      if(eligible && known) {
        c.actual=incident ? c.actual+1 : 0;
        if(afterMeeting) c.cycle=0;
        else if(!c.awaiting) {
          c.cycle=incident ? c.cycle+1 : 0;
          if(c.cycle===3 && date<today) {triggers.add(`${kind}:${date}`);c.awaiting=true;}
        }
      }
      // Also show historical pending periods when the report ends before a later clearance.
      const pending=meetings.some(m=>m.kind===kind && m.triggerDate<=date && (m.status==="PENDING" || (m.status==="CLEARED" && !!m.clearedDate && m.clearedDate>date)));
      states[kind]=cleared ? "CLEARED" : pending || c.awaiting ? "PENDING" : afterMeeting ? "FOLLOW_UP" : c.cycle>=3 ? "DUE_TODAY" : c.cycle===2 ? "SOON" : "NONE";
    }
    if(date>=from) days.push({date,eligible,onLeave,...d,
      lateStreak:counters.LATE.actual,earlyStreak:counters.EARLY.actual,
      lateTalkStreak:counters.LATE.cycle,earlyTalkStreak:counters.EARLY.cycle,
      lateTalk:states.LATE,earlyTalk:states.EARLY});
  }
  return {triggers,days};
}
