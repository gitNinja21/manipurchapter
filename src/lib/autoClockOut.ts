import { prisma } from "./prisma";
import { auditData } from "./attendanceAudit";

export const AUTO_CLOCK_OUT_FROM = "2026-09-27";
export function automaticDeparture(record: {workDate:string;clockInAt:Date|null;clockOutAt:Date|null}, now:Date) {
  if(record.workDate < AUTO_CLOCK_OUT_FROM || !record.clockInAt || record.clockOutAt) return null;
  const cutoff=new Date(`${record.workDate}T22:45:00+05:30`);
  return +now >= +cutoff && +record.clockInAt < +cutoff ? cutoff : null;
}
/** Conditional update and audit share a transaction: safe against concurrent workers and manual clock-out. */
export async function closeForgottenShifts(now=new Date()) {
  const open=await prisma.attendanceRecord.findMany({where:{workDate:{gte:AUTO_CLOCK_OUT_FROM},clockInAt:{not:null},clockOutAt:null},include:{user:{select:{name:true,employeeCode:true}}}});
  let closed=0;
  for(const record of open) {
    const cutoff=automaticDeparture(record,now);
    if(!cutoff) continue;
    closed+=await prisma.$transaction(async tx=>{
      const changed=await tx.attendanceRecord.updateMany({where:{id:record.id,clockOutAt:null,updatedAt:record.updatedAt},data:{
        clockOutAt:cutoff,autoClockOut:true,clockOutPhoto:null,clockOutFaceMatch:null,clockOutFaceDistance:null,
        lateClockOutCutoff:null,lateClockOutStatus:"NOT_REQUIRED",
        extraTimeStatus:record.extraTimeStatus === "REJECTED" ? "REJECTED" : record.extraTimeCutoff && cutoff>record.extraTimeCutoff ? "AUTOMATIC" : "NOT_REQUIRED",
      }});
      if(!changed.count) return 0;
      const after=await tx.attendanceRecord.findUniqueOrThrow({where:{id:record.id}});
      await tx.attendanceAudit.create({data:auditData(record,record.user,{id:"SYSTEM",name:"Automatic clock-out"},"AUTO_CLOCK_OUT",after)});
      await tx.notification.create({data:{userId:record.userId,kind:"AUTO_CLOCK_OUT",entityKey:record.id,title:"Automatically clocked out at 10:45 pm IST. Missed clock-out: −0.5 points. Request an attendance correction if your leaving time was different.",href:"/employee/team?view=requests"}});
      return 1;
    });
  }
  return closed;
}
const worker=globalThis as typeof globalThis & {autoClockOutTimer?:ReturnType<typeof setInterval>};
export function startAutoClockOutWorker() {
  if(worker.autoClockOutTimer) return;
  let running=false;
  const tick=async()=>{
    if(running) return;
    running=true;
    try {await closeForgottenShifts();}
    catch {console.warn("Automatic clock-out failed; retrying next minute.");}
    finally {running=false;}
  };
  worker.autoClockOutTimer=setInterval(()=>void tick(),60000);
  worker.autoClockOutTimer.unref();
  void tick();
}
