// Disposable SQLite verification: never touches the configured production database.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
async function main() {
  process.env.DATABASE_URL=`file:${join(mkdtempSync(join(tmpdir(),"mc-auto-out-")),"test.sqlite")}`;
  writeFileSync(process.env.DATABASE_URL.slice(5), "");
  const migration=spawnSync(process.execPath,["node_modules/prisma/build/index.js","migrate","deploy"],{env:process.env,encoding:"utf8"});
  assert.equal(migration.status,0,migration.stderr);
  const {prisma}=await import("../src/lib/prisma");
  const {closeForgottenShifts}=await import("../src/lib/autoClockOut");
  try {
    await prisma.user.create({data:{id:"test",name:"Test",employeeCode:"AUTO-TEST",passwordHash:"unused"}});
    const at=(date:string,time:string)=>new Date(`${date}T${time}:00+05:30`);
    for(const day of ["2026-09-26","2026-09-27","2026-09-28"]) await prisma.attendanceRecord.create({data:{userId:"test",workDate:day,clockInAt:at(day,"10:00"),...(day.endsWith("28")?{clockOutAt:at(day,"20:00")}:{}),approvalStatus:"REJECTED"}});
    assert.equal(await closeForgottenShifts(at("2026-09-27","22:44")),0);
    assert.equal(await closeForgottenShifts(at("2026-09-28","08:00")),1);
    assert.equal(await closeForgottenShifts(at("2026-09-28","23:00")),0);
    const records=await prisma.attendanceRecord.findMany({orderBy:{workDate:"asc"}});
    assert.equal(records[0].clockOutAt,null);
    assert.equal(+records[1].clockOutAt!,+at("2026-09-27","22:45"));
    assert.equal(records[1].autoClockOut,true);assert.equal(records[1].approvalStatus,"REJECTED");
    assert.equal(records[1].clockOutFaceMatch,null);
    assert.equal(+records[2].clockOutAt!,+at("2026-09-28","20:00"));
    assert.equal(await prisma.attendanceAudit.count(),1);
    assert.equal(await prisma.notification.count(),1);
    process.env.JWT_SECRET="test-auto-out-only";
    const {monthlyPerformance}=await import("../src/lib/performanceServer");
    let performance=await monthlyPerformance("2026-09","test");
    assert.equal(performance.missedClockOutCounts.get("test"),1);
    assert.equal(performance.totals.get("test")?.points,-0.5);
    await prisma.attendanceRecord.update({where:{id:records[1].id},data:{autoClockOut:false,clockOutAt:at("2026-09-27","22:00")}});
    performance=await monthlyPerformance("2026-09","test");
    assert.equal(performance.totals.get("test")?.points,-0.5);
    assert.equal((await monthlyPerformance("2026-10","test")).missedClockOutCounts.size,0);
    console.log("PASS: migration, exact IST departure, restart catch-up, history/manual preservation, idempotency, audit and notification.");
  } finally {await prisma.$disconnect();}
}
void main();
