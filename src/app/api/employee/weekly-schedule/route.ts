import {prisma} from '@/lib/prisma';
import {teamRoute,TeamError,jsonBody,notify} from '@/lib/team';
import {todayWorkDate} from '@/lib/time';
import {weekStart} from '@/lib/reporting';
import {recurringRule} from '@/lib/workPolicy';
import {WEEKLY_SCHEDULE_FROM,weekDates,validWeek,parseWeekTimes,type WeekTimes} from '@/lib/weeklySchedulePolicy';
import {queueAnnouncementSms,announcementSmsConfig} from '@/lib/announcementSms';
import {policyAudit} from '@/lib/performanceServer';
const format=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
export const GET=teamRoute(async(u,req)=>{
 if(u.flexibleNineHours)return {exempt:true};
 if(u.role!=='EMPLOYEE')throw new TeamError('Employee account required.',403);
 const today=todayWorkDate(),week=req.nextUrl.searchParams.get('week')||weekStart(today);
 if(!validWeek(week,today))throw new TeamError('Choose this week or next week.');
 const saved=await prisma.employeeWeekSchedule.findUnique({where:{userId_weekStart:{userId:u.id,weekStart:week}}});
 const shiftHours=u.standardShiftHours??9;
 const defaults:WeekTimes={};
 for(const d of weekDates(week)) {const start=Math.min(24*60-1-shiftHours*60,recurringRule(u,d)?.start??10*60);defaults[d]={start:format(start),end:format(start+shiftHours*60)};}
 return {week,today,shiftHours,effectiveFrom:WEEKLY_SCHEDULE_FROM,days:saved?JSON.parse(saved.daysJson):defaults,submitted:!!saved,revision:saved?.revision??0,smsConfigured:!!announcementSmsConfig()};
});
export const POST=teamRoute(async(u,req)=>{
 if(u.flexibleNineHours)throw new TeamError('You have flexible attendance; no weekly schedule is required.');
 if(u.role!=='EMPLOYEE'||!u.active)throw new TeamError('Active employee account required.',403);
 const b=await jsonBody(req),today=todayWorkDate(),week=String(b.week);
 if(!validWeek(week,today))throw new TeamError('Choose this week or next week.');
 let days:WeekTimes;try{days=parseWeekTimes(b.days,week,u.standardShiftHours??9);}catch(e){throw new TeamError((e as Error).message);}
 const result=await prisma.$transaction(async tx=>{
  const old=await tx.employeeWeekSchedule.findUnique({where:{userId_weekStart:{userId:u.id,weekStart:week}}});
  if((old?.revision??0)!==b.revision)throw new TeamError('Schedule changed. Reload before saving.',409);
  const previous:WeekTimes=old?JSON.parse(old.daysJson):{};
  const changes:string[]=[];
  for(const [d,t] of Object.entries(days)){
   if(old&&d<=today&&JSON.stringify(t)!==JSON.stringify(previous[d]))throw new TeamError('Only future dates can be edited. Ask admin for a current or past attendance correction.');
   if(d<WEEKLY_SCHEDULE_FROM||d<today)continue;
   if(!old||t.start!==previous[d]?.start||t.end!==previous[d]?.end)changes.push(`${d}: ${previous[d]?`${previous[d].start}-${previous[d].end} -> `:''}${t.start}-${t.end}`);
  }
  if(old&&!changes.length)return old;
  const saved=await tx.employeeWeekSchedule.upsert({where:{userId_weekStart:{userId:u.id,weekStart:week}},create:{userId:u.id,weekStart:week,daysJson:JSON.stringify(days)},update:{daysJson:JSON.stringify(days),revision:{increment:1}}});
  await policyAudit(tx,u,u.id,saved.id,'EMPLOYEE_WEEK_SCHEDULE',old,saved);
  const admins=await tx.user.findMany({where:{role:'ADMIN',active:true},select:{id:true,role:true}});
  await notify(tx,admins,'WEEK_SCHEDULE',`${saved.id}:${saved.revision}`,`${u.name} ${old?'edited':'submitted'} weekly schedule`,'team?view=requests');
  const announcement=await tx.announcement.create({data:{authorId:u.id,title:`${u.name}: weekly schedule ${old?'edited':'submitted'}`,body:`${u.employeeCode} | Week ${week} | IST\n${changes.join('\n')}\n${u.standardShiftHours??9}h including 1h paid break. Monday off.`,audience:'SELECTED'}});
  await queueAnnouncementSms(tx,announcement.id,[]); // Existing configured admin phone contacts only.
  return saved;
 });
 return {ok:true,revision:result.revision,smsConfigured:!!announcementSmsConfig()};
});
