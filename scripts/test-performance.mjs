// Disposable database and test-only process clock; production has no clock override.
// Run after npm run build: node scripts/test-performance.mjs
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, readdir } from "node:fs/promises";
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
    h = await login("HINGNAMBE NEWME"),
    other = await login("OTHER");

  const angai = await login("ANGAI"),
    chetan = await login("RCHETAN");
  const at = (day, time) => `${day}T${time}:00+05:30`;
  const approve = async (id) =>
    ok(admin, `/api/admin/attendance/${id}`, "PATCH", {
      approvalStatus: "APPROVED",
    });
  const shift = async (cookie, day, start, end) => {
    await setTime(at(day, start));
    const rec = (await ok(cookie, "/api/attendance/clock-in", "POST", photo))
      .record;
    await setTime(at(day, end));
    const out = (await ok(cookie, "/api/attendance/clock-out", "POST", photo))
      .record;
    await approve(rec.id);
    return out;
  };
  // Three consecutive working days: Monday is skipped. Separate early and late patterns.
  for (const day of ["2026-09-19", "2026-09-20", "2026-09-22"]) {
    await shift(angai, day, "13:20", "22:30");
    await shift(chetan, day, "13:00", "22:00");
  }
  await setTime(at("2026-09-23", "13:00"));
  let blocked = await request(angai, "/api/attendance/clock-in", "POST", photo);
  assert.equal(blocked.data.code, "MEETING_REQUIRED");
  assert.equal(
    await db.attendanceRecord.count({
      where: { userId: additional[0][0], workDate: "2026-09-23" },
    }),
    0,
  );
  assert.equal(
    (await request(chetan, "/api/attendance/clock-in", "POST", photo)).data
      .code,
    "MEETING_REQUIRED",
  );
  let perf = await ok(admin, "/api/team/performance?month=2026-09");
  const late = perf.meetings.find(
    (m) => m.userId === additional[0][0] && m.status === "PENDING",
  );
  const early = perf.meetings.find(
    (m) => m.userId === additional[1][0] && m.status === "PENDING",
  );
  assert.equal(late.kind, "LATE");
  assert.equal(early.kind, "EARLY");
  assert.equal(
    (
      await request(angai, "/api/team/performance", "PATCH", {
        action: "CLEAR_MEETING",
        id: late.id,
        note: "Self approve",
      })
    ).status,
    403,
  );
  await ok(angai, "/api/team/performance", "POST", {
    action: "PROPOSE_ARRIVAL",
    proposedAt: at("2026-09-23", "12:55"),
    reason: "Arrived before the clock-in attempt; manager saw me",
  });
  await setTime(at("2026-09-23", "13:45"));
  const arrivalPhotoCount = (await readdir(path.join(dir, "uploads", additional[0][0]))).length;
  // Repeated attempts preserve the earliest server-verified arrival.
  await request(angai, "/api/attendance/clock-in", "POST", photo);
  assert.equal((await readdir(path.join(dir, "uploads", additional[0][0]))).length, arrivalPhotoCount);
  assert.equal(
    (
      await db.arrivalAttempt.findUnique({
        where: {
          userId_workDate: { userId: additional[0][0], workDate: "2026-09-23" },
        },
      })
    ).arrivedAt.toISOString(),
    new Date(at("2026-09-23", "13:00")).toISOString(),
  );
  await ok(admin, "/api/team/performance", "PATCH", {
    action: "CLEAR_MEETING",
    id: late.id,
    note: "Discussed punctuality and verified arrival",
    useProposed: true,
  });
  await ok(admin, "/api/team/performance", "PATCH", {
    action: "CLEAR_MEETING",
    id: early.id,
    note: "Discussed early departures",
  });
  const meetingDay = (
    await ok(angai, "/api/attendance/clock-in", "POST", photo)
  ).record;
  assert.equal(
    meetingDay.clockInAt,
    new Date(at("2026-09-23", "12:55")).toISOString(),
  );
  assert.equal(meetingDay.latePenaltyActive, false);
  const earlyDay = (await ok(chetan, "/api/attendance/clock-in", "POST", photo))
    .record;
  assert.equal(
    earlyDay.clockInAt,
    new Date(at("2026-09-23", "13:00")).toISOString(),
  );
  await setTime(at("2026-09-23", "22:30"));
  await ok(angai, "/api/attendance/clock-out", "POST", photo);
  await approve(meetingDay.id);
  await ok(chetan, "/api/attendance/clock-out", "POST", photo);
  await approve(earlyDay.id);
  const lateAgain = await shift(angai, "2026-09-24", "13:10", "22:30");
  const earlyAgain = await shift(chetan, "2026-09-24", "13:00", "22:20");
  assert.equal(lateAgain.latePenaltyActive, true);
  assert.equal(earlyAgain.earlyPenaltyActive, true);
  let stats = (
    await ok(admin, "/api/admin/stats?from=2026-09-24&to=2026-09-24")
  ).stats;
  for (const id of [additional[0][0], additional[1][0]])
    assert.equal(stats.find((x) => x.userId === id).regularPayRs, 883.33);
  perf = await ok(angai, "/api/team/performance?month=2026-09");
  assert.equal(perf.employees.length, 1);
  assert.ok(perf.entries.every((e) => e.userId === additional[0][0]));
  assert.equal(
    perf.entries
      .filter((e) => e.date === "2026-09-24")
      .reduce((sum, e) => sum + e.points, 0),
    -1.5,
  );
  await approve(lateAgain.id); // idempotent approval
  assert.equal(
    (await ok(angai, "/api/team/performance?month=2026-09")).entries.filter(
      (e) => e.date === "2026-09-24",
    ).length,
    1,
  );
  // New scheduled shifts become authoritative only after admin approval.
  await setTime(at("2026-09-25", "10:00"));
  const change = (
    await ok(angai, "/api/team/requests", "POST", {
      kind: "SHIFT_CHANGE",
      fromDate: "2026-09-25",
      proposedIn: at("2026-09-25", "14:00"),
      proposedOut: at("2026-09-25", "23:30"),
      reason: "Appointment before work",
    })
  ).request;
  assert.equal(
    (await ok(angai, "/api/attendance/today")).schedule.latest,
    "1:00 pm",
  );
  assert.equal(
    (
      await request(angai, `/api/team/requests/${change.id}`, "PATCH", {
        status: "APPROVED",
      })
    ).status,
    403,
  );
  await ok(admin, `/api/team/requests/${change.id}`, "PATCH", {
    status: "APPROVED",
  });
  assert.match(
    (await ok(angai, "/api/attendance/today")).schedule.latest,
    /2:00/,
  );
  const changed = await shift(angai, "2026-09-25", "14:00", "23:30");
  assert.equal(
    changed.scheduledStartAt,
    new Date(at("2026-09-25", "14:00")).toISOString(),
  );
  assert.equal(
    (
      await request(admin, "/api/team/schedule", "POST", {
        userId: additional[0][0],
        workDate: "2026-09-25",
        startsAt: at("2026-09-25", "15:00"),
        endsAt: at("2026-09-25", "23:30"),
      })
    ).status,
    409,
  );
  stats = (await ok(admin, "/api/admin/stats?from=2026-09-25&to=2026-09-25"))
    .stats;
  assert.equal(
    stats.find((x) => x.userId === additional[0][0]).regularPayRs,
    900,
  );
  assert.equal(
    stats.find((x) => x.userId === additional[0][0]).overtimeHours,
    0,
  );
  // Actual 10.5-hour threshold is independent from scheduled closing and pay top-ups.
  await setTime(at("2026-09-26", "09:30"));
  const extra = (await ok(g, "/api/attendance/clock-in", "POST", photo)).record;
  assert.equal(
    extra.extraTimeCutoff,
    new Date(at("2026-09-26", "21:00")).toISOString(),
  );
  await setTime(at("2026-09-26", "21:01"));
  assert.equal(
    (await request(g, "/api/attendance/clock-out", "POST", photo)).data.code,
    "EXTRA_TIME_REASON_REQUIRED",
  );
  await setTime(at("2026-09-26", "22:30"));
  await ok(g, "/api/attendance/clock-out", "POST", {
    ...photo,
    extraTimeReason: "Closing tables and cleaning",
  });
  assert.equal(
    (
      await request(admin, `/api/admin/attendance/${extra.id}`, "PATCH", {
        approvalStatus: "APPROVED",
      })
    ).status,
    409,
  );
  const extraReq = await db.staffRequest.findFirst({
    where: {
      expectedRecordId: extra.id,
      kind: "EXTRA_TIME",
      status: "PENDING",
    },
  });
  await ok(admin, `/api/team/requests/${extraReq.id}`, "PATCH", {
    status: "APPROVED",
  });
  await approve(extra.id);
  const extraPoints = (await ok(g, "/api/team/performance?month=2026-09"))
    .entries;
  assert.equal(
    extraPoints.reduce((sum, e) => sum + e.points, 0),
    1.5,
  );
  // Bill and party deduplication, approval authority, reversal and immutable audit.
  const claim = {
    action: "REFERRAL",
    billDate: "2026-09-26",
    billNumber: "B-123",
    partyReference: "PARTY-A",
    reason: "Invited my friends; paid full bill",
  };
  await ok(g, "/api/team/performance", "POST", claim);
  assert.equal(
    (await request(other, "/api/team/performance", "POST", claim)).status,
    409,
  );
  let referral = await db.referralClaim.findFirst({
    where: { billNumber: "B-123" },
  });
  const review = {
    action: "REVIEW_REFERRAL",
    id: referral.id,
    status: "APPROVED",
    note: "Verified paid bill and first referral",
    verified: true,
    partyReference: "PARTY-A",
  };
  assert.equal(
    (await request(g, "/api/team/performance", "PATCH", review)).status,
    403,
  );
  assert.equal(
    (
      await request(admin, "/api/team/performance", "PATCH", {
        ...review,
        verified: false,
      })
    ).status,
    400,
  );
  await ok(admin, "/api/team/performance", "PATCH", review);
  assert.equal(
    (await ok(g, "/api/team/performance?month=2026-09")).employees[0].points,
    4.5,
  );
  assert.equal(
    (await request(admin, "/api/team/performance", "PATCH", review)).status,
    409,
  );
  await ok(other, "/api/team/performance", "POST", {
    ...claim,
    billNumber: "B-124",
  });
  const split = await db.referralClaim.findFirst({
    where: { billNumber: "B-124" },
  });
  assert.equal(
    (
      await request(admin, "/api/team/performance", "PATCH", {
        ...review,
        id: split.id,
      })
    ).status,
    409,
  );
  await ok(admin, "/api/team/performance", "PATCH", {
    ...review,
    status: "REVOKED",
    note: "Bill fully refunded",
  });
  assert.equal(
    (await ok(g, "/api/team/performance?month=2026-09")).employees[0].points,
    1.5,
  );
  assert.equal(
    await db.policyAudit.count({ where: { entityId: referral.id } }),
    3,
  );
  // Corrections remove false streaks; rejected days cannot keep a manager gate alive.
  for (const day of ["2026-09-19", "2026-09-20", "2026-09-22"])
    await db.attendanceRecord.create({
      data: {
        userId: "n",
        workDate: day,
        policyVersion: 1,
        scheduledStartAt: new Date(at(day, "10:30")),
        scheduledEndAt: new Date(at(day, "22:30")),
        clockInAt: new Date(at(day, "10:50")),
        clockOutAt: new Date(at(day, "22:30")),
        unpaidBreakMinutes: 60,
        approvalStatus: "APPROVED",
      },
    });
  await ok(admin, "/api/team/performance?month=2026-09");
  const falseFlag = await db.managerMeeting.findFirst({
    where: { userId: "n", status: "PENDING" },
  });
  assert.ok(falseFlag);
  const badRecord = await db.attendanceRecord.findUnique({
    where: { userId_workDate: { userId: "n", workDate: "2026-09-22" } },
  });
  await ok(admin, `/api/admin/attendance/${badRecord.id}`, "PATCH", {
    approvalStatus: "REJECTED",
  });
  await ok(admin, "/api/team/performance?month=2026-09");
  assert.equal(
    (await db.managerMeeting.findUnique({ where: { id: falseFlag.id } }))
      .status,
    "CANCELLED",
  );
  const correction = (
    await ok(n, "/api/team/requests", "POST", {
      kind: "CORRECTION",
      fromDate: "2026-09-22",
      proposedIn: at("2026-09-22", "10:30"),
      proposedOut: at("2026-09-22", "22:30"),
      reason: "Manager verified that the late timestamp was incorrect",
    })
  ).request;
  await ok(admin, `/api/team/requests/${correction.id}`, "PATCH", {
    status: "APPROVED",
  });
  const corrected = await db.attendanceRecord.findUnique({
    where: { id: badRecord.id },
  });
  assert.equal(
    corrected.scheduledEndAt.toISOString(),
    badRecord.scheduledEndAt.toISOString(),
  );
  assert.equal(corrected.approvalStatus, "PENDING");
  assert.equal(corrected.extraTimeStatus, "PENDING");
  assert.equal(
    (await db.managerMeeting.findUnique({ where: { id: falseFlag.id } }))
      .status,
    "CANCELLED",
  );

  // Unresolved meetings cross a month boundary; post-meeting deductions reset monthly.
  for (const day of ["2026-09-27", "2026-09-29", "2026-09-30"])
    await db.attendanceRecord.create({
      data: {
        userId: "h",
        workDate: day,
        policyVersion: 1,
        scheduledStartAt: new Date(at(day, "10:30")),
        scheduledEndAt: new Date(at(day, "22:30")),
        clockInAt: new Date(at(day, "10:50")),
        clockOutAt: new Date(at(day, "22:30")),
        unpaidBreakMinutes: 60,
        approvalStatus: "APPROVED",
      },
    });
  await setTime(at("2026-10-01", "10:30"));
  assert.equal(
    (await request(h, "/api/attendance/clock-in", "POST", photo)).data.code,
    "MEETING_REQUIRED",
  );
  const reset = await shift(angai, "2026-10-01", "13:10", "22:30");
  assert.equal(reset.latePenaltyActive, false);
  assert.equal(
    (
      await ok(admin, "/api/admin/stats?from=2026-10-01&to=2026-10-01")
    ).stats.find((x) => x.userId === additional[0][0]).regularPayRs,
    900,
  );
  // Admin can see monthly points by employee names; employees cannot read the roster endpoint.
  assert.ok(
    (await ok(admin, "/api/admin/employees")).employees.every(
      (e) => typeof e.points === "number",
    ),
  );
  assert.equal((await request(g, "/api/admin/employees")).status, 403);

  // Manual administrator recovery from a login/location failure.
  const dinjana = await login("DINJANA");
  const manualPath = "/api/admin/attendance/manual";
  const targetId = additional[2][0];
  const manual = {userId: targetId, workDate: "2026-10-01", clockInAt: at("2026-10-01","11:30"), clockOutAt: null, reason: "Phone location failed; manager verified actual arrival", expectedRecordId: null, expectedUpdatedAt: null};
  assert.equal((await request(dinjana,manualPath,"POST",manual)).status,403);
  assert.equal((await request(dinjana,`${manualPath}?userId=${targetId}&workDate=2026-10-01`)).status,403);
  assert.equal((await request(admin,manualPath,"POST",{...manual,reason:""})).status,400);
  assert.equal((await request(admin,manualPath,"POST",{...manual,clockInAt:at("2026-10-02","11:30")})).status,400);
  const entered = (await ok(admin,manualPath,"POST",manual)).record;
  assert.equal(entered.clockInPhoto,null);assert.equal(entered.clockInFaceMatch,null);
  assert.equal((await ok(dinjana,"/api/attendance/today")).record.id,entered.id);
  assert.equal((await request(admin,manualPath,"POST",manual)).status,409);
  const close = {...manual,expectedRecordId:entered.id,expectedUpdatedAt:entered.updatedAt,clockOutAt:at("2026-10-01","20:30")};
  const completed = (await ok(admin,manualPath,"POST",close)).record;
  assert.equal(completed.approvalStatus,"PENDING");assert.equal(completed.unpaidBreakMinutes,60);
  await approve(completed.id);
  assert.equal((await ok(admin,"/api/admin/stats?from=2026-10-01&to=2026-10-01")).stats.find(x=>x.userId===targetId).regularPayRs,900);
  assert.equal((await request(admin,manualPath,"POST",close)).status,409);
  const current=(await ok(admin,`${manualPath}?userId=${targetId}&workDate=2026-10-01`)).record;
  const overtime=(await ok(admin,manualPath,"POST",{...close,expectedUpdatedAt:current.updatedAt,clockOutAt:at("2026-10-01","21:00"),reason:"Correct leaving time; stayed to finish serving a table"})).record;
  assert.equal(overtime.extraTimeStatus,"PENDING");assert.equal(overtime.approvalStatus,"PENDING");
  assert.equal((await request(admin,`/api/admin/attendance/${overtime.id}`,"PATCH",{approvalStatus:"APPROVED"})).status,409);
  const audit = await db.attendanceAudit.findMany({where:{recordId:entered.id,action:{in:["ADMIN_TIME_ENTRY","ADMIN_TIME_CORRECTION"]}}});
  assert.equal(audit.length,3);assert.ok(audit.every(a=>JSON.parse(a.afterJson).correctionReason));
  assert.equal(await db.notification.count({where:{userId:targetId,kind:"ATTENDANCE_CORRECTED"}}),3);
  // A pending manager meeting requires explicit admin confirmation during manual recovery.
  const held = {...manual,userId:"h",clockInAt:at("2026-10-01","10:30"),reason:"Location issue resolved manually; manager discussed punctuality"};
  assert.equal((await request(admin,manualPath,"POST",held)).status,409);
  await ok(admin,manualPath,"POST",{...held,managerMeetingCompleted:true});
  assert.equal(await db.managerMeeting.count({where:{userId:"h",status:"PENDING"}}),0);
  console.log("PASS: admin-only manual arrival/correction, required reason, future-time rejection, normal employee shift visibility, stale-edit guard, payroll reset, overtime review, meeting confirmation, notification and audit.");
  console.log(
    "PASS: full-shift pay, late/early streaks, Monday skip, manager authority, arrival protection, monthly reset, pending rollover, exact deductions, temporary shifts, actual overtime, approval idempotency, referral dedup/reversal, correction/rejection cleanup, audit and privacy.",
  );
  console.log("Disposable test files:", dir);
  if (process.env.KEEP_TEST_SERVER === "1") {
    console.log("Test server retained for browser checks at " + base);
    await new Promise(() => {});
  }
} catch (e) {
  console.error(logs.slice(-5000));
  throw e;
} finally {
  if (server) server.kill("SIGTERM");
  await db.$disconnect();
}
