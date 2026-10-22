// Disposable database and local server only. Never connects to production.
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawn,spawnSync} from "node:child_process";
import {SignJWT} from "jose/jwt/sign";
import {hash} from "bcryptjs";
async function main(){
 const dir=mkdtempSync(join(tmpdir(),"mc-work-days-"));
 Object.assign(process.env,{DATABASE_URL:`file:${join(dir,"test.db")}`,JWT_SECRET:"isolated-day-test",UPLOADS_DIR:join(dir,"uploads"),ANNOUNCEMENT_VOICE_ENABLED:"false",ANNOUNCEMENT_SMS_ENABLED:"false",ATTENDANCE_SMS_ENABLED:"false",ATTENDANCE_REMINDERS_ENABLED:"false",AUTO_CLOCK_OUT_ENABLED:"false",RESTAURANT_LAT:"",RESTAURANT_LNG:""});
 writeFileSync(join(dir,"test.db"),"");
 const migration=spawnSync(process.execPath,["node_modules/prisma/build/index.js","migrate","deploy"],{env:process.env,encoding:"utf8"});assert.equal(migration.status,0,migration.stderr);
 const {prisma}=await import("../src/lib/prisma");
 const {effectiveSchedule}=await import("../src/lib/performanceServer");
 const {getAttendanceToday}=await import("../src/lib/employeeDashboard");
 const {todayWorkDate}=await import("../src/lib/time");
 const {checkFallbackIn}=await import("../src/lib/locationFallback");
 const {eligibleForArrivalSms}=await import("../src/lib/attendanceSms");
 const {reminderForUser}=await import("../src/lib/attendanceReminderServer");
 const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p","3198","-H","127.0.0.1"],{env:process.env,stdio:["ignore","pipe","pipe"]});
 let logs="";server.stdout.on("data",d=>logs+=d);server.stderr.on("data",d=>logs+=d);
 const cookies:Record<string,string>={};
 async function request(path:string,body?:unknown,actor="admin"){
  return fetch(`http://127.0.0.1:3198${path}`,{method:body===undefined?"GET":"POST",headers:{cookie:cookies[actor]??"","content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
 }
 async function ok(path:string,body?:unknown){const r=await request(path,body);assert.equal(r.status,200,await r.clone().text());return r.json();}
 async function change(date:string,action:string){const p=await ok(`/api/admin/work-days?date=${date}`);return ok("/api/admin/work-days",{date,action,revision:p.day?.revision??0,confirm:true});}
 async function stats(date:string){return (await ok(`/api/admin/stats?from=${date}&to=${date}`)).stats as {userId:string;salaryRs:number;offDaysPayRs:number;overtimeHours:number}[];}
 async function manual(date:string,id:string,start:string,end:string,unpaid=0){const p=await ok(`/api/admin/attendance/manual?userId=${id}&workDate=${date}`);return {userId:id,workDate:date,clockInAt:`${date}T${start}:00+05:30`,clockOutAt:`${date}T${end}:00+05:30`,unpaidBreakMinutes:unpaid,reason:"Verified actual times and break",expectedDayRevision:p.day?.revision??0,expectedRecordId:p.record?.id??null,expectedUpdatedAt:p.record?.updatedAt??null};}
 try{
  const passwordHash=await hash("DayPreview123!",10);
  for(const id of ["admin","employee","other"]){
   await prisma.user.create({data:{id,employeeCode:id.toUpperCase(),name:id==="employee"?"Test employee":id,role:id==="admin"?"ADMIN":"EMPLOYEE",passwordHash,approved:true,mustChangePassword:false,hourlyRateRs:100,createdAt:new Date("2026-10-01T00:00:00Z"),faceDescriptor:JSON.stringify(Array(128).fill(0)),weeklyScheduleJson:JSON.stringify({2:{start:600,latest:600,duration:540,unpaidBreak:0}})}});
   cookies[id]=`mc_session=${await new SignJWT({userId:id,authVersion:0,role:id==="admin"?"ADMIN":"EMPLOYEE",approved:true,mustChangePassword:false}).setProtectedHeader({alg:"HS256"}).setExpirationTime("1h").sign(new TextEncoder().encode(process.env.JWT_SECRET))}`;
  }
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch("http://127.0.0.1:3198/api/health")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready,logs);
  const monday="2026-10-19",tuesday="2026-10-20";
  assert.equal((await request(`/api/admin/work-days?date=${monday}`,undefined,"employee")).status,403);
  assert.equal((await request("/api/admin/work-days",{date:monday,action:"OPEN_MONDAY",revision:0,confirm:true},"employee")).status,403);
  assert.equal((await request("/api/admin/work-days",{date:tuesday,action:"OPEN_MONDAY",revision:0,confirm:true})).status,400);
  assert.equal((await stats(monday))[0].salaryRs,900);
  await ok(`/api/admin/work-days?date=${monday}`); // Looking never changes pay.
  assert.equal((await stats(monday))[0].salaryRs,900);
  await change(monday,"OPEN_MONDAY");
  assert.ok((await stats(monday)).every(r=>r.salaryRs===0));
  const employee=await prisma.user.findUniqueOrThrow({where:{id:"employee"}});
  assert.equal((await effectiveSchedule(prisma,employee,monday))?.policyVersion,4);
  await checkFallbackIn(prisma,employee,monday,new Date(`${monday}T00:01:00+05:30`));
  assert.equal(await eligibleForArrivalSms(employee,new Date(`${monday}T15:00:00+05:30`)),false);
  assert.equal(await reminderForUser(employee,new Date(`${monday}T15:00:00+05:30`)),null);
  const data=await manual(monday,"employee","10:00","20:00",120);
  assert.equal((await request("/api/admin/attendance/manual",{...data,unpaidBreakMinutes:601})).status,400);
  assert.equal((await request("/api/admin/attendance/manual",{...data,unpaidBreakMinutes:-1})).status,400);
  assert.equal((await request("/api/admin/attendance/manual",{...data,unpaidBreakMinutes:0.5})).status,400);
  await ok("/api/admin/attendance/manual",data);
  let rows=await stats(monday);assert.equal(rows.find(r=>r.userId==="employee")?.salaryRs,800);assert.equal(rows.find(r=>r.userId==="other")?.salaryRs,0);assert.ok(rows.every(r=>r.offDaysPayRs===0 && r.overtimeHours===0));
  assert.equal((await request("/api/admin/attendance/manual",data)).status,409);
  await ok("/api/admin/attendance/manual",await manual(monday,"employee","10:00","23:30",60));
  assert.equal((await stats(monday)).find(r=>r.userId==="employee")?.salaryRs,1250);
  const saved=await prisma.attendanceRecord.findUniqueOrThrow({where:{userId_workDate:{userId:"employee",workDate:monday}}});
  await change(monday,"CLOSE");assert.ok((await stats(monday)).every(r=>r.salaryRs===900));
  assert.deepEqual(await prisma.attendanceRecord.findUnique({where:{id:saved.id}}),saved);
  assert.equal(await effectiveSchedule(prisma,employee,monday),null);
  await assert.rejects(()=>checkFallbackIn(prisma,employee,monday,new Date(`${monday}T09:00:00+05:30`)),/closed/);
  assert.equal((await request("/api/admin/attendance/manual",await manual(monday,"other","10:00","18:00"))).status,409);
  await change(monday,"CORRECTION");assert.equal((await stats(monday)).find(r=>r.userId==="employee")?.salaryRs,900);
  await change(monday,"OPEN_MONDAY");assert.equal((await stats(monday)).find(r=>r.userId==="employee")?.salaryRs,1250);
  // Correction never changes the schedule, off-day credit, or other employees.
  await prisma.user.update({where:{id:"other"},data:{active:false}});
  const scheduleBefore=await effectiveSchedule(prisma,employee,tuesday);
  await change(tuesday,"CORRECTION");
  assert.equal(await prisma.workDayOverride.findUnique({where:{workDate:tuesday}}),null);
  assert.deepEqual(await effectiveSchedule(prisma,employee,tuesday),scheduleBefore);
  await ok("/api/admin/attendance/manual",await manual(tuesday,"other","10:00","17:00",120));
  assert.equal((await stats(tuesday)).find(r=>r.userId==="other")?.salaryRs,500);
  assert.equal((await stats(tuesday)).find(r=>r.userId==="employee")?.salaryRs,0);
  const stale=await manual(tuesday,"other","10:00","18:00",120);
  await change(tuesday,"CLOSE");assert.ok((await stats(tuesday)).every(r=>r.salaryRs===900));
  await change(tuesday,"CORRECTION");assert.ok((await stats(tuesday)).every(r=>r.salaryRs===900));
  assert.equal((await request("/api/admin/attendance/manual",stale)).status,409);
  assert.equal((await request("/api/admin/work-days",{date:tuesday,action:"CLOSE",revision:0,confirm:true})).status,409);
  const past="2026-10-12";
  const old=await prisma.attendanceRecord.create({data:{userId:"employee",workDate:past,clockInAt:new Date(`${past}T10:00:00+05:30`),clockOutAt:new Date(`${past}T22:00:00+05:30`),clockInPhoto:"retained-photo",policyVersion:3,unpaidBreakMinutes:150}});
  await change(past,"CORRECTION");
  assert.deepEqual(await prisma.attendanceRecord.findUnique({where:{id:old.id}}),old);
  assert.equal(await prisma.workDayOverride.findUnique({where:{workDate:past}}),null);
  await change(past,"OPEN_MONDAY");
  const converted=await prisma.attendanceRecord.findUniqueOrThrow({where:{id:old.id}});
  assert.equal(converted.policyVersion,4);assert.equal(converted.clockInPhoto,old.clockInPhoto);
  assert.ok(await prisma.attendanceAudit.count({where:{recordId:old.id,action:"DATE_HOURLY_PAY"}}));
  // Today's correction action must not turn scheduled clock-in into anytime clock-in.
  const today=todayWorkDate();
  const weekday=new Date(`${today}T12:00:00Z`).getUTCDay();
  const scheduledEmployee=await prisma.user.update({where:{id:"employee"},data:{weeklyScheduleJson:JSON.stringify({[weekday]:{start:1439,latest:1439,duration:1,unpaidBreak:0}})}});
  const before=await effectiveSchedule(prisma,scheduledEmployee,today);
  await change(today,"CORRECTION");
  assert.deepEqual(await effectiveSchedule(prisma,scheduledEmployee,today),before);
  assert.notEqual((await getAttendanceToday(scheduledEmployee)).schedule?.arrival,"Any time");
  const photo={lat:0,lng:0,photoDataUrl:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJ1sAAAAASUVORK5CYII=",descriptor:Array(128).fill(0)};
  if(before && new Date()<before.opens){
   const clockIn=await request("/api/attendance/clock-in",photo,"employee");assert.equal(clockIn.status,403);assert.match((await clockIn.json()).error,/15 minutes/);
  }
  await change(today,"CLOSE");assert.equal((await getAttendanceToday(scheduledEmployee)).arrivalState,"OFF");
  assert.equal((await request("/api/attendance/clock-in",photo,"employee")).status,403);
  console.log("PASS: date controls, past dates, authorization, clock-in/out, hourly breaks, closures, payroll, inactive staff, concurrency, reminders and audit.");
  if(process.argv.includes("--preview")){console.log("Preview http://127.0.0.1:3198/ — ADMIN / DayPreview123!");await new Promise(()=>{});}
 }finally{server.kill("SIGTERM");await new Promise<void>(resolve=>{if(server.exitCode!==null)resolve();else server.once("exit",()=>resolve());});await prisma.$disconnect();rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
