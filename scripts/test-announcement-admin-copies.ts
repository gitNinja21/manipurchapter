// Disposable SQLite database and mocked providers. No calls or SMS are sent.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
async function main(){
 const dir=mkdtempSync(join(tmpdir(),'mc-admin-copies-'));
 Object.assign(process.env,{DATABASE_URL:`file:${join(dir,'test.db')}`,ANNOUNCEMENT_SMS_ENABLED:'true',ANNOUNCEMENT_VOICE_ENABLED:'true',TWILIO_ACCOUNT_SID:'AC'+'0'.repeat(32),TWILIO_AUTH_TOKEN:'test-only',TWILIO_SMS_FROM:'+12232176231',TWILIO_VOICE_FROM:'+12232176231',TWILIO_MESSAGING_SERVICE_SID:'',ANNOUNCEMENT_SMS_BASE_URL:'https://example.test',ANNOUNCEMENT_VOICE_BASE_URL:'https://example.test'});
 const migrate=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(migrate.status,0,migrate.stderr);
 const {prisma}=await import('../src/lib/prisma');
 const {queueAnnouncementCalls,dispatchAnnouncementCalls,processVoiceCallback}=await import('../src/lib/announcementVoice');
 const {queueAnnouncementSms,dispatchAnnouncementSms}=await import('../src/lib/announcementSms');
 const {ADMIN_ANNOUNCEMENT_PHONES,withAdminCopies}=await import('../src/lib/announcementAdminCopies');
 try {
  await prisma.user.create({data:{id:'admin',name:'Admin',employeeCode:'ADMIN',role:'ADMIN',passwordHash:'unused',approved:true}});
  const employee=await prisma.user.create({data:{id:'selected',name:'Selected',employeeCode:'SELECTED',passwordHash:'unused',approved:true,phone:'+919876543210'}});
  await prisma.user.create({data:{id:'other',name:'Not selected',employeeCode:'OTHER',passwordHash:'unused',approved:true,phone:'+919876543211'}});
  const a=await prisma.announcement.create({data:{title:'Test',body:'Test only',authorId:'admin',audience:'SELECTED',sendSms:true,sendCall:true}});
  await prisma.$transaction(async tx=>{await queueAnnouncementCalls(tx,a.id,[employee]);await queueAnnouncementSms(tx,a.id,[employee]);});
  assert.equal(await prisma.announcementCall.count(),3);assert.equal(await prisma.announcementSms.count(),3);
  const calls:string[]=[],sms:string[]=[];
  await dispatchAnnouncementCalls(new Date(),async options=>{calls.push(String(options.to));return {sid:'CA'+calls.length};});
  await dispatchAnnouncementSms(new Date(),async options=>{sms.push(options.to);return {sid:'SM'+sms.length};});
  const expected=[employee.phone,...ADMIN_ANNOUNCEMENT_PHONES].sort();assert.deepEqual(calls.sort(),expected);assert.deepEqual(sms.sort(),expected);
  await dispatchAnnouncementCalls(new Date(),async()=>{throw Error('duplicate call')});await dispatchAnnouncementSms(new Date(),async()=>{throw Error('duplicate SMS')});
  const job=await prisma.announcementCall.findFirstOrThrow({where:{userId:null}});
  assert.equal(await processVoiceCallback(job.attemptKey!,'ack',{To:job.phone!,CallSid:job.callSid!,Digits:'1'}),true);
  assert.equal((await prisma.announcementCall.findUniqueOrThrow({where:{id:job.id}})).status,'ACKNOWLEDGED');assert.equal(await prisma.announcementAck.count(),0);
  const invalid=await prisma.announcementCall.create({data:{announcementId:a.id,phone:'+919876543299'}});
  await dispatchAnnouncementCalls(new Date(),async()=>{throw Error('unapproved contact')});assert.equal((await prisma.announcementCall.findUniqueOrThrow({where:{id:invalid.id}})).status,'SKIPPED');
  assert.equal(withAdminCopies([{id:'same',phone:ADMIN_ANNOUNCEMENT_PHONES[0]}]).length,2);
  console.log('PASS: selected recipients plus both admins; dispatch, no repeats, independent acknowledgement, allowlist and phone deduplication.');
 }finally{await prisma.$disconnect();rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
