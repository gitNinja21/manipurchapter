// Disposable database + real local HTTP routes. Messaging workers are disabled.
import assert from "node:assert/strict";
import { mkdtempSync,rmSync,writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn,spawnSync } from "node:child_process";
import { SignJWT } from "jose/jwt/sign";
import bcrypt from "bcryptjs";
async function main(){
 const dir=mkdtempSync(join(tmpdir(),"mc-analytics-"));
 Object.assign(process.env,{DATABASE_URL:`file:${join(dir,"test.db")}`,JWT_SECRET:"isolated-analytics-test",WEATHERAPI_KEY:"",ANNOUNCEMENT_VOICE_ENABLED:"false",ANNOUNCEMENT_SMS_ENABLED:"false",ATTENDANCE_SMS_ENABLED:"false",ATTENDANCE_REMINDERS_ENABLED:"false",AUTO_CLOCK_OUT_ENABLED:"false"});
 writeFileSync(join(dir,"test.db"),"");
 const migrated=spawnSync(process.execPath,["node_modules/prisma/build/index.js","migrate","deploy"],{env:process.env,encoding:"utf8"});assert.equal(migrated.status,0,migrated.stderr);
 const {prisma}=await import("../src/lib/prisma");const {MENU}=await import("../src/lib/analytics/menu");const {todayWorkDate}=await import("../src/lib/time");
 const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p","3196","-H","127.0.0.1"],{env:process.env,stdio:["ignore","pipe","pipe"]});let logs="";server.stdout.on("data",d=>logs+=d);server.stderr.on("data",d=>logs+=d);
 const cookies:Record<string,string>={};
 const request=(user:string,path:string,body?:unknown,method=body===undefined?"GET":"POST")=>fetch(`http://127.0.0.1:3196${path}`,{method,headers:{cookie:cookies[user]||"","content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
 try{
  for(const [id,role] of [["admin","ADMIN"],["employee","EMPLOYEE"]] as const){await prisma.user.create({data:{id,role,name:"Analytics test",employeeCode:id.toUpperCase(),passwordHash:await bcrypt.hash("AnalyticsDemo123!",4),approved:true,mustChangePassword:false}});cookies[id]=`mc_session=${await new SignJWT({userId:id,authVersion:0,role,approved:true,mustChangePassword:false}).setProtectedHeader({alg:"HS256"}).setExpirationTime("1h").sign(new TextEncoder().encode(process.env.JWT_SECRET))}`;}
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch("http://127.0.0.1:3196/api/health")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready,logs);
  // Captain accounts are not staff User records and use a separate session cookie.
  assert.equal((await request("employee","/api/admin/captains",{name:"Captain",username:"captain",password:"CaptainDemo123!"})).status,403);
  assert.equal((await request("admin","/api/admin/captains",{name:"Captain",username:"captain",password:"CaptainDemo123!"})).status,200);
  const captain=await prisma.captainAccount.findUniqueOrThrow({where:{username:"CAPTAIN"}});
  assert.equal(await prisma.user.count({where:{employeeCode:"CAPTAIN"}}),0);
  assert.equal((await request("anonymous","/api/analytics/auth/login",{username:"captain",password:"wrong"})).status,401);
  const login=await request("admin","/api/analytics/auth/login",{username:"captain",password:"CaptainDemo123!"});assert.equal(login.status,200);
  const setCookies=login.headers.getSetCookie();assert.ok(setCookies.some(c=>c.startsWith("mc_session=;") && c.includes("Max-Age=0")));
  cookies.captain=setCookies.find(c=>c.startsWith("mc_captain_session="))!.split(";")[0];
  for(const url of ["/api/admin/employees","/api/admin/stats","/api/admin/attendance","/api/admin/captains"])assert.equal((await request("captain",url)).status,403,url);
  const scopedToken=cookies.captain.split("=")[1];cookies.forged=`mc_session=${scopedToken}`;
  assert.equal((await request("forged","/api/admin/stats")).status,403);
  const captainPage=await (await request("captain","/analytics")).text();assert.ok(captainPage.includes("Captain dashboard"));assert.ok(!captainPage.includes('href="/admin/payroll"'));
  const date=todayWorkDate();const path="/api/analytics/visits",report=`/api/analytics/report?from=${date}&to=${date}`;
  const draft={submissionKey:crypto.randomUUID(),maleCount:2,femaleCount:1,unrecordedCount:0,visitType:"FIRST",discovery:"INSTAGRAM",unavailable:["Duck fry"],feedback:"Loved the thali",tableLabel:"Table 4",status:"OPEN",items:[{menuId:MENU[0].id,diet:"NON_VEG",quantity:2,favourite:true,unitPriceRs:1}],visitedAt:"2000-01-01T00:00:00Z"};
  for(const user of ["anonymous","employee"]){for(const url of [path,report])assert.equal((await request(user,url)).status,403);assert.equal((await request(user,path,draft)).status,403);assert.equal((await request(user,"/api/analytics/calendar",{date,names:[],isHoliday:false},"PUT")).status,403);}
  assert.equal((await request("admin",path,{...draft,maleCount:-1})).status,400);
  assert.equal((await request("admin",path,{...draft,items:[{...draft.items[0],menuId:"unknown"}]})).status,400);
  const created=await request("captain",path,draft);assert.equal(created.status,200,await created.clone().text());const {visit:v}=await created.json();
  assert.equal(v.totalRs,1170);assert.equal(v.groupSize,3);assert.equal(v.workDate,date);assert.equal(v.weather.status,"NOT_CONFIGURED");
  assert.equal((await (await request("admin",path,draft)).json()).visit.id,v.id);assert.equal(await prisma.customerVisit.count(),1);
  const simultaneous={...draft,submissionKey:crypto.randomUUID()};const duplicates=await Promise.all([request("admin",path,simultaneous),request("admin",path,simultaneous)]);for(const res of duplicates)assert.equal(res.status,200,await res.clone().text());assert.equal(await prisma.customerVisit.count({where:{submissionKey:simultaneous.submissionKey}}),1);
  const other=await prisma.customerVisit.findUniqueOrThrow({where:{submissionKey:simultaneous.submissionKey}});await prisma.customerVisit.delete({where:{id:other.id}});
  for(const user of ["anonymous","employee"]){assert.equal((await request(user,`${path}/${v.id}`,{...draft,revision:v.revision},"PUT")).status,403);assert.equal((await request(user,`${path}/${v.id}`,{revision:v.revision},"DELETE")).status,403);}
  // A stale client must not relabel another table's existing visit.
  assert.equal((await request("captain",`${path}/${v.id}`,{...draft,tableLabel:"Table 2",revision:v.revision},"PUT")).status,409);
  assert.equal((await prisma.customerVisit.findUniqueOrThrow({where:{id:v.id}})).tableLabel,"Table 4");
  // Additional orders keep the same running bill, arrival time and daily-record row.
  const running=await request("captain",`${path}/${v.id}`,{...draft,revision:v.revision,items:[{...draft.items[0],quantity:3}]},"PUT");
  assert.equal(running.status,200);const {visit:r}=await running.json();
  assert.equal(r.id,v.id);assert.equal(r.status,"OPEN");assert.equal(r.totalRs,1755);assert.equal(r.visitedAt,v.visitedAt);
  assert.equal((await (await request("captain",`${path}?date=${date}`)).json()).visits.length,1);
  const updated=await request("captain",`${path}/${v.id}`,{...draft,revision:r.revision,status:"COMPLETE",items:[{...draft.items[0],quantity:3}]},"PUT");assert.equal(updated.status,200);const {visit:u}=await updated.json();assert.equal(u.id,v.id);assert.equal(u.status,"COMPLETE");assert.equal(u.totalRs,1755);assert.equal(u.visitedAt,v.visitedAt);assert.deepEqual(u.weather,v.weather);
  assert.equal((await request("admin",`${path}/${v.id}`,{...draft,revision:v.revision},"PUT")).status,409);
  assert.equal((await request("admin","/api/analytics/calendar",{date,names:["Local food festival"],isHoliday:true},"PUT")).status,200);
  const list=await (await request("admin",`${path}?date=${date}`)).json();assert.deepEqual(list.visits[0].calendar.names,["Local food festival"]);
  const summary=await (await request("captain",report)).json();assert.equal(summary.entries[0].visitedAt,v.visitedAt);assert.equal(summary.entries[0].workDate,date);assert.equal(summary.valueRs,1755);assert.equal(summary.guests,3);assert.equal(summary.items[0].quantity,3);
  assert.equal((await request("admin","/api/analytics/report?from=2026-01-01&to=2026-12-31")).status,400);
  const csv=await (await request("admin",`${report}&format=csv`)).text();assert.ok(csv.includes("1755"));assert.ok(csv.includes("Local food festival"));
  assert.equal((await request("admin",`${path}/${v.id}`,{revision:u.revision},"DELETE")).status,200);assert.equal((await (await request("admin",report)).json()).visits,0);assert.ok((await prisma.customerVisit.findUniqueOrThrow({where:{id:v.id}})).deletedAt);
  // Persist a fixture weather reading, then prove reads, report and order edits retain every field.
  const fixture=await request("captain",path,{...draft,submissionKey:crypto.randomUUID()});const {visit:fv}=await fixture.json();
  const weather={status:"OK",source:"WeatherAPI.com",requestedAt:fv.visitedAt,observedAt:fv.visitedAt,temperatureC:29.7,precipitationMm:0,humidity:68,condition:"Sunny",latitude:26.158283,longitude:91.782532};
  await prisma.customerVisit.update({where:{id:fv.id},data:{weatherJson:JSON.stringify(weather)}});
  const roundtrip=await (await request("captain",`${path}?date=${date}`)).json();assert.deepEqual(roundtrip.visits[0].weather,weather);assert.equal(roundtrip.visits[0].visitedAt,fv.visitedAt);
  const details=await (await request("captain",report)).json();assert.equal(details.entries[0].weather.temperatureC,29.7);assert.equal(details.entries[0].weekday,new Date(`${date}T12:00:00Z`).getUTCDay());
  const editWeather=await request("captain",`${path}/${fv.id}`,{...draft,revision:fv.revision,feedback:"Updated feedback"},"PUT");assert.equal(editWeather.status,200);assert.deepEqual((await editWeather.json()).visit.weather,weather);
  // Fractional quantities must survive the database, bill edits, daily list and CSV.
  const halfDraft={...draft,submissionKey:crypto.randomUUID(),tableLabel:"Table 7",items:[{...draft.items[0],quantity:0.5},{menuId:"open-pork",diet:"NON_VEG",quantity:0.5,favourite:false,unitPriceRs:1}]};
  const halfResponse=await request("captain",path,halfDraft);assert.equal(halfResponse.status,200,await halfResponse.clone().text());
  const {visit:halfVisit}=await halfResponse.json();assert.equal(halfVisit.totalRs,492.5);assert.ok(halfVisit.items.every((i:{quantity:number})=>i.quantity===0.5));
  assert.equal((await request("captain",`${path}/${halfVisit.id}`,{...halfDraft,revision:halfVisit.revision,items:[{menuId:"open-pork",diet:"NON_VEG",quantity:1,favourite:false}]},"PUT")).status,400);
  const halfUpdated=await request("captain",`${path}/${halfVisit.id}`,{...halfDraft,revision:halfVisit.revision,status:"COMPLETE"},"PUT");assert.equal(halfUpdated.status,200);assert.equal((await halfUpdated.json()).visit.totalRs,492.5);
  const halfList=await (await request("captain",`${path}?date=${date}`)).json();assert.equal(halfList.visits.find((v:{id:string})=>v.id===halfVisit.id).totalRs,492.5);
  const halfCsv=await (await request("captain",`${report}&format=csv`)).text();assert.ok(halfCsv.includes("292.5"));assert.ok(halfCsv.includes("0.5"));
  assert.equal((await request("admin",`/api/admin/captains/${captain.id}`,{active:false},"PATCH")).status,200);assert.equal((await request("captain",path)).status,403);
  await request("admin",`/api/admin/captains/${captain.id}`,{active:true,password:"CaptainDemo456!"},"PATCH");assert.equal((await request("captain",path)).status,403);
  assert.equal((await request("anonymous","/api/analytics/auth/login",{username:"captain",password:"CaptainDemo123!"})).status,401);
  console.log(`Customer analytics passed: ${MENU.length} catalog variants, migrations, authorization, validation, server pricing, idempotency, concurrency, immutable timestamps/weather, calendar, reports, CSV and deletion.`);
  if(process.argv.includes("--preview")){
   await request("admin",path,{...draft,submissionKey:crypto.randomUUID()});
   console.log("Isolated captain UI preview ready at http://127.0.0.1:3196/analytics (captain / CaptainDemo456!).");
   await new Promise<void>(resolve=>{process.once("SIGTERM",resolve);process.once("SIGINT",resolve);});
  }
 }finally{server.kill("SIGTERM");await new Promise<void>(r=>{if(server.exitCode!==null)r();else server.once("exit",()=>r());});await prisma.$disconnect();rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
