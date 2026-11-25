import { weekStart, validDate } from './reporting';
export const WEEKLY_SCHEDULE_FROM = '2026-11-04';
export type WeekTimes = Record<string,{start:string;end:string}>;
export const weeklyApplies = (date:string) => date >= WEEKLY_SCHEDULE_FROM;
export function weekDates(date:string) {
 const start=weekStart(date);
 return Array.from({length:6},(_,i)=>new Date(Date.parse(start)+(i+1)*86400000).toISOString().slice(0,10));
}
export function parseWeekTimes(value:unknown,week:string,shiftHours=9):WeekTimes {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Enter Tuesday through Sunday times.');
 const input=value as Record<string,unknown>,dates=weekDates(week);
 if(Object.keys(input).length!==6 || Object.keys(input).some(d=>!dates.includes(d)))throw new Error('Set all six days, Tuesday through Sunday. Monday is off.');
 const result:WeekTimes={};
 for(const date of dates){
  const row=input[date] as {start?:unknown;end?:unknown};
  if(!row||typeof row.start!=='string'||typeof row.end!=='string'||!/^\d{2}:\d{2}$/.test(row.start)||!/^\d{2}:\d{2}$/.test(row.end))throw new Error('Enter valid start and finish times.');
  const minutes=(s:string)=>{const [h,m]=s.split(':').map(Number);if(h>23||m>59)throw new Error('Enter valid times.');return h*60+m;};
  if(minutes(row.end)-minutes(row.start)!==shiftHours*60)throw new Error(`${date}: total shift must be ${shiftHours} hours, including a 1-hour paid break.`);
  result[date]={start:row.start,end:row.end};
 }
 return result;
}
export function validWeek(week:string,today:string){return validDate(week)&&weekStart(week)===week && [weekStart(today),new Date(Date.parse(weekStart(today))+7*86400000).toISOString().slice(0,10)].includes(week);}
export function missingPunchDeductions(incidents:{workDate:string;missingPunch?:string;missingPunchWaived?:boolean}[],from:string,to:string) {
 // Keep incident reporting, but missing punches no longer deduct salary.
 // Applies to all recalculated reports, including historical periods.
 const count=incidents.filter(r=>weeklyApplies(r.workDate)&&r.workDate>=from&&r.workDate<=to&&r.missingPunch&&r.missingPunch!=="NONE"&&!r.missingPunchWaived).length;
 return {incidents:count,days:0};
}
