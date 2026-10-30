// Isolated DB, synthetic photos, mocked vision response. No employee data or paid API calls.
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawn,spawnSync} from "node:child_process";
import {hash} from "bcryptjs";
import {SignJWT} from "jose/jwt/sign";
async function main(){
 const dir=mkdtempSync(join(tmpdir(),"mc-selfie-"));writeFileSync(join(dir,"test.db"),"");
 Object.assign(process.env,{DATABASE_URL:`file:${join(dir,"test.db")}`,UPLOADS_DIR:join(dir,"uploads"),JWT_SECRET:"selfie-test-only",OPENAI_API_KEY:"",RESTAURANT_LAT:"26.158283",RESTAURANT_LNG:"91.782532",ANNOUNCEMENT_SMS_ENABLED:"false",ANNOUNCEMENT_VOICE_ENABLED:"false",ATTENDANCE_SMS_ENABLED:"false",ANALYTICS_FORECAST_ENABLED:"false"});
 const migration=spawnSync(process.execPath,["node_modules/prisma/build/index.js","migrate","deploy"],{env:process.env,encoding:"utf8"});assert.equal(migration.status,0,migration.stderr);
 const {prisma}=await import("../src/lib/prisma"),{todayWorkDate}=await import("../src/lib/time"),{issuePoseReceipt,enforceSelfieTheme}=await import("../src/lib/selfieThemeServer");
 const date=todayWorkDate(),cookies:Record<string,string>={},descriptor=Array(128).fill(0),photo=`data:image/jpeg;base64,${Buffer.alloc(120,7).toString("base64")}`;
 const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p","3196"],{env:process.env,stdio:["ignore","pipe","pipe"]});let logs="";server.stdout.on("data",d=>logs+=d);server.stderr.on("data",d=>logs+=d);
 const request=(actor:string,path:string,body?:unknown)=>fetch(`http://127.0.0.1:3196${path}`,{method:body?"POST":"GET",headers:{cookie:cookies[actor]??"","Content-Type":"application/json"},...(body?{body:JSON.stringify({...body as object,lat:26.158283,lng:91.782532})}:{})});
 const expect=async(actor:string,path:string,body:unknown,status:number)=>{const r=await request(actor,path,body);assert.equal(r.status,status,await r.clone().text());return r;};
 try{
  for(const id of ["ADMIN","A","B","C"]){const role=id==="ADMIN"?"ADMIN":"EMPLOYEE";await prisma.user.create({data:{id,employeeCode:id,name:id,passwordHash:await hash("SelfieTest123!",4),role,approved:true,mustChangePassword:false,faceDescriptor:JSON.stringify(descriptor)}});cookies[id]=`mc_session=${await new SignJWT({userId:id,role,authVersion:0,approved:true,mustChangePassword:false}).setProtectedHeader({alg:"HS256"}).setExpirationTime("1h").sign(new TextEncoder().encode(process.env.JWT_SECRET))}`;}
  await prisma.workDayOverride.create({data:{workDate:date,mode:"HOURLY",updatedById:"ADMIN"}});
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch("http://127.0.0.1:3196/api/health")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready,logs);
  const adminPath="/api/admin/selfie-themes";
  await expect("A",adminPath,undefined,403);await expect("anon","/api/attendance/selfie-theme?action=in",undefined,403);
  await expect("ADMIN",adminPath,{date,theme:"MINI_HEART",enabled:true,appliesTo:"both",revision:0},409);
  await expect("ADMIN",adminPath,{date,theme:"NONE",enabled:false,appliesTo:"in",revision:0},200);
  await expect("A","/api/attendance/clock-in",{photoDataUrl:photo,descriptor},200);
  await prisma.selfieTheme.update({where:{date},data:{theme:"MINI_HEART",enabled:true,appliesTo:"both",revision:{increment:1}}});
  await expect("B","/api/attendance/clock-in",{photoDataUrl:photo,descriptor},422);
  await expect("A","/api/attendance/clock-out",{photoDataUrl:photo,descriptor},422);
  await expect("C","/api/attendance/location-fallback",{action:"in",photoDataUrl:photo,descriptor},422);
  assert.equal(await prisma.attendanceRecord.count({where:{userId:"B"}}),0);assert.equal(await prisma.staffRequest.count({where:{userId:"C"}}),0);
  // Generate receipts through the real server service, replacing only the provider HTTP call.
  async function receipt(id:string,action:"in"|"out",pass=true){const original=globalThis.fetch;process.env.OPENAI_API_KEY="mock-only";globalThis.fetch=(async()=>new Response(JSON.stringify({status:"completed",output:[{content:[{type:"output_text",text:JSON.stringify({matches:pass,faceVisible:true,singlePerson:true,uncertain:false,feedback:pass?"Accepted":"Cross your thumb and index finger."})}]}]}))) as typeof fetch;try{return await issuePoseReceipt(id,action,photo);}finally{globalThis.fetch=original;process.env.OPENAI_API_KEY="";}}
  await assert.rejects(()=>receipt("B","in",false),/Cross your thumb/);
  const verified=await receipt("B","in");assert.ok(verified.receipt);
  await expect("C","/api/attendance/clock-in",{photoDataUrl:photo,descriptor,poseReceipt:verified.receipt},422);
  await expect("B","/api/attendance/clock-in",{photoDataUrl:`data:image/jpeg;base64,${Buffer.alloc(120,8).toString("base64")}`,descriptor,poseReceipt:verified.receipt},422);
  await expect("B","/api/attendance/clock-in",{photoDataUrl:photo,descriptor,poseReceipt:verified.receipt},200);
  await assert.rejects(()=>enforceSelfieTheme(prisma,"B","in",photo,verified.receipt),/expired/);
  const out=await receipt("A","out");await expect("A","/api/attendance/clock-out",{photoDataUrl:photo,descriptor,poseReceipt:out.receipt},200);
  const old=await receipt("C","in");await prisma.selfieTheme.update({where:{date},data:{revision:{increment:1}}});await assert.rejects(()=>enforceSelfieTheme(prisma,"C","in",photo,old.receipt),/expired/);
  const fresh=await receipt("C","in");await expect("C","/api/attendance/location-fallback",{action:"in",photoDataUrl:photo,descriptor,poseReceipt:fresh.receipt},200);
  await expect("ADMIN",adminPath,{date,operation:"EXCEPTION",userId:"B",action:"out",reason:"Finger injury"},200);
  await expect("B","/api/attendance/clock-out",{photoDataUrl:photo,descriptor},200);
  assert.equal(await prisma.policyAudit.count({where:{action:"SELFIE_THEME_EXCEPTION"}}),1);
  await expect("ADMIN",adminPath,{date,operation:"REVOKE",userId:"B",action:"out"},200);
  assert.equal(await prisma.selfieThemeException.count(),0);
  const current=await prisma.selfieTheme.findUniqueOrThrow({where:{date}});
  await expect("ADMIN",adminPath,{date,theme:"NONE",enabled:false,appliesTo:"both",revision:current.revision-1},409);
  await expect("ADMIN",adminPath,{date,theme:"NONE",enabled:false,appliesTo:"both",revision:current.revision},200);
  const disabled=await request("C","/api/attendance/selfie-theme?action=in");assert.equal((await disabled.json()).theme,null);
  console.log("PASS: migration, permissions, no-theme flow, missing setup, three attendance gates, rejected pose, photo/user binding, one-use receipts, changed themes, GPS fallback, exceptions and audit.");
  if(process.argv.includes("--preview")){console.log("Preview http://127.0.0.1:3196/ ADMIN / SelfieTest123!");await new Promise(()=>{});}
 }finally{server.kill();if(server.exitCode===null)await new Promise(r=>server.once("exit",r));await prisma.$disconnect();rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
