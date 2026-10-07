// Disposable migrated database: validates payroll and performance use the same launch boundary.
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
async function main() {
  const dir=mkdtempSync(join(tmpdir(),"mc-live-stats-")),file=join(dir,"test.db");writeFileSync(file,"");
  process.env.DATABASE_URL=`file:${file}`;process.env.JWT_SECRET="isolated-statistics-test";
  const migration=spawnSync(process.execPath,["node_modules/prisma/build/index.js","migrate","deploy"],{env:process.env,encoding:"utf8"});assert.equal(migration.status,0,migration.stderr);
  const {prisma}=await import("../src/lib/prisma");
  const {monthlyPerformance}=await import("../src/lib/performanceServer");
  const {computeStatsForRange}=await import("../src/lib/stats");
  try {
    await prisma.user.create({data:{id:"a",name:"A",employeeCode:"A",passwordHash:"unused",createdAt:new Date("2026-09-01"),hourlyRateRs:100}});
    for(const [date,extra] of [["2026-09-29",7],["2026-10-01",1],["2026-10-02",7]] as const) {
      const start=new Date(`${date}T09:00:00+05:30`),end=new Date(+start+9*3600000);
      await prisma.attendanceRecord.create({data:{id:date,userId:"a",workDate:date,clockInAt:start,clockOutAt:new Date(+end+extra*3600000),scheduledStartAt:start,scheduledEndAt:end,shiftDurationMinutes:540,unpaidBreakMinutes:0,policyVersion:3,approvalStatus:"APPROVED"}});
      await prisma.referralClaim.create({data:{userId:"a",billDate:date,billNumber:date,billKey:date,partyReference:date,reason:"test",status:"APPROVED"}});
      await prisma.customerReview.create({data:{user:{connect:{id:"a"}},workDate:date,friendliness:5,attentiveness:5,accuracy:5,speed:5,overall:5,totalStars:25,points:1,invite:{create:{userId:"a",code:date,expiresAt:new Date("2027-01-01")}}}});
      await prisma.attendanceAudit.create({data:{recordId:date,userId:"a",workDate:date,employeeName:"A",employeeCode:"A",actorId:"SYSTEM",actorName:"test",action:"AUTO_CLOCK_OUT",beforeJson:"{}"}});
    }
    const old=await monthlyPerformance("2026-09");
    assert.equal(old.entries.length,0);assert.equal(old.totals.size,0);assert.equal(old.incidents.length,0);assert.equal(old.missedClockOutCounts.size,0);
    const october=await monthlyPerformance("2026-10");
    assert.equal(october.entries.filter(e=>e.kind==="Bonus working days").length,1);
    assert.equal(october.entries.find(e=>e.kind==="Bonus working days")?.date,"2026-10-02");
    assert.equal(october.totals.get("a")?.points,9); // 1 base + 1 bonus + 6 referral + 2 reviews - 1 missed-out.
    assert.equal(october.missedClockOutCounts.get("a"),2);
    const [first]=await computeStatsForRange("2026-10-01","2026-10-01");assert.equal(first.bonusDays,0);assert.equal(first.overtimeBalanceHours,1);
    const [second]=await computeStatsForRange("2026-10-02","2026-10-02");assert.equal(second.bonusDays,1);assert.equal(second.overtimeBalanceHours,0);
    const [september]=await computeStatsForRange("2026-09-01","2026-09-30");assert.equal(september.salaryRs,0);assert.equal(september.overtimeBalanceHours,0);
    assert.equal(await prisma.attendanceRecord.count(),3);assert.equal(await prisma.customerReview.count(),3);assert.equal(await prisma.referralClaim.count(),3);
    console.log("Go-live integration passed: September excluded, October-only bonus thresholds and points, historical records preserved.");
  } finally {await prisma.$disconnect();rmSync(dir,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
