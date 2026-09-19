import test from "node:test";
import assert from "node:assert/strict";
import type { User, AttendanceRecord, ScheduledShift } from "@prisma/client";
import { prisma } from "./prisma";
import webpush from "web-push";

test("server respects account eligibility, Monday, leave and shift overrides; dispatch is deduplicated and stops after clock-in",async t=>{
  const savedEnv={...process.env};
  process.env.JWT_SECRET="isolated-reminder-test";
  process.env.VAPID_PUBLIC_KEY="test";process.env.VAPID_PRIVATE_KEY="test";process.env.VAPID_SUBJECT="mailto:test@example.test";
  const {reminderForUser,dispatchAttendanceReminders}=await import("./attendanceReminderServer");
  const old={users:prisma.user.findMany,open:prisma.attendanceRecord.findFirst,record:prisma.attendanceRecord.findUnique,
    shifts:prisma.scheduledShift.findUnique,leave:prisma.staffRequest.findFirst,arrival:prisma.arrivalAttempt.findUnique,
    create:prisma.notification.create,subscriptions:prisma.pushSubscription.findMany,send:webpush.sendNotification};
  t.after(()=>{
    prisma.user.findMany=old.users;prisma.attendanceRecord.findFirst=old.open;prisma.attendanceRecord.findUnique=old.record;
    prisma.scheduledShift.findUnique=old.shifts;prisma.staffRequest.findFirst=old.leave;prisma.arrivalAttempt.findUnique=old.arrival;
    prisma.notification.create=old.create;prisma.pushSubscription.findMany=old.subscriptions;webpush.sendNotification=old.send;
    for(const k of ["JWT_SECRET","VAPID_PUBLIC_KEY","VAPID_PRIVATE_KEY","VAPID_SUBJECT"]) {if(savedEnv[k]===undefined)delete process.env[k];else process.env[k]=savedEnv[k];}
  });
  const now=new Date("2026-09-19T10:30:00+05:30");
  const user={id:"employee",role:"EMPLOYEE",active:true,approved:true,mustChangePassword:false,createdAt:new Date("2026-09-01"),attendancePolicyFrom:"2026-09-01",attendanceStartMinute:570,attendanceLatestMinute:630,attendanceEndMinute:1350,weeklyScheduleJson:null} as User;
  let record:AttendanceRecord|null=null,leave=false,arrived=false,override:ScheduledShift|null=null;
  prisma.user.findMany=(async()=>[user]) as typeof old.users;
  prisma.attendanceRecord.findFirst=(async()=>null) as typeof old.open;
  prisma.attendanceRecord.findUnique=(async()=>record) as unknown as typeof old.record;
  prisma.scheduledShift.findUnique=(async()=>override) as unknown as typeof old.shifts;
  prisma.staffRequest.findFirst=(async()=>leave ? {id:"leave"} : null) as typeof old.leave;
  prisma.arrivalAttempt.findUnique=(async()=>arrived ? {id:"arrival"} : null) as unknown as typeof old.arrival;
  assert.equal((await reminderForUser(user,now))?.kind,"ATTENDANCE_IN");
  for(const patch of [{active:false},{approved:false},{mustChangePassword:true},{role:"ADMIN"}]) assert.equal(await reminderForUser({...user,...patch},now),null);
  assert.equal(await reminderForUser(user,new Date("2026-09-21T10:30:00+05:30")),null);
  leave=true;assert.equal(await reminderForUser(user,now),null);leave=false;
  arrived=true;assert.equal(await reminderForUser(user,now),null);arrived=false;
  override={startsAt:new Date("2026-09-19T13:00:00+05:30")} as ScheduledShift;
  assert.equal(await reminderForUser(user,now),null);override=null;
  assert.equal(await reminderForUser({...user,weeklyScheduleJson:'{"0":{"start":660,"latest":660,"duration":540,"unpaidBreak":0}}'},now),null);
  const claims=new Set<string>();let pushes=0;
  prisma.notification.create=(async(args:unknown)=>{const key=(args as {data:{entityKey:string}}).data.entityKey;if(claims.has(key))throw {code:"P2002"};claims.add(key);return {};}) as typeof old.create;
  prisma.pushSubscription.findMany=(async()=>[{id:"sub",endpoint:"https://fcm.googleapis.com/test",auth:"test",p256dh:"test"}]) as typeof old.subscriptions;
  webpush.sendNotification=(async(_subscription,payload,options)=>{const data=JSON.parse(String(payload));assert.equal(data.kind,"ATTENDANCE_IN");assert.equal(data.url,"/employee");assert.equal(options?.TTL,60);assert.equal(options?.urgency,"high");pushes++;return {statusCode:201,body:"",headers:{}};}) as typeof old.send;
  await Promise.all([dispatchAttendanceReminders(now),dispatchAttendanceReminders(now)]);
  assert.equal(pushes,1);assert.equal(claims.size,1);
  record={clockInAt:now} as AttendanceRecord;
  await dispatchAttendanceReminders(new Date(+now+5*60000));assert.equal(pushes,1);
});
