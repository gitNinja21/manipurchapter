import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {hash} from 'bcryptjs';
import {SignJWT} from 'jose/jwt/sign';
import {weekDates} from '../src/lib/weeklySchedulePolicy';
import {weekStart} from '../src/lib/reporting';
async function main(){
 const dir=mkdtempSync(join(tmpdir(),'mc-weekly-'));writeFileSync(join(dir,'test.db'),'');
 Object.assign(process.env,{DATABASE_URL:`file:${join(dir,'test.db')}`,UPLOADS_DIR:join(dir,'uploads'),JWT_SECRET:'weekly-test-only',OPENAI_API_KEY:'',ANNOUNCEMENT_SMS_ENABLED:'false',ANNOUNCEMENT_VOICE_ENABLED:'false',ATTENDANCE_SMS_ENABLED:'false',ANALYTICS_FORECAST_ENABLED:'false',ATTENDANCE_REMINDERS_ENABLED:'false',RESTAURANT_LAT:'26.158283',RESTAURANT_LNG:'91.782532'});
 const migration=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);
 const {prisma}=await import('../src/lib/prisma'),{todayWorkDate}=await import('../src/lib/time');
 const {reconcileMissingClockOut}=await import('../src/lib/missingPunchServer');
 const date=todayWorkDate(),week=weekStart(date),cookies:Record<string,string>={};
 const descriptor=Array(128).fill(0),photo=`data:image/jpeg;base64,${Buffer.alloc(120,7).toString('base64')}`;
 const startMinute=Math.min(14*60,Math.max(0,Math.floor((Date.now()-Date.parse(`${date}T00:00:00+05:30`))/60000)-60));
 const fmt=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
 const days=Object.fromEntries(weekDates(date).map(d=>[d,{start:fmt(startMinute),end:fmt(startMinute+540)}]));
 const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3197'],{env:process.env,stdio:['ignore','pipe','pipe']});let logs='';server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
 const request=(actor:string,path:string,body?:unknown,method?:string)=>fetch(`http://127.0.0.1:3197${path}`,{method:method??(body?'POST':'GET'),headers:{cookie:cookies[actor]??'','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const expect=async(actor:string,path:string,body:unknown,status:number)=>{const r=await request(actor,path,body);assert.equal(r.status,status,await r.clone().text());return r;};
 try{
  for(const id of ['ADMIN','A','B','C','D','E','LEDGER']){const role=id==='ADMIN'?'ADMIN':'EMPLOYEE';await prisma.user.create({data:{id,employeeCode:id,name:id,passwordHash:await hash('WeeklyTest123!',4),role,approved:true,mustChangePassword:false,faceDescriptor:JSON.stringify(descriptor),createdAt:new Date('2026-10-01'),hourlyRateRs:50}});cookies[id]=`mc_session=${await new SignJWT({userId:id,role,authVersion:0,approved:true,mustChangePassword:false}).setProtectedHeader({alg:'HS256'}).setExpirationTime('1h').sign(new TextEncoder().encode(process.env.JWT_SECRET))}`;}
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:3197/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready,logs);
  const payload={photoDataUrl:photo,descriptor,lat:26.158283,lng:91.782532};
  await expect('anon','/api/employee/weekly-schedule',undefined,403);
  await expect('ADMIN','/api/employee/weekly-schedule',undefined,403);
  await expect('A','/api/attendance/clock-in',payload,409);
  await expect('B','/api/attendance/clock-out',payload,409);
  await expect('A','/api/employee/weekly-schedule',{week,days:{...days,[date]:{start:'10:00',end:'20:00'}},revision:0},400);
  for(const actor of ['A','B'])await expect(actor,'/api/employee/weekly-schedule',{week,days,revision:0},200);
  await expect('A','/api/employee/weekly-schedule',{week,days,revision:0},409);
  const currentChanged={...days,[date]:{start:fmt(startMinute===600?660:600),end:fmt((startMinute===600?660:600)+540)}};
  await expect('A','/api/employee/weekly-schedule',{week,days:currentChanged,revision:1},400);
  const future=weekDates(date).find(d=>d>date);
  if(future){await expect('A','/api/employee/weekly-schedule',{week,days:{...days,[future]:{start:'11:00',end:'20:00'}},revision:1},200);}
  const calendar=await expect('ADMIN',`/api/team/schedule?from=${week}&to=${weekDates(date)[5]}`,undefined,200);
  const calendarData=await calendar.json();assert.ok(calendarData.shifts.some((s:{id:string;userId:string})=>s.id.startsWith('weekly:')&&s.userId==='A'));
  const ownCalendar=await expect('A',`/api/team/schedule?from=${week}&to=${weekDates(date)[5]}`,undefined,200);
  assert.ok((await ownCalendar.json()).shifts.every((s:{userId:string})=>s.userId==='A'));
  const jobs=await prisma.announcementSms.findMany();assert.ok(jobs.length>=4);assert.ok(jobs.every(j=>j.userId===null&&j.status==='NOT_CONFIGURED'));
  await expect('A','/api/attendance/clock-in',payload,200);
  await expect('A','/api/attendance/clock-out',payload,200);
  await expect('B','/api/attendance/clock-out',payload,200);
  const b=await prisma.attendanceRecord.findUniqueOrThrow({where:{userId_workDate:{userId:'B',workDate:date}}});
  assert.equal(b.missingPunch,'IN');assert.equal(b.clockInPhoto,null);assert.equal(b.clockOutFaceMatch,true);assert.ok(b.clockOutPhoto);
  await expect('B','/api/attendance/clock-out',payload,409);
  await expect('ADMIN','/api/admin/attendance/manual',{userId:'B',workDate:date,clockInAt:b.clockInAt!.toISOString(),clockOutAt:b.clockOutAt!.toISOString(),unpaidBreakMinutes:0,expectedRecordId:b.id,expectedUpdatedAt:b.updatedAt.toISOString(),expectedDayRevision:0,reason:'Verified system issue, waive missing punch',waiveMissingPunch:true},200);
  assert.equal((await prisma.attendanceRecord.findUniqueOrThrow({where:{id:b.id}})).missingPunchWaived,true);
  for(const actor of ['C','D','E'])await expect(actor,'/api/employee/weekly-schedule',{week,days,revision:0},200);
  async function approve(id:string){const r=await request('ADMIN',`/api/team/requests/${id}`,{status:'APPROVED',physicalPresenceVerified:true,reviewNote:'Verified test selfie and presence'},'PATCH');assert.equal(r.status,200,await r.text());}
  const c=await expect('C','/api/attendance/location-fallback',{...payload,action:'out'},200);await approve((await c.json()).requestId);
  assert.equal((await prisma.attendanceRecord.findUniqueOrThrow({where:{userId_workDate:{userId:'C',workDate:date}}})).missingPunch,'IN');
  const d=await expect('D','/api/attendance/location-fallback',{...payload,action:'in'},200);
  await expect('D','/api/attendance/clock-out',payload,200);await approve((await d.json()).requestId);
  assert.equal((await prisma.attendanceRecord.findUniqueOrThrow({where:{userId_workDate:{userId:'D',workDate:date}}})).missingPunch,'NONE');
  await expect('E','/api/attendance/clock-in',payload,200);
  const e=await expect('E','/api/attendance/location-fallback',{...payload,action:'out'},200);
  await reconcileMissingClockOut('E',new Date(Date.parse(date)+86400000).toISOString().slice(0,10));
  await approve((await e.json()).requestId);
  assert.equal((await prisma.attendanceRecord.findUniqueOrThrow({where:{userId_workDate:{userId:'E',workDate:date}}})).missingPunch,'NONE');
  // Explicit reconciliation clock allows deterministic testing without waiting overnight.
  const at=(d:string,t:string)=>new Date(`${d}T${t}:00+05:30`);
  for(const d of ['2026-11-04','2026-11-05'])await prisma.attendanceRecord.create({data:{userId:'LEDGER',workDate:d,clockInAt:at(d,'11:00'),scheduledStartAt:at(d,'10:00'),scheduledEndAt:at(d,'19:00'),shiftDurationMinutes:540,unpaidBreakMinutes:0,paidBreakMinutes:60,policyVersion:3,approvalStatus:'PENDING'}});
  await prisma.attendanceRecord.create({data:{userId:'LEDGER',workDate:'2026-11-03',clockInAt:at('2026-11-03','10:00'),scheduledEndAt:at('2026-11-03','19:00')}});
  await reconcileMissingClockOut('LEDGER','2026-11-06');await reconcileMissingClockOut('LEDGER','2026-11-06');
  const ledger=await prisma.attendanceRecord.findMany({where:{userId:'LEDGER'}});assert.equal(ledger.find(r=>r.workDate==='2026-11-03')!.clockOutAt,null);
  assert.equal(ledger.filter(r=>r.missingPunch==='OUT').length,2);
  assert.equal(await prisma.attendanceAudit.count({where:{userId:'LEDGER',action:'MISSING_CLOCK_OUT_INFERRED'}}),2);
  const {salaryCredit}=await import('../src/lib/performance');assert.equal(salaryCredit(ledger.find(r=>r.workDate==='2026-11-04')!),8);
  await expect('B','/api/admin/payroll/pdf?from=2026-11-01&to=2026-11-30&userId=A',undefined,403);
  const pdf=await expect('ADMIN',`/api/admin/payroll/pdf?from=${date}&to=${date}&userId=B`,undefined,200);assert.equal(pdf.headers.get('content-type'),'application/pdf');
  if(process.argv.includes('--preview')){console.log('Preview: http://127.0.0.1:3197/ A / WeeklyTest123!');await new Promise<void>(resolve=>process.once("SIGINT",()=>resolve()));}
  console.log('PASS: migration, required weekly gate, 9h validation, future-only edits, admin SMS queue, normal punches, verified clock-out without clock-in, duplicate rejection, admin waiver, idempotent overnight reconciliation, historical preservation, delayed GPS approvals and PDF access.');
 }finally{server.kill();if(server.exitCode===null)await new Promise(r=>server.once('exit',r));await prisma.$disconnect();rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
