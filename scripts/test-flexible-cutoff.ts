import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
async function main(){
 const dir=mkdtempSync(join(tmpdir(),"mc-flex-cutoff-")),db=join(dir,"test.db");writeFileSync(db,"");
 process.env.DATABASE_URL=`file:${db}`;process.env.JWT_SECRET="isolated-test-only";
 const migrate=spawnSync(process.execPath,["node_modules/prisma/build/index.js","migrate","deploy"],{env:process.env,encoding:"utf8"});assert.equal(migrate.status,0,migrate.stderr);
 const {prisma}=await import("../src/lib/prisma");
 const {applyAdminClockOuts,assertBeforeAdminCutoff}=await import("../src/lib/adminClockOut");
 const {effectiveSchedule}=await import("../src/lib/performanceServer");
 const {requireSubmittedWeek}=await import("../src/lib/weeklyScheduleServer");
 const {flexibleNineSnapshot}=await import("../src/lib/flexibleNineHours");
 const {computeStatsForRange}=await import("../src/lib/stats");
 const date="2026-11-04",at=(s:string)=>new Date(`${date}T${s}:00+05:30`);
 try{
  for(const id of ["flex","normal","early","late","missing-in"]){
   await prisma.user.create({data:{id,name:id,employeeCode:id,passwordHash:"unused",role:"EMPLOYEE",active:true,approved:true,mustChangePassword:false,createdAt:new Date("2026-10-01"),hourlyRateRs:100,flexibleNineHours:id==="flex"}});
  }
  const flex=await prisma.user.findUniqueOrThrow({where:{id:"flex"}});
  await requireSubmittedWeek(prisma,flex.id,date);
  await assert.rejects(requireSubmittedWeek(prisma,"normal",date),/weekly schedule/);
  const schedule=await effectiveSchedule(prisma,flex,date);
  assert.equal(schedule?.policyVersion,5);assert.equal(schedule?.opens.toISOString(),new Date(date+"T00:00:00+05:30").toISOString());
  assert.equal(await effectiveSchedule(prisma,flex,"2026-11-09"),null);
  await prisma.workDayOverride.create({data:{workDate:"2026-11-09",mode:"HOURLY",updatedById:"admin"}});
  assert.equal((await effectiveSchedule(prisma,flex,"2026-11-09"))?.policyVersion,5);
  await prisma.workDayOverride.update({where:{workDate:"2026-11-09"},data:{mode:"PAID_OFF"}});
  assert.equal(await effectiveSchedule(prisma,flex,"2026-11-09"),null);
  for(const id of ["flex","normal","early","late","missing-in"]){
   await prisma.attendanceRecord.create({data:{id,userId:id,workDate:date,clockInAt:at(id==="late"?"18:00":"10:00"),clockOutAt:id==="early"?at("16:00"):null,missingPunch:id==="missing-in"?"IN":"NONE",...(id==="flex"?flexibleNineSnapshot(date):{policyVersion:3,shiftDurationMinutes:540,unpaidBreakMinutes:0,scheduledStartAt:at("10:00"),scheduledEndAt:at("19:00")})}});
  }
  await prisma.adminClockOutDay.create({data:{workDate:date,enabled:false,cutoffAt:at("17:00"),updatedById:"admin"}});
  await applyAdminClockOuts(undefined,at("18:00"));
  assert.equal((await prisma.attendanceRecord.findUniqueOrThrow({where:{id:"normal"}})).clockOutAt,null);
  await prisma.adminClockOutDay.update({where:{workDate:date},data:{enabled:true}});
  await applyAdminClockOuts(undefined,at("16:59"));
  assert.equal((await prisma.attendanceRecord.findUniqueOrThrow({where:{id:"normal"}})).clockOutAt,null);
  await assertBeforeAdminCutoff(prisma,date,at("16:59"));
  await assert.rejects(assertBeforeAdminCutoff(prisma,date,at("17:00")),/admin clock-out time/);
  await applyAdminClockOuts(undefined,at("17:00"));await applyAdminClockOuts(undefined,at("18:00"));
  for(const id of ["flex","normal","missing-in"]){
   const r=await prisma.attendanceRecord.findUniqueOrThrow({where:{id}});
   assert.equal(+r.clockOutAt!,+at("17:00"));assert.equal(r.autoClockOut,true);assert.equal(r.clockOutPhoto,null);
   assert.equal(r.missingPunch,id==="missing-in"?"IN":"NONE");
  }
  assert.equal(+(await prisma.attendanceRecord.findUniqueOrThrow({where:{id:"early"}})).clockOutAt!,+at("16:00"));
  assert.equal((await prisma.attendanceRecord.findUniqueOrThrow({where:{id:"late"}})).clockOutAt,null);
  assert.equal(await prisma.attendanceAudit.count({where:{action:"ADMIN_SCHEDULED_CLOCK_OUT"}}),3);
  assert.equal(await prisma.attendanceAudit.count({where:{action:"AUTO_CLOCK_OUT"}}),0);
  const stats=await computeStatsForRange(date,date,undefined,true),f=stats.find(s=>s.userId==="flex")!;
  assert.equal(f.regularPayRs,700);assert.equal(f.overtimeHours,0);assert.equal(f.missingPunchIncidents,0);
  await prisma.adminClockOutDay.update({where:{workDate:date},data:{enabled:false}});
  await applyAdminClockOuts(undefined,at("23:00"));
  assert.equal(+(await prisma.attendanceRecord.findUniqueOrThrow({where:{id:"normal"}})).clockOutAt!,+at("17:00"));
  console.log("PASS: migrated database, weekly exemption, flexible weekdays/open Mondays/closures, cutoff timing, repeat safety, earlier punches, no penalty and payroll.");
 }finally{await prisma.$disconnect();rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
