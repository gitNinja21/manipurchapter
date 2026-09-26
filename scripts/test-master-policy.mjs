// Disposable database and test-only process clock; production has no clock override.
// Run after npm run build: node scripts/test-performance.mjs
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const dir = await mkdtemp(path.join(tmpdir(), "mc-master-"));
const url = `file:${dir}/rules-test.sqlite`;
await writeFile(path.join(dir, "rules-test.sqlite"), "");
const clockPath = path.join(dir, "clock.txt");
const setTime = (value) => writeFile(clockPath, String(+new Date(value)));
await setTime("2026-09-19T09:00:00+05:30");
const preload = path.join(dir, "clock.cjs");
await writeFile(
  preload,
  `const fs=require('node:fs'); const RealDate=Date; const now=()=>Number(fs.readFileSync(${JSON.stringify(clockPath)},'utf8')); global.Date=class extends RealDate { constructor(...args){ if(args.length)super(...args); else super(now()); } static now(){return now();} static parse(value){return RealDate.parse(value);} static UTC(...args){return RealDate.UTC(...args);} };`,
);
const env = {
  ...process.env, ATTENDANCE_REMINDERS_ENABLED:"false",
  DATABASE_URL: url,
  JWT_SECRET: "isolated-work-rules-test-secret",
  UPLOADS_DIR: path.join(dir, "uploads"),
  RESTAURANT_LAT: "0",
  RESTAURANT_LNG: "0",
  RESTAURANT_RADIUS_METERS: "200",
  VAPID_PUBLIC_KEY: "",
  VAPID_PRIVATE_KEY: "",
};
const migration = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env, encoding: "utf8" },
);
assert.equal(
  migration.status,
  0,
  dir + "\n" + migration.stdout + "\n" + migration.stderr,
);
const db = new PrismaClient({ datasources: { db: { url } } });
let server;
let logs = "";
const base = "http://127.0.0.1:3107";
const request = async (cookie, route, method = "GET", body) => {
  const r = await fetch(base + route, {
    method,
    headers: { cookie, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual",
  });
  const data = await r.json();
  return { status: r.status, data };
};
const ok = async (...args) => {
  const r = await request(...args);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
const photo = {
  photoDataUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=",
  descriptor: Array(128).fill(0),
  lat: 0,
  lng: 0,
};
try {
  const passwordHash=await bcrypt.hash("Test-only-work-rules-123",4);
  const sql=await readFile("prisma/migrations/20260926000000_master_schedule/migration.sql","utf8");
  const plans=new Map([...sql.matchAll(/"masterScheduleJson"='([^']+)' WHERE "role"='EMPLOYEE' AND "employeeCode"='([^']+)'/g)].map(m=>[m[2],m[1]]));
  for(const [id,code,role] of [["admin","RULEADMIN","ADMIN"],["p","PANKAJ","EMPLOYEE"],["g","GOKUL","EMPLOYEE"],["t","TOKI","EMPLOYEE"]]) await db.user.create({data:{id,employeeCode:code,name:code,role,passwordHash,active:true,approved:true,mustChangePassword:false,faceDescriptor:JSON.stringify(photo.descriptor),createdAt:new Date("2026-09-01T00:00:00Z"),...(plans.has(code)?{masterScheduleFrom:"2026-09-26",masterScheduleJson:plans.get(code)}:{})}});
  server = spawn(
    process.execPath,
    [
      "--require",
      preload,
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3107",
    ],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  process.once("SIGINT", () => {
    server.kill("SIGTERM");
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    server.kill("SIGTERM");
    process.exit(0);
  });
  server.stdout.on("data", (b) => (logs += b));
  server.stderr.on("data", (b) => (logs += b));
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(base);
      if (r.ok) break;
    } catch {}
    if (i === 59) throw Error("Test server did not start: " + logs);
    await new Promise((r) => setTimeout(r, 250));
  }
  const login = async (employeeCode) => {
    const res = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeCode,
        password: "Test-only-work-rules-123",
      }),
    });
    assert.equal(res.status, 200);
    return res.headers.get("set-cookie").split(";")[0];
  };
  await setTime("2026-10-01T10:15:00+05:30");
  const admin=await login("RULEADMIN"),p=await login("PANKAJ"),g=await login("GOKUL"),t=await login("TOKI");
  await db.managerMeeting.create({data:{userId:"p",kind:"LATE",triggerDate:"2026-09-25",status:"PENDING"}});
  const shift=async(cookie,day,start,end)=>{
    await setTime(`${day}T${start}:00+05:30`);
    const rec=(await ok(cookie,"/api/attendance/clock-in","POST",photo)).record;
    assert.equal(rec.policyVersion,3);
    await setTime(`${day}T${end}:00+05:30`);
    return (await ok(cookie,"/api/attendance/clock-out","POST",photo)).record;
  };
  const full=await shift(p,"2026-10-01","10:15","22:30");
  assert.equal(full.scheduledEndAt,new Date("2026-10-01T22:30:00+05:30").toISOString());
  const stat=async(id,day)=>(await ok(admin,`/api/admin/stats?from=${day}&to=${day}`)).stats.find(r=>r.userId===id);
  assert.equal((await stat("p","2026-10-01")).regularPayRs,1000);
  await shift(g,"2026-10-01","10:00","16:00");
  assert.equal((await stat("g","2026-10-01")).regularPayRs,500);
  for(const day of ["02","03","04","06","07"]) {
    await shift(p,`2026-10-${day}`,"10:30","22:30");
    assert.equal((await stat("p",`2026-10-${day}`)).regularPayRs,980);
    const perf=await ok(admin,"/api/team/performance?month=2026-10");
    const person=perf.employees.find(e=>e.id==="p");
    if(day==="04") {assert.equal(person.lateDays,3);assert.equal(person.lateWarning,true);assert.equal(person.awardEligible,true);}
    if(day==="07") {assert.equal(person.lateDays,5);assert.equal(person.awardEligible,false);}
    assert.equal(perf.meetings.length,0);
    assert.ok(!perf.entries.some(e=>e.userId==="p"&&e.points<0));
  }
  const tracking=await ok(admin,"/api/team/attendance-tracking?from=2026-10-07&to=2026-10-07");
  const row=tracking.rows.find(r=>r.userId==="p");assert.equal(row.lateMinutes,15);assert.equal(row.lateIncident,true);assert.equal(row.lateTalk,"NONE");
  await setTime("2026-10-06T13:30:00+05:30");
  assert.equal((await request(t,"/api/attendance/clock-in","POST",photo)).status,403);
  await db.attendanceRecord.create({data:{userId:"g",workDate:"2026-09-30",policyVersion:3,clockInAt:new Date("2026-09-30T10:00:00+05:30"),clockOutAt:new Date("2026-10-01T07:00:00+05:30"),scheduledStartAt:new Date("2026-09-30T10:00:00+05:30"),scheduledEndAt:new Date("2026-09-30T22:00:00+05:30"),shiftDurationMinutes:720,unpaidBreakMinutes:120,approvalStatus:"APPROVED"}});
  await shift(g,"2026-10-02","10:00","22:36");
  const bonuses=await ok(admin,"/api/team/performance?month=2026-10");
  assert.equal(bonuses.entries.find(e=>e.userId==="g"&&e.kind==="Bonus working days").points,1);
  await setTime("2026-11-01T13:30:00+05:30");
  const fresh=await login("RULEADMIN");
  const next=await ok(fresh,"/api/team/performance?month=2026-11");
  assert.equal(next.employees.find(e=>e.id==="p").lateDays,0);
  assert.equal(next.employees.find(e=>e.id==="p").awardEligible,true);
  console.log("PASS: real clock-in/out, fixed finish, paid grace, ten-hour salary, proportional short-shift pay, retired meeting gate, 3/5 late thresholds, monthly reset and Toki off-days.");
} catch(e) { console.error(logs.slice(-3000));throw e; } finally {if(server)server.kill("SIGTERM");await db.$disconnect();}
