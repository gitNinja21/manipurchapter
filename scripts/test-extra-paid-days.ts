import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
async function main(){
 const dir=mkdtempSync(join(tmpdir(),"mc-extra-days-"));writeFileSync(join(dir,"test.db"),"");
 process.env.DATABASE_URL=`file:${join(dir,"test.db")}`;process.env.JWT_SECRET="extra-days-test-only";
 const migration=spawnSync(process.execPath,["node_modules/prisma/build/index.js","migrate","deploy"],{env:process.env,encoding:"utf8"});assert.equal(migration.status,0,migration.stderr);
 const {prisma}=await import("../src/lib/prisma");const {saveExtraPaidDays}=await import("../src/lib/extraPaidDays");const {computeStatsForRange}=await import("../src/lib/stats");const {createPayrollPdf}=await import("../src/lib/payrollPdf");
 try{
 const admin=await prisma.user.create({data:{name:"Admin",employeeCode:"ADMIN",role:"ADMIN",passwordHash:"none"}});
 const employee=await prisma.user.create({data:{name:"Employee",employeeCode:"EMP",role:"EMPLOYEE",passwordHash:"none",hourlyRateRs:50,standardShiftHours:9,paidWeeklyOff:false,createdAt:new Date("2026-10-01T00:00:00+05:30")}});
 const other=await prisma.user.create({data:{name:"Other",employeeCode:"OTHER",role:"EMPLOYEE",passwordHash:"none",hourlyRateRs:50,standardShiftHours:10,paidWeeklyOff:false,createdAt:employee.createdAt}});
 const input={userId:employee.id,month:"2026-10",creditDate:"2026-10-15",days:2,revision:0};
 await assert.rejects(saveExtraPaidDays(employee,input),/Admin only/);
 await assert.rejects(saveExtraPaidDays({...admin,active:false},input),/Admin only/);
 for(const invalid of [{days:-1},{days:1.5},{days:32},{month:"2026-13"},{creditDate:"2026-11-01"},{creditDate:"2026-10-32"},{creditDate:"2026-09-30",month:"2026-09"},{creditDate:"2099-01-01",month:"2099-01"}])await assert.rejects(saveExtraPaidDays(admin,{...input,...invalid}));
 const baseline=(await computeStatsForRange("2026-10-01","2026-10-31",{userId:employee.id}))[0].salaryRs;
 const saved=await saveExtraPaidDays(admin,input);assert.equal(saved.days,2);
 await saveExtraPaidDays(admin,input);assert.equal(await prisma.extraPaidDay.count(),1);assert.equal(await prisma.policyAudit.count(),1);
 const stats=async(from="2026-10-01",to="2026-10-31")=>(await computeStatsForRange(from,to,{userId:employee.id},true))[0];
 let s=await stats();assert.equal(s.extraPaidDays,2);assert.equal(s.extraPaidDaysPayRs,900);assert.equal(s.salaryRs,baseline+900);assert.equal(s.totalHours,0);assert.equal(s.bonusDays,0);
 assert.equal((await stats("2026-10-01","2026-10-14")).extraPaidDaysPayRs,0);
 assert.equal((await stats("2026-10-15","2026-10-31")).extraPaidDaysPayRs,900);
 assert.equal((await stats("2026-11-01","2026-11-15")).extraPaidDaysPayRs,0);
 await assert.rejects(saveExtraPaidDays(admin,{...input,days:3,revision:0}),/Another admin/);
 const updated=await saveExtraPaidDays(admin,{...input,days:3,revision:saved.revision});s=await stats();assert.equal(s.salaryRs,baseline+1350);assert.equal(await prisma.extraPaidDay.count(),1);
 const bytes=await createPayrollPdf(s,"2026-10-01","2026-10-31");assert.ok(bytes.length>1000);
 const zero=await saveExtraPaidDays(admin,{...input,days:0,revision:updated.revision});assert.equal((await stats()).salaryRs,baseline);assert.equal(zero.days,0);
 await saveExtraPaidDays(admin,{...input,userId:other.id,days:1});const otherStats=(await computeStatsForRange("2026-10-01","2026-10-31",{userId:other.id}))[0];assert.equal(otherStats.extraPaidDaysPayRs,500);assert.equal((await stats()).extraPaidDaysPayRs,0);
 assert.equal(await prisma.attendanceRecord.count(),0);
 console.log("PASS: migrations, admin authorization, input validation, idempotent saves, conflict protection, nine/ten-hour daily rates, additive date ranges, monthly isolation, removal, audit and PDF generation. No live data used.");
 }finally{await prisma.$disconnect();rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
