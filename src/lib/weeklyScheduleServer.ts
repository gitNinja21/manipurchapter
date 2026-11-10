import type {Prisma} from '@prisma/client';
import {weekStart} from './reporting';
import {weeklyApplies,type WeekTimes} from './weeklySchedulePolicy';
import {TeamError} from './team';
export async function submittedWeek(db:Prisma.TransactionClient,userId:string,date:string){return db.employeeWeekSchedule.findUnique({where:{userId_weekStart:{userId,weekStart:weekStart(date)}}});}
export async function requireSubmittedWeek(db:Prisma.TransactionClient,userId:string,date:string){
 if((await db.user.findUnique({where:{id:userId},select:{flexibleNineHours:true}}))?.flexibleNineHours)return;
 if(weeklyApplies(date)&&!await submittedWeek(db,userId,date))throw new TeamError('Submit your weekly schedule on the Today page before clocking in.',409);
}
export async function employeeWeekShift(db:Prisma.TransactionClient,userId:string,date:string){
 const week=await submittedWeek(db,userId,date);if(!week)return null;
 const times=(JSON.parse(week.daysJson) as WeekTimes)[date];if(!times)return null;
 const start=new Date(`${date}T${times.start}:00+05:30`),end=new Date(`${date}T${times.end}:00+05:30`);
 return {policyVersion:3,start,end,arrivalStart:start,opens:new Date(+start-15*60000),durationMinutes:(+end-+start)/60000,paidBreakMinutes:60,breakMinutes:0};
}
export async function listWeeklyShifts(db:Prisma.TransactionClient,from:string,to:string,userId?:string){
 const weeks=await db.employeeWeekSchedule.findMany({where:{...(userId?{userId}:{}),weekStart:{gte:weekStart(from),lte:weekStart(to)}}});
 const users=await db.user.findMany({where:{id:{in:weeks.map(w=>w.userId)}},select:{id:true,name:true}}),names=new Map(users.map(u=>[u.id,u.name]));
 return weeks.flatMap(w=>Object.entries(JSON.parse(w.daysJson) as WeekTimes).filter(([d])=>weeklyApplies(d)&&d>=from&&d<=to).map(([d,t])=>({id:`weekly:${w.id}:${d}`,userId:w.userId,workDate:d,startsAt:new Date(`${d}T${t.start}:00+05:30`),endsAt:new Date(`${d}T${t.end}:00+05:30`),updatedAt:w.updatedAt,note:'Employee weekly schedule | Includes 1-hour paid break',user:{name:names.get(w.userId)??'Employee'}})));
}
