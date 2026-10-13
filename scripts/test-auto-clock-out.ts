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
    const before=await prisma.attendanceRecord.findMany({orderBy:{workDate:"asc"}});
    process.env.AUTO_CLOCK_OUT_ENABLED="true";
    assert.equal(await closeForgottenShifts(),0);
    assert.equal(await closeForgottenShifts(),0);
    const after=await prisma.attendanceRecord.findMany({orderBy:{workDate:"asc"}});
    assert.deepEqual(after,before);
    assert.equal(await prisma.attendanceAudit.count(),0);
    assert.equal(await prisma.notification.count(),0);
    console.log("PASS: retired worker leaves open shifts and recorded departures untouched; no automatic audits or notifications.");
  } finally {await prisma.$disconnect();}
}
void main();
