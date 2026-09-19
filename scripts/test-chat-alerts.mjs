// Disposable database and test-only process clock; production has no clock override.
// Run after npm run build: node scripts/test-performance.mjs
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const dir = await mkdtemp(path.join(tmpdir(), "mc-performance-"));
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
  ...process.env,
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
const base = "http://127.0.0.1:3104";
const additional = [
  ["cmu5ag8ce000395shnlmls7ln", "ANGAI", "13:00", "22:30", 8.5],
  ["cmu5adpin000295shn82n6p47", "RCHETAN", "13:00", "22:30", 8.5],
  ["cmu5cokep000495shpehjvqai", "DINJANA", "11:30", "20:30", 8],
  ["cmu5ctlgj000795sh8a4rawn1", "JOYSHREE CHANU", "10:00", "19:00", 8],
  ["cmu5abali000095sh62r5yttk", "SAGAR12/12/25", "13:00", "22:30", 8.5],
  ["cmu5acmqw000195sht77e1cok", "VICKY", "12:30", "22:30", 9],
];
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
  const passwordHash = await bcrypt.hash("Test-only-work-rules-123", 4);
  for (const [id, code, name, role] of [
    ["admin", "RULEADMIN", "Test Admin", "ADMIN"],
    ["g", "GOKUL", "Test Gokul", "EMPLOYEE"],
    ["r", "RONYAMZ", "Test Robinson", "EMPLOYEE"],
    ["n", "NIJULI", "Test Nijuli", "EMPLOYEE"],
    ["h", "HINGNAMBE NEWME", "Test Hignam", "EMPLOYEE"],
    ["other", "OTHER", "Test Other", "EMPLOYEE"],
  ]) {
    await db.user.create({
      data: {
        id,
        employeeCode: code,
        name,
        role,
        passwordHash,
        active: true,
        approved: true,
        mustChangePassword: false,
        faceDescriptor: JSON.stringify(photo.descriptor),
        createdAt: new Date("2026-09-01T00:00:00Z"),
      },
    });
  }
  // Verify the exact migration rollout selector, including exclusion of others.
  const sql = await readFile(
    "prisma/migrations/20260919120000_work_rules/migration.sql",
    "utf8",
  );
  await db.$executeRawUnsafe(sql.slice(sql.indexOf('UPDATE "User"')));
  assert.equal(
    await db.user.count({ where: { attendancePolicyFrom: "2026-09-19" } }),
    4,
  );
  assert.equal(
    (await db.user.findUnique({ where: { id: "other" } })).attendancePolicyFrom,
    null,
  );
  for (const [id, code] of additional)
    await db.user.create({
      data: {
        id,
        employeeCode: code,
        name: `Test ${code}`,
        role: "EMPLOYEE",
        passwordHash,
        active: true,
        approved: true,
        mustChangePassword: false,
        faceDescriptor: JSON.stringify(photo.descriptor),
        createdAt: new Date("2026-09-01T00:00:00Z"),
      },
    });
  const scheduleSql = await readFile(
    "prisma/migrations/20260919130000_employee_schedules/migration.sql",
    "utf8",
  );
  for (const update of scheduleSql
    .split("\n")
    .filter((line) => line.startsWith('UPDATE "User"')))
    await db.$executeRawUnsafe(update);
  assert.equal(
    await db.user.count({ where: { attendancePolicyFrom: "2026-09-19" } }),
    10,
  );
  const departures = await readFile(
    "prisma/migrations/20260919160000_departure_deadlines/migration.sql",
    "utf8",
  );
  for (const statement of departures
    .split(";")
    .filter((x) => x.includes("UPDATE")))
    await db.$executeRawUnsafe(statement);
  assert.equal(
    (await db.user.findUnique({ where: { id: "n" } })).attendanceEndMinute,
    1140,
  );
  assert.equal(
    (await db.user.findUnique({ where: { id: "r" } })).attendanceEndMinute,
    1200,
  );

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
      "3104",
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
  const admin = await login("RULEADMIN"),
    g = await login("GOKUL"),
    n = await login("NIJULI"),
    other = await login("OTHER");

  const baseline=await ok(g,"/api/team/chat/alerts");
  assert.equal(baseline.mode,"ADMIN");assert.equal(baseline.messages.length,0);
  assert.equal((await request("","/api/team/chat/alerts")).status,403);
  assert.equal((await request(g,"/api/team/profile","PATCH",{chatSoundMode:"INVALID"})).status,400);
  await ok(other,"/api/team/profile","PATCH",{muteChat:true});
  const message=(await ok(admin,"/api/team/chat","POST",{body:"Test admin notification"})).message;
  const feed=await ok(g,`/api/team/chat/alerts?since=${encodeURIComponent(baseline.since)}`);
  assert.equal(feed.messages.length,1);assert.equal(feed.messages[0].id,message.id);assert.equal(feed.messages[0].authorRole,"ADMIN");
  assert.equal("body" in feed.messages[0],false);
  assert.equal(await db.notification.count({where:{userId:"admin",kind:"CHAT",entityKey:message.id}}),0);
  assert.equal(await db.notification.count({where:{userId:"other",kind:"CHAT",entityKey:message.id}}),0);
  assert.equal(await db.notification.count({where:{userId:"g",kind:"CHAT",entityKey:message.id}}),1);
  assert.equal((await ok(g,"/api/team/chat/alerts")).messages.length,0); // reload does not replay history
  assert.equal((await ok(g,`/api/team/chat/alerts?after=${feed.cursor}`)).messages.length,0);
  await ok(g,"/api/team/chat","PATCH",{lastSeenId:message.id});
  assert.equal((await ok(g,`/api/team/chat/alerts?since=${encodeURIComponent(baseline.since)}`)).messages.length,1); // read status doesn't race the sound feed
  await ok(g,"/api/team/profile","PATCH",{chatSoundMode:"ALL"});
  const employee=(await ok(n,"/api/team/chat","POST",{body:"Test staff notification"})).message;
  const next=await ok(g,`/api/team/chat/alerts?after=${feed.cursor}`);
  assert.equal(next.mode,"ALL");assert.equal(next.messages[0].id,employee.id);assert.equal(next.messages[0].authorRole,"EMPLOYEE");
  await ok(admin,`/api/team/chat/${employee.id}`,"DELETE");
  assert.equal((await ok(g,`/api/team/chat/alerts?after=${feed.cursor}`)).messages.length,0);
  await ok(g,"/api/team/profile","PATCH",{chatSoundMode:"OFF"});
  assert.equal((await ok(g,"/api/team/chat/alerts")).mode,"OFF");
  console.log("PASS: chat sound preferences, empty/history baselines, incremental feed, read-status independence, deleted messages, sender/mute exclusion and authentication.");
  console.log("Disposable test files:",dir);
  if(process.env.KEEP_TEST_SERVER==="1") { console.log("Browser test server retained"); await new Promise(()=>{}); }
} catch (e) {
  console.error(logs.slice(-5000));
  throw e;
} finally {
  if (server) server.kill("SIGTERM");
  await db.$disconnect();
}
