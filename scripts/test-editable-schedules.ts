// Isolated database and HTTP server; never reads or writes production attendance.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { SignJWT } from "jose/jwt/sign";
async function main(){
 const dir=mkdtempSync(join(tmpdir(),"mc-shifts-"));
 Object.assign(process.env,{DATABASE_URL:`file:${join(dir,"test.db")}`,JWT_SECRET:"isolated-shift-test",ANNOUNCEMENT_VOICE_ENABLED:"false",ANNOUNCEMENT_SMS_ENABLED:"false",ATTENDANCE_SMS_ENABLED:"false",ATTENDANCE_REMINDERS_ENABLED:"false",AUTO_CLOCK_OUT_ENABLED:"false"});
 writeFileSync(join(dir,"test.db"),"");
 const migrated=spawnSync(process.execPath,["node_modules/prisma/build/index.js","migrate","deploy"],{env:process.env,encoding:"utf8"});assert.equal(migrated.status,0,migrated.stderr);
 const {prisma}=await import("../src/lib/prisma");
 const {todayWorkDate}=await import("../src/lib/time");
 const {effectiveSchedule}=await import("../src/lib/performanceServer");
 const date=(offset:number)=>new Date(+new Date(`${todayWorkDate()}T00:00:00Z`)+offset*86400000).toISOString().slice(0,10);
 const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p","3197","-H","127.0.0.1"],{env:process.env,stdio:["ignore","pipe","pipe"]});
 let logs="";server.stdout.on("data",d=>logs+=d);server.stderr.on("data",d=>logs+=d);
 const cookies:Record<string,string>={};
 async function request(user:string,body?:unknown){return fetch("http://127.0.0.1:3197/api/admin/employees/employee/schedule",{method:body ? "PUT":"GET",headers:{cookie:cookies[user]||"","content-type":"application/json"},...(body ? {body:JSON.stringify(body)}:{})});}
 try{
  for(const [id,role] of [["admin","ADMIN"],["employee","EMPLOYEE"]] as const){
   await prisma.user.create({data:{id,role,name:id,employeeCode:id,passwordHash:"unused",approved:true,mustChangePassword:false,attendancePolicyFrom:"2026-01-01"}});
   cookies[id]=`mc_session=${await new SignJWT({userId:id,authVersion:0,role,approved:true,mustChangePassword:false}).setProtectedHeader({alg:"HS256"}).setExpirationTime("1h").sign(new TextEncoder().encode(process.env.JWT_SECRET))}`;
  }
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch("http://127.0.0.1:3197/api/health")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready,logs);
  const days={"2":{start:600,latest:600,duration:750,unpaidBreak:150,paidBreak:0}};
  const initial=await (await request("admin")).json();assert.ok(initial.revision);assert.equal(initial.days["1"],undefined);
  const payload={from:date(1),revision:initial.revision,days};
  assert.equal((await request("employee")).status,403);assert.equal((await request("employee",payload)).status,403);assert.equal((await request("anonymous",payload)).status,403);
  assert.equal((await request("admin",{...payload,from:date(-1)})).status,400);
  assert.equal((await request("admin",{...payload,days:{"1":days["2"]}})).status,400);
  const saved=await request("admin",payload);assert.equal(saved.status,200,await saved.text());
  assert.equal((await request("admin",payload)).status,409);
  const user=await prisma.user.findUniqueOrThrow({where:{id:"employee"}});
  assert.equal(JSON.parse(user.scheduleHistoryJson!).length,1);
  assert.equal(await prisma.policyAudit.count({where:{userId:user.id}}),1);
  const old=await effectiveSchedule(prisma,user,date(0));assert.equal(old?.durationMinutes,540);
  let offset=1;while(new Date(`${date(offset)}T12:00:00Z`).getUTCDay()!==2)offset++;
  const active=await effectiveSchedule(prisma,user,date(offset));assert.equal(active?.durationMinutes,750);assert.equal(active?.paidBreakMinutes,0);
  await prisma.scheduledShift.create({data:{userId:user.id,workDate:date(offset),startsAt:new Date(`${date(offset)}T11:00:00+05:30`),endsAt:new Date(`${date(offset)}T20:00:00+05:30`)}});
  assert.equal((await effectiveSchedule(prisma,user,date(offset)))?.durationMinutes,540);
  await prisma.attendanceRecord.create({data:{userId:user.id,workDate:date(2)}});
  const current=await (await request("admin")).json();assert.equal((await request("admin",{...payload,revision:current.revision})).status,409);
  const sameDay=await prisma.user.create({data:{id:"today-employee",role:"EMPLOYEE",name:"Today",employeeCode:"TODAY",passwordHash:"unused",approved:true,mustChangePassword:false}});
  const sameDayRequest=(body?:unknown)=>fetch("http://127.0.0.1:3197/api/admin/employees/today-employee/schedule",{method:body?"PUT":"GET",headers:{cookie:cookies.admin,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  const currentDay=await (await sameDayRequest()).json();assert.equal(currentDay.from,date(0));assert.equal(currentDay.minDate,date(0));
  assert.equal((await sameDayRequest({from:date(0),days,revision:currentDay.revision})).status,200);
  const fresh=await (await sameDayRequest()).json();
  await prisma.arrivalAttempt.create({data:{userId:sameDay.id,workDate:date(0),arrivedAt:new Date(),photo:"test-only"}});
  assert.equal((await sameDayRequest({from:date(0),days,revision:fresh.revision})).status,409);
  await prisma.arrivalAttempt.deleteMany({where:{userId:sameDay.id}});
  await prisma.staffRequest.create({data:{userId:sameDay.id,kind:"GPS_CLOCK_IN",fromDate:date(0),toDate:date(0),reason:"test"}});
  assert.equal((await sameDayRequest({from:date(0),days,revision:fresh.revision})).status,409);
  console.log("Editable schedules: migration, admin authorization, validation, concurrency, audit, effective date, historical preservation, overrides and attendance protection passed.");
 }finally{server.kill("SIGTERM");await new Promise<void>(resolve=>{if(server.exitCode!==null)resolve();else server.once("exit",()=>resolve());});await prisma.$disconnect();rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
