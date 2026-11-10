import type {Prisma} from "@prisma/client";
import {prisma} from "./prisma";
import {TeamError} from "./team";
import {auditData} from "./attendanceAudit";

/** Prevent new attendance after a date's admin-selected closure, including races. */
export async function assertBeforeAdminCutoff(db:Prisma.TransactionClient,date:string,at:Date){
 const rule=await db.adminClockOutDay.findUnique({where:{workDate:date}});
 if(rule?.enabled && at>=rule.cutoffAt)throw new TeamError("The admin clock-out time for this date has passed. Ask admin for an attendance correction.",409);
}
/** Idempotent, catches up after a restart, and never alters an existing clock-out. */
export async function applyAdminClockOuts(userId?:string,now=new Date()){
 const rules=await prisma.adminClockOutDay.findMany({where:{enabled:true,cutoffAt:{lte:now}}});
 for(const candidate of rules){
  await prisma.$transaction(async tx=>{
   const rule=await tx.adminClockOutDay.findUnique({where:{workDate:candidate.workDate}});
   if(!rule?.enabled||rule.cutoffAt>now)return;
   const records=await tx.attendanceRecord.findMany({where:{user:{role:"EMPLOYEE"},workDate:rule.workDate,...(userId?{userId}:{}),clockInAt:{not:null,lte:rule.cutoffAt},clockOutAt:null},include:{user:true}});
   for(const record of records){
    const changed=await tx.attendanceRecord.updateMany({where:{id:record.id,updatedAt:record.updatedAt,clockOutAt:null},data:{
     clockOutAt:rule.cutoffAt,autoClockOut:true,missingPunch:record.missingPunch==="IN"?"IN":"NONE",
     missingPunchWaived:record.missingPunch==="IN"?record.missingPunchWaived:false,
     lateClockOutCutoff:null,lateClockOutStatus:"NOT_REQUIRED",
    }});
    if(!changed.count)continue;
    const after=await tx.attendanceRecord.findUniqueOrThrow({where:{id:record.id}});
    await tx.attendanceAudit.create({data:auditData(record,record.user,{id:rule.updatedById,name:"Admin scheduled clock-out"},"ADMIN_SCHEDULED_CLOCK_OUT",after)});
   }
  },{timeout:20000});
 }
}
