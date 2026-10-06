// Disposable SQLite + real local HTTP routes + fake transports. No live calls/SMS.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { SignJWT } from "jose/jwt/sign";
import twilio from "twilio";
import webpush from "web-push";
async function main() {
  const directory=mkdtempSync(join(tmpdir(),"mc-targeted-")), file=join(directory,"test.db");writeFileSync(file,"");
  Object.assign(process.env,{DATABASE_URL:`file:${file}`,JWT_SECRET:"targeted-isolated-test",ANNOUNCEMENT_VOICE_ENABLED:"false",ANNOUNCEMENT_SMS_ENABLED:"false",ATTENDANCE_SMS_ENABLED:"false",ATTENDANCE_REMINDERS_ENABLED:"false",AUTO_CLOCK_OUT_ENABLED:"false",VAPID_PUBLIC_KEY:"",VAPID_PRIVATE_KEY:"",TWILIO_ACCOUNT_SID:`AC${"a".repeat(32)}`,TWILIO_AUTH_TOKEN:"isolated-test",TWILIO_SMS_FROM:"+14155551234",TWILIO_VOICE_FROM:"+14155551234",TWILIO_MESSAGING_SERVICE_SID:"",ANNOUNCEMENT_SMS_BASE_URL:"https://example.test",ANNOUNCEMENT_VOICE_BASE_URL:"https://example.test"});
  const migration=spawnSync(process.execPath,["node_modules/prisma/build/index.js","migrate","deploy"],{env:process.env,encoding:"utf8"});assert.equal(migration.status,0,migration.stderr);
  const {prisma}=await import("../src/lib/prisma");
  const {dispatchAnnouncementSms,processAnnouncementSmsCallback}=await import("../src/lib/announcementSms");
  const {dispatchAnnouncementCalls}=await import("../src/lib/announcementVoice");
  const {POST:callback}=await import("../src/app/api/sms/announcements/[key]/route");
  const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p","3198","-H","127.0.0.1"],{env:process.env,stdio:["ignore","pipe","pipe"]});
  let logs="";server.stdout.on("data",d=>logs+=d);server.stderr.on("data",d=>logs+=d);
  const cookies:Record<string,string>={};
  const request=async(user:string,path:string,body?:unknown,method=body===undefined?"GET":"POST")=>fetch(`http://127.0.0.1:3198${path}`,{method,headers:{cookie:cookies[user] || "","content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
  try {
    for(const [id,role,active] of [["admin","ADMIN",true],["a","EMPLOYEE",true],["b","EMPLOYEE",true],["inactive","EMPLOYEE",false]] as const) {
      await prisma.user.create({data:{id,name:id,employeeCode:id,passwordHash:"unused",role,active,approved:true,mustChangePassword:false,phone:id==="b"?"9876543211":"9876543210"}});
      cookies[id]=`mc_session=${await new SignJWT({userId:id,authVersion:0,role,approved:true,mustChangePassword:false}).setProtectedHeader({alg:"HS256"}).setExpirationTime("1h").sign(new TextEncoder().encode(process.env.JWT_SECRET))}`;
    }
    let ready=false;
    for(let i=0;i<100;i++){try{if((await fetch("http://127.0.0.1:3198/api/health")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
    assert.ok(ready,logs);
    const draft={title:"Private message",body:"Please meet at 4 pm.",audience:"SELECTED",recipientIds:["a"],sendSms:true,sendCall:true};
    assert.equal((await request("b","/api/announcements",draft)).status,403);
    for(const recipientIds of [[],["admin"],["inactive"],["missing"]]) assert.equal((await request("admin","/api/announcements",{...draft,recipientIds})).status,400);
    assert.equal((await request("admin","/api/announcements",{...draft,body:"x".repeat(1501)})).status,400);
    const created=await request("admin","/api/announcements",draft);assert.equal(created.status,200);
    const {announcement}=await created.json();const id=announcement.id;
    assert.equal(await prisma.announcementRecipient.count({where:{announcementId:id}}),1);
    assert.equal(await prisma.announcementCall.count({where:{announcementId:id}}),1);
    assert.equal(await prisma.announcementSms.count({where:{announcementId:id}}),1);
    assert.equal((await prisma.announcementSms.findFirstOrThrow()).status,"NOT_CONFIGURED");
    assert.equal(await prisma.notification.count({where:{userId:"b",entityKey:id}}),0);
    assert.equal((await (await request("b","/api/announcements")).json()).total,0);
    assert.equal((await request("b",`/api/announcements/${id}/detail`)).status,404);
    assert.equal((await request("b",`/api/announcements/${id}/ack`,{})).status,404);
    assert.equal((await request("b",`/api/announcements/${id}/ack`)).status,403);
    assert.equal((await request("b","/api/announcements/recipients")).status,403);
    assert.equal((await request("a",`/api/announcements/${id}/detail`)).status,200);
    assert.equal((await request("a",`/api/announcements/${id}/ack`,{})).status,200);
    const report=await (await request("admin",`/api/announcements/${id}/ack`)).json();assert.deepEqual(report.people.map((p:{id:string})=>p.id),["a"]);
    // Legacy remains public; new all-employee messages snapshot the audience.
    await prisma.announcement.create({data:{title:"Old",body:"Old",authorId:"admin"}});
    assert.equal((await (await request("b","/api/announcements")).json()).total,1);
    const all=await (await request("admin","/api/announcements",{...draft,audience:"ALL",recipientIds:[],sendSms:false,sendCall:false})).json();
    assert.equal(await prisma.announcementRecipient.count({where:{announcementId:all.announcement.id}}),2);
    assert.equal(await prisma.announcementSms.count({where:{announcementId:all.announcement.id}}),0);
    assert.equal(await prisma.announcementCall.count({where:{announcementId:all.announcement.id}}),0);
    await prisma.user.create({data:{id:"later",name:"Later",employeeCode:"later",passwordHash:"unused",approved:true,mustChangePassword:false}});
    const {announcementWhere}=await import("../src/lib/announcementAudience");
    assert.equal(await prisma.announcement.count({where:announcementWhere({id:"later",role:"EMPLOYEE"})}),1);
    // Browser push only follows scoped notifications.
    for(const userId of ["a","b"]) await prisma.pushSubscription.create({data:{userId,endpoint:`https://fcm.googleapis.com/${userId}`,auth:"test",p256dh:"test"}});
    Object.assign(process.env,{VAPID_PUBLIC_KEY:"test",VAPID_PRIVATE_KEY:"test",VAPID_SUBJECT:"mailto:test@example.test"});
    const targets:string[]=[];webpush.sendNotification=(async subscription=>{targets.push(subscription.endpoint);return {statusCode:201,body:"",headers:{}};}) as typeof webpush.sendNotification;
    const {sendAnnouncementPush}=await import("../src/lib/push");await sendAnnouncementPush(id);assert.deepEqual(targets,["https://fcm.googleapis.com/a"]);
    // Enable only in this test process, with fake delivery. The HTTP server stays disabled.
    process.env.ANNOUNCEMENT_SMS_ENABLED="true";process.env.ANNOUNCEMENT_VOICE_ENABLED="true";
    await prisma.announcementAck.deleteMany({where:{announcementId:id}});
    await prisma.announcementSms.updateMany({where:{announcementId:id},data:{status:"QUEUED"}});
    await prisma.announcementCall.updateMany({where:{announcementId:id},data:{status:"QUEUED"}});
    let calls=0,sends=0;
    const sms=await prisma.announcementSms.findFirstOrThrow({where:{announcementId:id}});
    const sid=`SM${"b".repeat(32)}`;
    const send=async(options:{to:string;body:string})=>{sends++;assert.equal(options.to,"+919876543210");assert.ok(options.body.includes(draft.body));
      // A callback can arrive before the API response. Provider queued must NOT requeue locally.
      await processAnnouncementSmsCallback(sms.id,{To:options.to,MessageSid:sid,MessageStatus:"queued"});return {sid};};
    await Promise.all([dispatchAnnouncementSms(new Date(),send),dispatchAnnouncementSms(new Date(),send)]);
    await dispatchAnnouncementSms(new Date(),send);assert.equal(sends,1);
    assert.equal((await prisma.announcementSms.findUniqueOrThrow({where:{id:sms.id}})).status,"PROVIDER_QUEUED");
    await dispatchAnnouncementCalls(new Date(Date.now()+1000),async options=>{calls++;assert.equal(options.to,"+919876543210");return {sid:`CA${"c".repeat(32)}`};});assert.equal(calls,1);
    const fields={To:sms.phone!,AccountSid:process.env.TWILIO_ACCOUNT_SID!,MessageSid:sid,MessageStatus:"delivered"};
    const url=`https://example.test/api/sms/announcements/${sms.id}`;
    const callbackRequest=(signature:string)=>new Request(url,{method:"POST",headers:{"x-twilio-signature":signature},body:new URLSearchParams(fields)});
    assert.equal((await callback(callbackRequest("bad"),{params:Promise.resolve({key:sms.id})})).status,403);
    const signature=twilio.getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN!,url,fields);
    assert.equal((await callback(callbackRequest(signature),{params:Promise.resolve({key:sms.id})})).status,204);
    await processAnnouncementSmsCallback(sms.id,{...fields,MessageStatus:"sent"});
    assert.equal((await prisma.announcementSms.findUniqueOrThrow({where:{id:sms.id}})).status,"DELIVERED");
    assert.equal(await prisma.announcementAck.count({where:{announcementId:id}}),0);
    assert.equal(await processAnnouncementSmsCallback(sms.id,{...fields,To:"+919876543211"}),false);
    // An uncertain send is not retried.
    await prisma.announcementSms.update({where:{id:sms.id},data:{status:"QUEUED",messageSid:null}});
    const fail=async()=>{sends++;throw new Error("timeout");};await dispatchAnnouncementSms(new Date(),fail);await dispatchAnnouncementSms(new Date(),fail);assert.equal(sends,2);
    assert.equal((await prisma.announcementSms.findUniqueOrThrow({where:{id:sms.id}})).status,"UNKNOWN");
    assert.equal((await request("admin",`/api/announcements/${id}`,undefined,"DELETE")).status,200);
    assert.equal(await prisma.announcementSms.count({where:{announcementId:id}}),0);
    assert.equal(await prisma.announcementRecipient.count({where:{announcementId:id}}),0);
    console.log("Targeted announcement integration passed: private list/detail/ack, scoped notifications/push/calls/SMS, legacy visibility, all snapshot, channel controls, signatures, callback ordering and no resend.");
  } finally {
    server.kill("SIGTERM");await new Promise<void>(resolve=>{if(server.exitCode!==null)resolve();else server.once("exit",()=>resolve());});
    await prisma.$disconnect();rmSync(directory,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
