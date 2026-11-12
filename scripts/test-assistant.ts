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
 const {queueAssistantChat,assistantChatStatuses}=await import("../src/lib/assistantChat");
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
 // Real Team Chat capture, private inline status and recorded opposite punch context.
 const day=todayWorkDate();
 await prisma.attendanceRecord.create({data:{userId:employee.id,workDate:day,clockOutAt:new Date(`${day}T19:00:00+05:30`)}});
 await prisma.attendanceRecord.create({data:{userId:other.id,workDate:day,clockInAt:new Date(`${day}T01:23:00+05:30`)}});
 const previous=new Date(Date.parse(day)-86400000).toISOString().slice(0,10);
 await prisma.attendanceRecord.create({data:{userId:employee.id,workDate:previous,clockInAt:new Date(`${previous}T10:00:00+05:30`),clockOutAt:new Date(`${previous}T19:00:00+05:30`),missingPunch:"OUT"}});
 const chat=await prisma.teamMessage.create({data:{authorId:employee.id,authorName:employee.name,body:"I forgot my clock in today"}});
 const queued=await prisma.$transaction(tx=>queueAssistantChat(tx,employee,chat));assert.ok(queued);
 const repeated=await prisma.$transaction(tx=>queueAssistantChat(tx,employee,chat));assert.equal(repeated!.id,queued.id);
 assert.equal(await prisma.$transaction(tx=>queueAssistantChat(tx,admin,chat)),null);
 let chatCalls=0;
 await processAssistantTurn(queued.id,async(_url,options)=>{
  chatCalls++;const input=JSON.parse(JSON.parse(String(options?.body)).input);
  assert.equal(input.context.recentOwnAttendance.length,2);
  assert.equal(input.context.recentOwnAttendance[1].clockOutAt,null);
  assert.equal(input.context.recentOwnAttendance[0].clockInAt,null);
  assert.equal(input.context.recentOwnAttendance[0].clockOutAt,new Date(`${day}T19:00:00+05:30`).toISOString());
  return new Response(JSON.stringify({status:"completed",output:[{content:[{type:"output_text",text:JSON.stringify({reply:"What time did you arrive today? Your clock-out is already recorded.",escalate:false,draft:null})}]}]}));
 });
 assert.equal(chatCalls,1);
 const own=await assistantChatStatuses(prisma,employee,[chat.id]);assert.match(own.get(chat.id)!.reply!,/What time/);
 const foreign=await assistantChatStatuses(prisma,other,[chat.id]);assert.equal(foreign.size,0);
 const adminView=await assistantChatStatuses(prisma,admin,[chat.id]);assert.equal(adminView.get(chat.id)!.status,"READY");assert.equal(adminView.get(chat.id)!.reply,null);
 const followup=await prisma.teamMessage.create({data:{authorId:employee.id,authorName:employee.name,body:"11 am"}});
 const followupTurn=await prisma.$transaction(tx=>queueAssistantChat(tx,employee,followup));assert.ok(followupTurn);
 await processAssistantTurn(followupTurn.id,async(_url,options)=>{
  const input=JSON.parse(JSON.parse(String(options?.body)).input);
  assert.ok(input.context.previousPrivateMessages.some((m:{body:string})=>m.body===chat.body));
  return new Response("denied",{status:401});
 });
 assert.match((await prisma.assistantTurn.findUniqueOrThrow({where:{id:followupTurn.id}})).reply!,/API key/);
 const removed=await prisma.teamMessage.create({data:{authorId:employee.id,authorName:employee.name,body:"Deleted",deletedAt:new Date()}});
 const removedTurn=await prisma.$transaction(tx=>queueAssistantChat(tx,employee,removed));assert.ok(removedTurn);
 await processAssistantTurn(removedTurn.id,async()=>{throw new Error("Deleted message must not call AI");});
 assert.equal((await prisma.assistantTurn.findUniqueOrThrow({where:{id:removedTurn.id}})).status,"DISMISSED");
 const inactive=await prisma.user.update({where:{id:other.id},data:{active:false}});
 const blocked=await prisma.assistantTurn.create({data:{userId:inactive.id,source:"DIRECT",sourceKey:"blocked",body:"Help"}});
 await processAssistantTurn(blocked.id,fetcher);assert.equal(calls,1);
 console.log("PASS: migrations, private context, request confirmation/ownership, idempotency, pending approvals, no attendance mutation, notification capture/deduplication/no loops, provider failure, inactive accounts, Team Chat capture, private inline status, opposite-punch context, follow-up context and deleted messages.");
 }finally{await prisma.$disconnect();rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
