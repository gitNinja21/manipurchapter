import {applyAdminClockOuts,assertBeforeAdminCutoff} from "./adminClockOut";
import {prisma} from './prisma';
import {todayWorkDate} from './time';
import {WEEKLY_SCHEDULE_FROM} from './weeklySchedulePolicy';
/** Reconcile only past IST dates. Real clock-out remains available all shift day. */
export async function reconcileMissingClockOut(userId?:string,today=todayWorkDate()){
 await applyAdminClockOuts(userId);
 const open=await prisma.attendanceRecord.findMany({where:{...(userId?{userId}:{}),workDate:{gte:WEEKLY_SCHEDULE_FROM,lt:today},clockInAt:{not:null},clockOutAt:null,scheduledEndAt:{not:null,lte:new Date(`${today}T00:00:00+05:30`)}}});
 for(const r of open){
  await prisma.$transaction(async tx=>{
   const out=new Date(Math.max(+r.clockInAt!,+r.scheduledEndAt!));
   const changed=await tx.attendanceRecord.updateMany({where:{id:r.id,clockOutAt:null,updatedAt:r.updatedAt},data:{clockOutAt:out,missingPunch:'OUT',missingPunchWaived:false,autoClockOut:false}});
   if(!changed.count)return;
   const u=await tx.user.findUniqueOrThrow({where:{id:r.userId}});
   await tx.attendanceAudit.create({data:{recordId:r.id,userId:r.userId,employeeName:u.name,employeeCode:u.employeeCode,workDate:r.workDate,actorId:'SYSTEM',actorName:'Scheduled attendance reconciliation',action:'MISSING_CLOCK_OUT_INFERRED',beforeJson:JSON.stringify({clockOutAt:null}),afterJson:JSON.stringify({clockOutAt:out,missingPunch:'OUT',source:'SAVED_SCHEDULE'})}});
  });
 }
}
const state=globalThis as typeof globalThis & {missingPunchTimer?:ReturnType<typeof setInterval>};
export function startMissingPunchWorker(){
 if(state.missingPunchTimer)return;let busy=false;
 const tick=async()=>{if(busy)return;busy=true;try{await reconcileMissingClockOut();}catch{console.warn('Missing-punch reconciliation failed; will retry.');}finally{busy=false;}};
 state.missingPunchTimer=setInterval(()=>void tick(),60000);state.missingPunchTimer.unref();void tick();
}

// A verified clock-out can establish attendance without inventing a verified arrival.
export async function missingClockInContext(db:import('@prisma/client').Prisma.TransactionClient,user:import('@prisma/client').User,date:string,at:Date){
 const {requireSubmittedWeek}=await import('./weeklyScheduleServer');
 const {effectiveSchedule}=await import('./performanceServer');
 const {TeamError}=await import('./team');
 if(date<WEEKLY_SCHEDULE_FROM)throw new TeamError('No clock-in found. Ask admin for an attendance correction.',409);
 await requireSubmittedWeek(db,user.id,date);
 await assertBeforeAdminCutoff(db,date,at);
 if(await db.attendanceRecord.findFirst({where:{userId:user.id,OR:[{workDate:date},{clockInAt:{not:null},clockOutAt:null}]}}))throw new TeamError('Attendance already exists. Refresh or ask admin for a correction.',409);
 if(await db.staffRequest.findFirst({where:{userId:user.id,kind:'LEAVE',status:'APPROVED',fromDate:{lte:date},toDate:{gte:date}}}))throw new TeamError('You have approved leave on this date. Ask admin to review it.',409);
 const schedule=await effectiveSchedule(db,user,date);
 if(!schedule || schedule.policyVersion===4 || at<=schedule.start)throw new TeamError('A submitted fixed shift that has already started is required. For a flexible Monday, ask admin to enter actual times.',409);
 return schedule;
}
