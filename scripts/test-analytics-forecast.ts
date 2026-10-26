// Disposable database, local HTTP, all outbound messaging/forecast workers disabled.
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawn,spawnSync} from "node:child_process";
import {hash} from "bcryptjs";
import {SignJWT} from "jose/jwt/sign";
async function main(){
 const dir=mkdtempSync(join(tmpdir(),"mc-forecast-"));writeFileSync(join(dir,"test.db"),"");
 Object.assign(process.env,{DATABASE_URL:`file:${join(dir,"test.db")}`,JWT_SECRET:"forecast-isolated",ANNOUNCEMENT_SMS_ENABLED:"false",ANNOUNCEMENT_VOICE_ENABLED:"false",ATTENDANCE_SMS_ENABLED:"false",ATTENDANCE_REMINDERS_ENABLED:"false",ANALYTICS_FORECAST_ENABLED:"false"});
 const m=spawnSync(process.execPath,["node_modules/prisma/build/index.js","migrate","deploy"],{env:process.env,encoding:"utf8"});assert.equal(m.status,0,m.stderr);
 const {prisma}=await import("../src/lib/prisma"),{todayWorkDate}=await import("../src/lib/time"),{shiftDate}=await import("../src/lib/analytics/forecast"),{captainToken}=await import("../src/lib/analytics/auth");
 const today=todayWorkDate(),cookies:Record<string,string>={};
 const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p","3195"],{env:process.env,stdio:["ignore","pipe","pipe"]});let logs="";server.stdout.on("data",d=>logs+=d);server.stderr.on("data",d=>logs+=d);
 const request=(actor:string,body?:unknown)=>fetch("http://127.0.0.1:3195/api/analytics/forecast",{method:body?"POST":"GET",headers:{cookie:cookies[actor]??"","Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
 const get=async()=>{const r=await request("captain");assert.equal(r.status,200,await r.clone().text());return r.json();};
 async function review(date:string,status="COMPLETE"){const data=await get(),d=data.days.find((d:{date:string})=>d.date===date);return request("captain",{action:"REVIEW",date,status,confirm:true,fingerprint:d.fingerprint});}
 try{
  for(const role of ["ADMIN","EMPLOYEE"]){await prisma.user.create({data:{id:role,employeeCode:role,name:role,passwordHash:await hash("ForecastDemo123!",4),role,approved:true,mustChangePassword:false}});cookies[role]=`mc_session=${await new SignJWT({userId:role,role,authVersion:0,approved:true,mustChangePassword:false}).setProtectedHeader({alg:"HS256"}).setExpirationTime("1h").sign(new TextEncoder().encode(process.env.JWT_SECRET))}`;}
  const captain=await prisma.captainAccount.create({data:{id:"captain",name:"Captain",username:"CAPTAIN",passwordHash:await hash("ForecastDemo123!",4)}});cookies.captain=`mc_captain_session=${await captainToken(captain)}`;
  for(let i=1;i<=4;i++){const date=shiftDate(today,-i);await prisma.customerVisit.create({data:{id:`v${i}`,submissionKey:`s${i}`,visitedAt:new Date(`${date}T14:00:00+05:30`),workDate:date,weekday:new Date(date).getUTCDay(),isWeekend:false,monthPeriod:"END",groupSize:i*2,groupType:"MIXED",maleCount:i,femaleCount:i,unrecordedCount:0,visitType:"FIRST",discovery:"NOT_ASKED",unavailableJson:"[]",feedback:"",status:i===4?"OPEN":"COMPLETE",weatherJson:"{}",createdById:"captain",updatedById:"captain",items:{create:[{menuId:"fish",name:"Fish Thali",category:"Menu",diet:"NON_VEG",unitPriceRs:400,quantity:i},{menuId:"water",name:"Bottled Water (1 litre)",category:"Beverages",diet:"VEG",unitPriceRs:30,quantity:2}]}}});}
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch("http://127.0.0.1:3195/api/health")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready,logs);
  for(const actor of ["anon","EMPLOYEE"]){assert.equal((await request(actor)).status,403);assert.equal((await request(actor,{action:"SAVE"})).status,403);}
  assert.equal((await request("ADMIN")).status,200);assert.equal((await get()).preview,null);
  assert.equal((await request("captain",{action:"SAVE"})).status,400);
  assert.equal((await review(shiftDate(today,-4))).status,400);
  assert.equal((await review(shiftDate(today,-1),"CLOSED")).status,400);
  for(let i=1;i<=3;i++)assert.equal((await review(shiftDate(today,-i))).status,200);
  const {saveHourlyForecasts}=await import("../src/lib/analytics/forecastServer");
  const firstHour=new Date(`${today}T14:00:00+05:30`);
  const first=await saveHourlyForecasts(firstHour);assert.equal(first.length,2);
  const baseRow=await prisma.customerVisit.findUniqueOrThrow({where:{id:"v1"}});
  const {id:omitId,submissionKey:omitKey,updatedAt:omitUpdated,...copy}=baseRow;
  await prisma.customerVisit.create({data:{...copy,id:"today-visit",submissionKey:"today-key",workDate:today,visitedAt:new Date(`${today}T14:15:00+05:30`),groupSize:40,status:"OPEN",items:{create:{menuId:"fish",name:"Fish Thali",category:"Menu",diet:"NON_VEG",quantity:10,unitPriceRs:400}}}});
  const unchanged=await saveHourlyForecasts(new Date(`${today}T14:30:00+05:30`));assert.equal(unchanged.find(r=>r.date===today)?.forecastJson,first.find(r=>r.date===today)?.forecastJson);
  const second=await saveHourlyForecasts(new Date(`${today}T15:00:00+05:30`));assert.equal(second.length,2);const live=JSON.parse(second.find(r=>r.date===today)!.forecastJson);assert.equal(live.intraday.observedGuests,40);assert.ok(live.guests>=40);assert.ok(live.sales>=4000);
  assert.equal(await prisma.analyticsHourlyForecast.count(),4);
  const data=await get();assert.equal(data.preview.trainingDays,3);assert.equal(data.preview.items.length,2);assert.ok(data.preview.items.some((i:{water:boolean})=>i.water));
  const saved=await request("captain",{action:"SAVE"});assert.equal(saved.status,200);const original=(await saved.json()).saved;
  await prisma.customerVisit.update({where:{id:"v1"},data:{groupSize:99,revision:{increment:1}}});
  const changed=await get();assert.equal(changed.preview,null);assert.equal(changed.days.find((d:{date:string})=>d.date===shiftDate(today,-1)).status,"CHANGED");
  const stale=data.days.find((d:{date:string})=>d.date===shiftDate(today,-1));assert.equal((await request("captain",{action:"REVIEW",date:stale.date,status:"COMPLETE",confirm:true,fingerprint:stale.fingerprint})).status,400);
  assert.equal((await review(shiftDate(today,-1))).status,200);assert.deepEqual((await (await request("captain",{action:"SAVE"})).json()).saved,original);
  assert.equal((await review(shiftDate(today,-5),"CLOSED")).status,200);assert.equal((await get()).preview.trainingDays,3);
  assert.equal((await review(shiftDate(today,-6))).status,200);assert.equal((await get()).preview.trainingDays,4);
  await prisma.analyticsForecast.create({data:{date:shiftDate(today,-1),createdAt:new Date(`${shiftDate(today,-2)}T18:00:00Z`),modelVersion:"adaptive-v1",forecastJson:original.prediction?JSON.stringify({...original.prediction,date:shiftDate(today,-1)}):"{}"}});
  assert.equal((await get()).history[0].actual.guests,99);
  const page=await fetch("http://127.0.0.1:3195/analytics",{headers:{cookie:cookies.captain}});assert.equal(page.status,200);assert.ok((await page.text()).includes("Forecast"));
  if(process.argv.includes("--preview")){console.log("Preview http://127.0.0.1:3195/analytics/login CAPTAIN / ForecastDemo123!");await new Promise(()=>{});}
  console.log("PASS: authorization, review guards, zero vs closed, stale-data detection, immutable forecast, actual results and analytics navigation.");
 }finally{server.kill();if(server.exitCode===null)await new Promise(r=>server.once("exit",r));await prisma.$disconnect();rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
