import test from "node:test";
import assert from "node:assert/strict";
import type { User, ScheduledShift } from "@prisma/client";
import { prisma } from "./prisma";
import { arrivalSmsDue, attendanceSmsBody, attendanceSmsConfig, dispatchAttendanceSms, eligibleForArrivalSms } from "./attendanceSms";
import { employeeLoginDestination } from "./loginDestination";
const at = (time: string) => new Date(`2026-10-02T${time}:00+05:30`);

test("SMS starts after 15 minutes, stops at shift end, and links survive sign-in safely", () => {
  assert.equal(arrivalSmsDue(at("10:14"), at("10:00"), at("22:00")), false);
  assert.equal(arrivalSmsDue(at("10:15"), at("10:00"), at("22:00")), true);
  assert.equal(arrivalSmsDue(at("22:00"), at("10:00"), at("22:00")), false);
  assert.equal(arrivalSmsDue(at("13:00"), at("13:00"), at("22:00")), false);
  assert.equal(arrivalSmsDue(at("13:15"), null, null), false);
  const body = attendanceSmsBody("https://example.test");
  for (const kind of ["LEAVE", "LATE_ARRIVAL"]) {
    const path = `/employee/team?view=requests&kind=${kind}`;
    assert.ok(body.includes(`https://example.test${path}`));
    assert.equal(employeeLoginDestination(path), path);
  }
  for (const path of ["//evil.test/employee", "https://evil.test/employee", "/admin", "javascript:alert(1)", "http://[", "/employee-fake", "/employee/../../admin"]) {
    assert.equal(employeeLoginDestination(path), "/employee");
  }
});

test("eligibility, daily claim, recheck and uncertain-send handling with no live SMS", async t => {
  const saved = { ...process.env };
  Object.assign(process.env, { ATTENDANCE_SMS_ENABLED: "true", ATTENDANCE_SMS_BASE_URL: "https://example.test",
    TWILIO_ACCOUNT_SID: `AC${"0".repeat(32)}`, TWILIO_AUTH_TOKEN: "test", TWILIO_SMS_FROM: "+12232176231", TWILIO_MESSAGING_SERVICE_SID: "" });
  const old = { users: prisma.user.findMany, user: prisma.user.findUnique, record: prisma.attendanceRecord.findUnique,
    arrival: prisma.arrivalAttempt.findUnique, request: prisma.staffRequest.findFirst, shift: prisma.scheduledShift.findUnique,
    create: prisma.attendanceSms.create, update: prisma.attendanceSms.update };
  t.after(() => {
    prisma.user.findMany = old.users; prisma.user.findUnique = old.user; prisma.attendanceRecord.findUnique = old.record;
    prisma.arrivalAttempt.findUnique = old.arrival; prisma.staffRequest.findFirst = old.request; prisma.scheduledShift.findUnique = old.shift;
    prisma.attendanceSms.create = old.create; prisma.attendanceSms.update = old.update;
    for (const key of ["ATTENDANCE_SMS_ENABLED", "ATTENDANCE_SMS_BASE_URL", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_SMS_FROM", "TWILIO_MESSAGING_SERVICE_SID"]) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  });
  let user = { id: "sms-user", role: "EMPLOYEE", active: true, approved: true, mustChangePassword: false,
    createdAt: new Date("2026-09-01"), attendancePolicyFrom: "2026-09-01", attendanceLatestMinute: 600,
    attendanceStartMinute: 600, attendanceEndMinute: 1320, weeklyScheduleJson: null, phone: "9876543210" } as User;
  let recorded = false, arrived = false, requested = false, shift: ScheduledShift | null = null;
  prisma.user.findMany = (async () => [user]) as typeof old.users;
  prisma.user.findUnique = (async () => user) as unknown as typeof old.user;
  prisma.attendanceRecord.findUnique = (async () => recorded ? { clockInAt: at("10:00") } : null) as unknown as typeof old.record;
  prisma.arrivalAttempt.findUnique = (async () => arrived ? { id: "arrival" } : null) as unknown as typeof old.arrival;
  prisma.staffRequest.findFirst = (async args => {
    assert.deepEqual(args?.where?.kind, { in: ["LEAVE", "LATE_ARRIVAL", "GPS_CLOCK_IN"] });
    return requested ? { id: "request" } : null;
  }) as typeof old.request;
  prisma.scheduledShift.findUnique = (async () => shift) as unknown as typeof old.shift;
  assert.equal(await eligibleForArrivalSms(user, at("10:14")), false);
  assert.equal(await eligibleForArrivalSms(user, at("10:15")), true);
  for (const patch of [{ active: false }, { approved: false }, { mustChangePassword: true }, { role: "ADMIN" }]) {
    assert.equal(await eligibleForArrivalSms({ ...user, ...patch }, at("10:15")), false);
  }
  assert.equal(await eligibleForArrivalSms(user, new Date("2026-10-05T10:15:00+05:30")), false);
  assert.equal(await eligibleForArrivalSms({ ...user, weeklyScheduleJson: '{"0":{"start":600,"latest":600,"duration":540,"unpaidBreak":0}}' }, at("10:15")), false);
  recorded = true; assert.equal(await eligibleForArrivalSms(user, at("10:15")), false); recorded = false;
  arrived = true; assert.equal(await eligibleForArrivalSms(user, at("10:15")), false); arrived = false;
  requested = true; assert.equal(await eligibleForArrivalSms(user, at("10:15")), false); requested = false;
  shift = { startsAt: at("13:00"), endsAt: at("22:00") } as ScheduledShift;
  assert.equal(await eligibleForArrivalSms(user, at("10:15")), false);
  assert.equal(await eligibleForArrivalSms(user, at("13:15")), true); shift = null;
  const claims = new Set<string>(); let sends = 0, status = "", clockInOnClaim = false;
  prisma.attendanceSms.create = (async args => {
    const key = `${args.data.userId}:${args.data.workDate}`;
    if (claims.has(key)) throw { code: "P2002" };
    claims.add(key); if (clockInOnClaim) recorded = true;
    return { id: key };
  }) as typeof old.create;
  prisma.attendanceSms.update = (async args => { status = String(args.data.status); return {}; }) as typeof old.update;
  const send = async (options: { to: string }) => { assert.equal(options.to, "+919876543210"); sends++; return { sid: "SMtest" }; };
  await Promise.all([dispatchAttendanceSms(at("10:15"), send), dispatchAttendanceSms(at("10:15"), send)]);
  await dispatchAttendanceSms(at("12:00"), send);
  assert.equal(sends, 1); assert.equal(status, "ACCEPTED");
  claims.clear(); clockInOnClaim = true;
  await dispatchAttendanceSms(at("10:15"), send); assert.equal(sends, 1); assert.equal(status, "SKIPPED");
  clockInOnClaim = false; recorded = false; claims.clear(); user = { ...user, phone: "invalid" };
  await dispatchAttendanceSms(at("10:15"), send); assert.equal(status, "INVALID_NUMBER"); assert.equal(sends, 1);
  user = { ...user, phone: "9876543210" }; claims.clear();
  const fail = async () => { sends++; throw new Error("timeout"); };
  await dispatchAttendanceSms(at("10:15"), fail); await dispatchAttendanceSms(at("10:16"), fail);
  assert.equal(status, "SEND_FAILED_OR_UNKNOWN"); assert.equal(sends, 2);
  process.env.ATTENDANCE_SMS_ENABLED = "false"; assert.equal(attendanceSmsConfig(), null);
  claims.clear(); await dispatchAttendanceSms(at("10:15"), send); assert.equal(sends, 2);
  process.env.ATTENDANCE_SMS_ENABLED = "true"; process.env.TWILIO_SMS_FROM = "";
  assert.equal(attendanceSmsConfig(), null);
  process.env.TWILIO_MESSAGING_SERVICE_SID = `VA${"0".repeat(32)}`; assert.equal(attendanceSmsConfig(), null);
  process.env.TWILIO_MESSAGING_SERVICE_SID = `MG${"0".repeat(32)}`; assert.ok(attendanceSmsConfig());
});
