import assert from "node:assert/strict";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
async function main(){
 const dir=mkdtempSync(join(tmpdir(),"mc-assistant-"));
 process.env.DATABASE_URL=`file:${join(dir,"test.db")}`;writeFileSync(join(dir,"test.db"),"");
 process.env.JWT_SECRET="assistant-test-only-secret";process.env.OPENAI_API_KEY="test-not-a-real-key";process.env.APP_ASSISTANT_ENABLED="true";
 const migration=spawnSync(process.execPath,["node_modules/prisma/build/index.js","migrate","deploy"],{env:process.env,encoding:"utf8"});assert.equal(migration.status,0,migration.stderr);
 const {prisma}=await import("../src/lib/prisma");
 const {processAssistantTurn}=await import("../src/lib/assistantServer");
 const {submitStaffRequest}=await import("../src/lib/staffRequestSubmission");
 const {notify}=await import("../src/lib/team");
 const {todayWorkDate}=await import("../src/lib/time");
 try{
 const employee=await prisma.user.create({data:{name:"Employee A",employeeCode:"A",passwordHash:"none",approved:true,mustChangePassword:false}});
 const other=await prisma.user.create({data:{name:"Private Employee B",employeeCode:"B",passwordHash:"secret-not-to-send",approved:true,mustChangePassword:false}});
 const admin=await prisma.user.create({data:{name:"Admin",employeeCode:"ADMIN",passwordHash:"none",role:"ADMIN",mustChangePassword:false}});
 await prisma.staffRequest.create({data:{userId:other.id,kind:"LEAVE",fromDate:todayWorkDate(),toDate:todayWorkDate(),reason:"Private reason",status:"PENDING"}});
 const draft={kind:"LEAVE",fromDate:todayWorkDate(),toDate:todayWorkDate(),reason:"Appointment",proposedIn:null,proposedOut:null};
 const turn=await prisma.assistantTurn.create({data:{userId:employee.id,source:"DIRECT",sourceKey:"test-a",body:"Leave today for appointment"}});
 let calls=0;
 const fetcher:typeof fetch=async(_url,options)=>{
  calls++;const payload=String(options?.body);assert.ok(!payload.includes("Private Employee B"));assert.ok(!payload.includes("Private reason"));assert.ok(!payload.includes("passwordHash"));assert.equal(JSON.parse(payload).store,false);
  await prisma.assistantTurn.update({where:{id:turn.id},data:{escalated:true}}); // Employee asks admin while AI is still processing.
  return new Response(JSON.stringify({status:"completed",output:[{content:[{type:"output_text",text:JSON.stringify({reply:"Done",escalate:false,draft})}]}]}),{status:200});
 };
 await processAssistantTurn(turn.id,fetcher);await processAssistantTurn(turn.id,fetcher);assert.equal(calls,1);
 assert.equal((await prisma.assistantTurn.findUniqueOrThrow({where:{id:turn.id}})).escalated,true);
 assert.equal(await prisma.staffRequest.count({where:{userId:employee.id}}),0);
 await assert.rejects(submitStaffRequest(other,draft,turn.id));
 const first=await submitStaffRequest(employee,draft,turn.id);
 const again=await submitStaffRequest(employee,draft,turn.id);assert.equal(first.request.id,again.request.id);
 assert.equal(first.request.status,"PENDING");assert.equal(await prisma.attendanceRecord.count(),0);
 assert.equal(await prisma.staffRequest.count({where:{userId:employee.id}}),1);
 assert.equal(await prisma.assistantTurn.count({where:{userId:admin.id,source:"NOTIFICATION"}}),1);
 await prisma.$transaction(async tx=>{await notify(tx,[admin],"TEST_NOTICE","key","Test notice","team?view=requests");await notify(tx,[admin],"TEST_NOTICE","key","Test notice","team?view=requests");await notify(tx,[admin],"ASSISTANT_REVIEW","loop","No feedback loop","team?view=assistant");});
 assert.equal(await prisma.assistantTurn.count({where:{userId:admin.id,source:"NOTIFICATION"}}),2);
 const fail=await prisma.assistantTurn.create({data:{userId:employee.id,source:"DIRECT",sourceKey:"fail",body:"Help"}});
 await processAssistantTurn(fail.id,async()=>new Response("unavailable",{status:503}));assert.equal((await prisma.assistantTurn.findUniqueOrThrow({where:{id:fail.id}})).status,"FAILED");
 const inactive=await prisma.user.update({where:{id:other.id},data:{active:false}});
 const blocked=await prisma.assistantTurn.create({data:{userId:inactive.id,source:"DIRECT",sourceKey:"blocked",body:"Help"}});
 await processAssistantTurn(blocked.id,fetcher);assert.equal(calls,1);
 console.log("PASS: migrations, private context, request confirmation/ownership, idempotency, pending approvals, no attendance mutation, notification capture/deduplication/no loops, provider failure and inactive accounts.");
 }finally{await prisma.$disconnect();rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
