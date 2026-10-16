export type EditableDay = {start:number;latest:number;duration:number;unpaidBreak:number;paidBreak:number};
export type ScheduleVersion = {from:string;days:Record<string,EditableDay>;oneDay?:boolean};
export function scheduleVersion(user:{scheduleHistoryJson?:string|null},date:string):ScheduleVersion|null {
  const history:ScheduleVersion[]=JSON.parse(user.scheduleHistoryJson || "[]");
  return history.filter(v=>v.oneDay ? v.from===date : v.from<=date).sort((a,b)=>Number(!!b.oneDay)-Number(!!a.oneDay) || b.from.localeCompare(a.from))[0] ?? null;
}
export function validateSchedule(value:unknown):Record<string,EditableDay> {
  if(!value || typeof value!=="object" || Array.isArray(value)) throw new Error("Enter a weekly schedule.");
  const days=value as Record<string,EditableDay>;
  if(!Object.keys(days).length) throw new Error("Select at least one working day.");
  for(const [day,r] of Object.entries(days)) {
    if(!["0","2","3","4","5","6"].includes(day)) throw new Error("Monday remains the weekly off day.");
    if(!r || ![r.start,r.duration,r.unpaidBreak,r.paidBreak].every(Number.isInteger) || r.start<0 || r.duration<=0 || r.start+r.duration>1440 || r.unpaidBreak<0 || r.paidBreak<0 || r.unpaidBreak+r.paidBreak>=r.duration) throw new Error("Check start/finish and break minutes. Breaks must be shorter than the shift.");
  }
  return Object.fromEntries(Object.entries(days).map(([d,r])=>[d,{start:r.start,latest:r.start,duration:r.duration,unpaidBreak:r.unpaidBreak,paidBreak:r.paidBreak}]));
}

/** Only explicit one-day openings change Monday payroll and attendance rules. */
export function isOpenMonday(user:{scheduleHistoryJson?:string|null},date:string):boolean {
 return new Date(`${date}T12:00:00Z`).getUTCDay()===1 && !!scheduleVersion(user,date)?.oneDay;
}
