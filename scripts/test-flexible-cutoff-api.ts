import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawn,spawnSync} from "node:child_process";
import {SignJWT} from "jose/jwt/sign";
async function main(){
 const dir=mkdtempSync(join(tmpdir(),"mc-flex-api-")),db=join(dir,"test.db");writeFileSync(db,"");
 Object.assign(process.env,{DATABASE_URL:`file:${db}`,UPLOADS_DIR:join(dir,"uploads"),JWT_SECRET:"isolated-flex-api",ANNOUNCEMENT_SMS_ENABLED:"false",ANNOUNCEMENT_VOICE_ENABLED:"false",ATTENDANCE_SMS_ENABLED:"false",ATTENDANCE_REMINDERS_ENABLED:"false",ANALYTICS_FORECAST_ENABLED:"false",OPENAI_API_KEY:"",RESTAURANT_LAT:"",RESTAURANT_LNG:""});
 const migration=spawnSync(process.execPath,["node_modules/prisma/build/index.js","migrate","deploy"],{env:process.env,encoding:"utf8"});assert.equal(migration.status,0,migration.stderr);
 const {prisma}=await import("../src/lib/prisma"),{todayWorkDate}=await import("../src/lib/time");
 const {weekStart}=await import("../src/lib/reporting");
 const date=todayWorkDate(),cookies:Record<string,string>={},descriptor=Array(128).fill(0);
 for(const id of ["ADMIN","FLEX","NORMAL"]){
  const role=id==="ADMIN"?"ADMIN":"EMPLOYEE";
  await prisma.user.create({data:{id,name:id,employeeCode:id,passwordHash:"unused",role,approved:true,mustChangePassword:false,flexibleNineHours:id==="FLEX",createdAt:new Date("2026-10-01"),faceDescriptor:JSON.stringify(descriptor)}});
  cookies[id]=`mc_session=${await new SignJWT({userId:id,role,authVersion:0}).setProtectedHeader({alg:"HS256"}).setExpirationTime("1h").sign(new TextEncoder().encode(process.env.JWT_SECRET))}`;
 }
 const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p","3198"],{env:process.env,stdio:["ignore","pipe","pipe"]});let logs="";server.stdout.on("data",d=>logs+=d);server.stderr.on("data",d=>logs+=d);
 async function req(actor:string,path:string,status:number,body?:unknown){
  const r=await fetch("http://127.0.0.1:3198"+path,{method:body?"POST":"GET",headers:{cookie:cookies[actor]??"","Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(r.status,status,await r.clone().text());return r.json();
 }
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch("http://127.0.0.1:3198/api/health")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready,logs);
  await req("NORMAL",`/api/admin/clock-out-cutoff?date=${date}`,403);
  await req("NORMAL","/api/admin/clock-out-cutoff",403,{date,time:"20:00",enabled:true,revision:0});
  assert.equal((await req("FLEX","/api/employee/weekly-schedule",200)).exempt,true);
  await req("FLEX","/api/employee/weekly-schedule",400,{week:weekStart(date),days:{},revision:0});
  const payload={lat:0,lng:0,descriptor,photoDataUrl:`data:image/jpeg;base64,${Buffer.alloc(120,7).toString("base64")}`};
  await req("NORMAL","/api/attendance/clock-in",409,payload);
  // Open Monday only in this disposable DB so this test is independent of weekday.
  if(new Date(date+"T12:00:00Z").getUTCDay()===1)await prisma.workDayOverride.create({data:{workDate:date,mode:"HOURLY",updatedById:"ADMIN"}});
  await req("FLEX","/api/attendance/clock-in",200,payload);
  const record=await prisma.attendanceRecord.findFirstOrThrow({where:{userId:"FLEX"}});
  assert.equal(record.policyVersion,5);
  // A deterministic early arrival makes the selected past cutoff eligible.
  await prisma.attendanceRecord.update({where:{id:record.id},data:{clockInAt:new Date(date+"T00:00:00+05:30")}});
  await req("ADMIN","/api/admin/clock-out-cutoff",400,{date:"2026-01-01",time:"17:00",enabled:true,revision:0});
  await req("ADMIN","/api/admin/clock-out-cutoff",400,{date,time:"25:00",enabled:true,revision:0});
  const setting={date,time:"00:00",enabled:true,revision:0};
  const saved=await req("ADMIN","/api/admin/clock-out-cutoff",200,setting);
  assert.equal(saved.rule.revision,1);
  await req("ADMIN","/api/admin/clock-out-cutoff",409,setting);
  const after=await prisma.attendanceRecord.findUniqueOrThrow({where:{id:record.id}});
  assert.equal(after.autoClockOut,true);assert.equal(after.missingPunch,"NONE");assert.ok(after.clockOutAt);
  await req("FLEX","/api/attendance/clock-in",409,payload);
  await req("FLEX","/api/attendance/clock-out",409,payload);
  await req("FLEX","/api/attendance/location-fallback",409,{...payload,action:"in"});
  await req("ADMIN","/api/admin/clock-out-cutoff",200,{...setting,enabled:false,revision:1});
  assert.equal(+(await prisma.attendanceRecord.findUniqueOrThrow({where:{id:record.id}})).clockOutAt!,+after.clockOutAt!);
  console.log("PASS: admin authorization, flexible schedule exemption and verified punch, cutoff validation, revision conflict, immediate closure, post-cutoff normal/GPS blocking, disabling preserves history.");
 }finally{server.kill();if(server.exitCode===null)await new Promise(r=>server.once("exit",r));await prisma.$disconnect();rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
