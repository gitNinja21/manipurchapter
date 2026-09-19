// Disposable database and test-only process clock; production has no clock override.
// Run after npm run build: node scripts/test-work-rules.mjs
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const dir = await mkdtemp(path.join(tmpdir(), 'mc-work-rules-'));
const url = `file:${dir}/rules-test.sqlite`;
await writeFile(path.join(dir,'rules-test.sqlite'), '');
const clockPath = path.join(dir,'clock.txt');
const setTime = value => writeFile(clockPath, String(+new Date(value)));
await setTime('2026-09-19T09:00:00+05:30');
const preload = path.join(dir,'clock.cjs');
await writeFile(preload, `const fs=require('node:fs'); const RealDate=Date; const now=()=>Number(fs.readFileSync(${JSON.stringify(clockPath)},'utf8')); global.Date=class extends RealDate { constructor(...args){ if(args.length)super(...args); else super(now()); } static now(){return now();} static parse(value){return RealDate.parse(value);} static UTC(...args){return RealDate.UTC(...args);} };`);
const env = {...process.env, DATABASE_URL:url, JWT_SECRET:'isolated-work-rules-test-secret', UPLOADS_DIR:path.join(dir,'uploads'), RESTAURANT_LAT:'0',RESTAURANT_LNG:'0',RESTAURANT_RADIUS_METERS:'200',VAPID_PUBLIC_KEY:'',VAPID_PRIVATE_KEY:''};
const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js','migrate','deploy'],{env,encoding:'utf8'});
assert.equal(migration.status,0,dir+'\n'+migration.stdout+'\n'+migration.stderr);
const db = new PrismaClient({datasources:{db:{url}}});
let server;
let logs='';
const base='http://127.0.0.1:3104';
const additional = [
 ['cmu5ag8ce000395shnlmls7ln','ANGAI','13:00','22:30',8.5],
 ['cmu5adpin000295shn82n6p47','RCHETAN','13:00','22:30',8.5],
 ['cmu5cokep000495shpehjvqai','DINJANA','12:00','21:00',8],
 ['cmu5ctlgj000795sh8a4rawn1','JOYSHREE CHANU','10:00','19:00',8],
 ['cmu5abali000095sh62r5yttk','SAGAR12/12/25','13:00','22:30',8.5],
 ['cmu5acmqw000195sht77e1cok','VICKY','12:30','22:30',9],
];
const request=async(cookie,route,method='GET',body)=>{
 const r=await fetch(base+route,{method,headers:{cookie,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual'});
 const data=await r.json();return {status:r.status,data};
};
const ok=async(...args)=>{const r=await request(...args);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
const photo={photoDataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',descriptor:Array(128).fill(0),lat:0,lng:0};
try {
 const passwordHash=await bcrypt.hash('Test-only-work-rules-123',4);
 for(const [id,code,name,role] of [['admin','RULEADMIN','Test Admin','ADMIN'],['g','GOKUL','Test Gokul','EMPLOYEE'],['r','RONYAMZ','Test Robinson','EMPLOYEE'],['n','NIJULI','Test Nijuli','EMPLOYEE'],['h','HINGNAMBE NEWME','Test Hignam','EMPLOYEE'],['other','OTHER','Test Other','EMPLOYEE']]){
  await db.user.create({data:{id,employeeCode:code,name,role,passwordHash,active:true,approved:true,mustChangePassword:false,faceDescriptor:JSON.stringify(photo.descriptor),createdAt:new Date('2026-09-01T00:00:00Z')}});
 }
 // Verify the exact migration rollout selector, including exclusion of others.
 const sql=await readFile('prisma/migrations/20260919120000_work_rules/migration.sql','utf8');
 await db.$executeRawUnsafe(sql.slice(sql.indexOf('UPDATE "User"')));
 assert.equal(await db.user.count({where:{attendancePolicyFrom:'2026-09-19'}}),4);
 assert.equal((await db.user.findUnique({where:{id:'other'}})).attendancePolicyFrom,null);
 for (const [id, code] of additional) await db.user.create({data:{id,employeeCode:code,name:`Test ${code}`,role:'EMPLOYEE',passwordHash,active:true,approved:true,mustChangePassword:false,faceDescriptor:JSON.stringify(photo.descriptor),createdAt:new Date('2026-09-01T00:00:00Z')}});
 const scheduleSql=await readFile('prisma/migrations/20260919130000_employee_schedules/migration.sql','utf8');
 for (const update of scheduleSql.split('\n').filter(line=>line.startsWith('UPDATE "User"'))) await db.$executeRawUnsafe(update);
 assert.equal(await db.user.count({where:{attendancePolicyFrom:'2026-09-19'}}),10);
 const departures=await readFile('prisma/migrations/20260919160000_departure_deadlines/migration.sql','utf8');
 for(const statement of departures.split(';').filter(x=>x.includes('UPDATE'))) await db.$executeRawUnsafe(statement);
 assert.equal((await db.user.findUnique({where:{id:'n'}})).attendanceEndMinute,1140);
 assert.equal((await db.user.findUnique({where:{id:'r'}})).attendanceEndMinute,1200);

 for (const [id,code] of [['cmu5dihu2000a95shpwsbfh0j','LACHIT'],['cmu5dgdgf000995sh4n7sv3cz','PANKAJ'],['cmu5cut44000895sh1vc465mm','TOKI']]) await db.user.create({data:{id,employeeCode:code,name:`Test ${code}`,passwordHash,active:true,approved:true,mustChangePassword:false,faceDescriptor:JSON.stringify(photo.descriptor),createdAt:new Date('2026-09-01T00:00:00Z')}});
 const unified=await readFile('prisma/migrations/20260919200000_clock_duration_policy/migration.sql','utf8');
 for(const statement of unified.split(';').filter(x=>x.trim().startsWith('UPDATE'))) await db.$executeRawUnsafe(statement);
 assert.equal(await db.user.count({where:{attendancePolicyFrom:'2026-09-19'}}),13);
 const weekend=await readFile('prisma/migrations/20260919210000_weekend_schedule_and_recalculation/migration.sql','utf8');
 for(const statement of weekend.split(';').filter(x=>x.trim().startsWith('UPDATE'))) await db.$executeRawUnsafe(statement);


 server=spawn(process.execPath,['--require',preload,'node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3104'],{env,stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
 for(let i=0;i<60;i++){
  try {const r=await fetch(base);if(r.ok)break;}catch{}
  if(i===59)throw Error('Test server did not start: '+logs);
  await new Promise(r=>setTimeout(r,250));
 }
 const login=async(employeeCode)=>{const res=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({employeeCode,password:'Test-only-work-rules-123'})});assert.equal(res.status,200);return res.headers.get('set-cookie').split(';')[0];};
 const admin=await login('RULEADMIN'),g=await login('GOKUL'),r=await login('RONYAMZ'),n=await login('NIJULI'),h=await login('HINGNAMBE NEWME'),other=await login('OTHER');
 assert.equal((await request(g,'/api/attendance/clock-in','POST',photo)).status,403);
 assert.equal((await ok(g,'/api/attendance/today')).arrivalState,'EARLY');
 await setTime('2026-09-19T09:30:00+05:30');
 const gr=(await ok(g,'/api/attendance/clock-in','POST',photo)).record;
 assert.equal(gr.unpaidBreakMinutes,0);assert.equal(gr.policyVersion,2);
 await ok(n,'/api/attendance/clock-in','POST',photo);
 await ok(h,'/api/attendance/clock-in','POST',photo);
 await setTime('2026-09-19T10:31:00+05:30');
 const late=(await ok(r,'/api/team/requests','POST',{kind:'LATE_ARRIVAL',fromDate:'2026-09-19',reason:'Delayed bus'})).request;
 assert.equal((await request(other,`/api/team/requests/${late.id}`,'PATCH',{status:'APPROVED'})).status,403);
 await ok(admin,`/api/team/requests/${late.id}`,'PATCH',{status:'APPROVED'});
 const rr=(await ok(r,'/api/attendance/clock-in','POST',photo)).record;
 assert.equal(rr.lateArrivalRequestId,late.id);
 assert.equal(rr.clockInAt,new Date('2026-09-19T10:31:00+05:30').toISOString());
 const legacy=(await ok(other,'/api/attendance/clock-in','POST',photo)).record;
 assert.equal(legacy.unpaidBreakMinutes,0);assert.equal(legacy.extraTimeCutoff,new Date('2026-09-19T19:31:00+05:30').toISOString());
 assert.equal((await request(other,'/api/team/requests','POST',{kind:'LATE_ARRIVAL',fromDate:'2026-09-20',reason:'Not covered'})).status,400);
 for (const [id,code,start,end,net] of additional) {
   const cookie=await login(code);
   const startDate=new Date(`2026-09-19T${start}:00+05:30`);
   await setTime(new Date(+startDate+60000).toISOString());
   await setTime(startDate.toISOString());
   const status=await ok(cookie,'/api/attendance/today');
   assert.equal(status.arrivalState,'ON_TIME');assert.equal(status.schedule.fixed,true);assert.equal(status.schedule.allowEarly,true);
   const clocked=(await ok(cookie,'/api/attendance/clock-in','POST',photo)).record;
   assert.equal(clocked.unpaidBreakMinutes,0);
   const endDate=new Date(+startDate + 9*3600000);
   assert.equal(clocked.extraTimeCutoff,endDate.toISOString());
   await setTime(new Date(+endDate+1000).toISOString());
   const blocked=await request(cookie,'/api/attendance/clock-out','POST',photo);
   assert.equal(blocked.data.code,'EXTRA_TIME_REASON_REQUIRED');
   await setTime(endDate.toISOString());
   await ok(cookie,'/api/attendance/clock-out','POST',photo);
   await ok(admin,`/api/admin/attendance/${clocked.id}`,'PATCH',{approvalStatus:'APPROVED'});
   const earned=(await ok(admin,'/api/admin/stats?from=2026-09-19&to=2026-09-19')).stats.find(s=>s.userId===id);
   assert.equal(earned.totalHours,8);assert.equal(earned.regularPayRs,900);assert.equal(earned.overtimeHours,0);
 }

 await setTime('2026-09-19T18:30:00+05:30');
 const nr=(await ok(n,'/api/attendance/clock-out','POST',photo)).record;
 assert.equal(nr.extraTimeStatus,'NOT_REQUIRED');
 await ok(admin,`/api/admin/attendance/${nr.id}`,'PATCH',{approvalStatus:'APPROVED'});
 let stats=(await ok(admin,'/api/admin/stats?from=2026-09-19&to=2026-09-19')).stats;
 assert.equal(stats.find(s=>s.userId==='n').totalHours,8);
 assert.equal(stats.find(s=>s.userId==='n').regularPayRs,900);
 await setTime('2026-09-19T22:30:01+05:30');
 assert.equal((await request(g,'/api/attendance/clock-out','POST',photo)).data.code,'EXTRA_TIME_REASON_REQUIRED');
 assert.equal((await db.attendanceRecord.findUnique({where:{id:gr.id}})).clockOutAt,null);
 await setTime('2026-09-19T23:30:00+05:30');
 await ok(g,'/api/attendance/clock-out','POST',{...photo,extraTimeReason:'Served the last table'});
 let extra=await db.staffRequest.findFirst({where:{userId:'g',kind:'EXTRA_TIME',status:'PENDING'}});
 assert.ok(extra);
 assert.equal((await request(g,`/api/team/requests/${extra.id}`,'PATCH',{status:'CANCELLED'})).status,409);
 assert.equal((await request(admin,`/api/admin/attendance/${gr.id}`,'PATCH',{approvalStatus:'APPROVED'})).status,409);
 assert.equal((await request(admin,`/api/admin/attendance/${gr.id}/preview?status=APPROVED`)).status,409);
 await ok(admin,`/api/team/requests/${extra.id}`,'PATCH',{status:'REJECTED',reviewNote:'Extra time not authorised'});
 await ok(admin,`/api/admin/attendance/${gr.id}`,'PATCH',{approvalStatus:'APPROVED'});
 stats=(await ok(admin,'/api/admin/stats?from=2026-09-19&to=2026-09-19')).stats;
 assert.equal(stats.find(s=>s.userId==='g').totalHours,8);
 assert.equal(stats.find(s=>s.userId==='g').overtimeHours,0);
 assert.equal((await db.attendanceRecord.findUnique({where:{id:gr.id}})).clockOutAt.toISOString(),new Date('2026-09-19T23:30:00+05:30').toISOString());
 // Overnight clock-out remains attached to the original work date.
 await setTime('2026-09-20T00:30:00+05:30');
 assert.equal((await ok(h,'/api/attendance/today')).record.workDate,'2026-09-19');
 const hr=(await ok(h,'/api/attendance/clock-out','POST',{...photo,extraTimeReason:'Closing and cleaning after late guests'})).record;
 extra=await db.staffRequest.findFirst({where:{userId:'h',kind:'EXTRA_TIME',status:'PENDING'}});
 await ok(admin,`/api/team/requests/${extra.id}`,'PATCH',{status:'APPROVED'});
 await ok(admin,`/api/admin/attendance/${hr.id}`,'PATCH',{approvalStatus:'APPROVED'});
 stats=(await ok(admin,'/api/admin/stats?from=2026-09-19&to=2026-09-19')).stats;
 assert.equal(stats.find(s=>s.userId==='h').totalHours,14);
 assert.equal(stats.find(s=>s.userId==='h').overtimeHours,6);
 assert.equal(await db.attendanceAudit.count({where:{action:{in:['EXTRA_TIME_APPROVED','EXTRA_TIME_REJECTED']}}}),2);
 // Corrections cannot silently bypass break and after-hours review.
 const correction=(await ok(n,'/api/team/requests','POST',{kind:'CORRECTION',fromDate:'2026-09-19',reason:'Actual leaving time was later',proposedIn:'2026-09-19T09:30:00+05:30',proposedOut:'2026-09-19T23:00:00+05:30'})).request;
 await ok(admin,`/api/team/requests/${correction.id}`,'PATCH',{status:'APPROVED'});
 const corrected=await db.attendanceRecord.findUnique({where:{id:nr.id}});
 assert.equal(corrected.unpaidBreakMinutes,0);assert.equal(corrected.extraTimeStatus,'PENDING');assert.equal(corrected.approvalStatus,'PENDING');
 assert.equal(await db.staffRequest.count({where:{userId:'n',kind:'EXTRA_TIME',status:'PENDING'}}),1);
 const recurrence=await ok(g,'/api/team/schedule?from=2026-09-19&to=2026-09-20');assert.equal(recurrence.recurring.length,1);assert.equal(recurrence.recurring[0].id,'g');
 assert.equal((await ok(admin,'/api/team/schedule?from=2026-09-19&to=2026-09-20')).recurring.length,13);
 await setTime('2026-09-20T11:00:00+05:30');
 const nextDay=(await ok(g,'/api/attendance/clock-in','POST',photo)).record;
 assert.equal(nextDay.lateArrivalRequestId,null); // no previous-day exception reuse
 assert.equal((await request(r,'/api/attendance/clock-out','POST',{...photo,extraTimeReason:'Forgot yesterday'})).status,409); // >24h needs correction

 // Newly assigned employees get the standard rolling finish.
 for (const code of ['LACHIT','PANKAJ']) {
   const cookie=await login(code);
   await setTime('2026-09-20T10:00:00+05:30');
   const rec=(await ok(cookie,'/api/attendance/clock-in','POST',photo)).record;
   assert.equal(rec.scheduledStartAt,new Date('2026-09-20T10:00:00+05:30').toISOString());
   assert.equal(rec.scheduledEndAt,new Date('2026-09-20T19:00:00+05:30').toISOString());
 }

 const dinjana=await login('DINJANA');
 for(const [date,expected] of [['2026-09-20','12:00'],['2026-09-22','11:30']]) {
   await setTime(`${date}T11:30:00+05:30`);
   assert.ok((await ok(dinjana,'/api/attendance/today')).schedule.latest.includes(expected));
 }
 const monday=(await ok(admin,'/api/admin/stats?from=2026-09-21&to=2026-09-21')).stats.find(x=>x.userId===additional[2][0]);
 assert.equal(monday.offDaysPayRs,900);
 const toki=await login('TOKI'), tokiId='cmu5cut44000895sh1vc465mm';
 await setTime('2026-09-24T13:00:00+05:30');
 assert.equal((await ok(toki,'/api/attendance/today')).arrivalState,'OFF');
 assert.equal((await request(toki,'/api/attendance/clock-in','POST',photo)).status,403);
 for (const [day,start,end,duration,breakMin,pay,bonus] of [
   ['2026-09-25','13:00','20:00',420,60,600,0],
   ['2026-09-26','11:00','20:00',540,0,900,0],
   ['2026-09-27','11:00','19:00',540,0,800,0],
   ['2026-10-02','13:00','21:00',420,60,600,1],
 ]) {
   await setTime(`${day}T${start}:00+05:30`);
   const rec=(await ok(toki,'/api/attendance/clock-in','POST',photo)).record;
   assert.equal(rec.shiftDurationMinutes,duration);assert.equal(rec.unpaidBreakMinutes,breakMin);
   await setTime(`${day}T${end}:00+05:30`);
   if(bonus) assert.equal((await request(toki,'/api/attendance/clock-out','POST',photo)).data.code,'EXTRA_TIME_REASON_REQUIRED');
   await ok(toki,'/api/attendance/clock-out','POST',{...photo,extraTimeReason:'Serving additional guests'});
   if(bonus) {
     const review=await db.staffRequest.findFirst({where:{userId:tokiId,kind:'EXTRA_TIME',fromDate:day,status:'PENDING'}});
     await ok(admin,`/api/team/requests/${review.id}`,'PATCH',{status:'APPROVED'});
   }
   await ok(admin,`/api/admin/attendance/${rec.id}`,'PATCH',{approvalStatus:'APPROVED'});
   const earnings=(await ok(admin,`/api/admin/stats?from=${day}&to=${day}`)).stats.find(x=>x.userId===tokiId);
   assert.equal(earnings.regularPayRs,pay);assert.equal(earnings.overtimeHours,bonus);
 }
 const tokiPerf=await ok(toki,'/api/team/performance?month=2026-09');
 assert.ok(tokiPerf.incidents.some(x=>x.date==='2026-09-27' && x.earlyMs===3600000));
 assert.ok(tokiPerf.entries.some(x=>x.date==='2026-09-25' && x.points===0.5));
 const tokiStats=(await ok(admin,'/api/admin/stats?from=2026-09-21&to=2026-09-27')).stats.find(x=>x.userId===tokiId);
 assert.equal(tokiStats.offDaysPayRs,0);assert.equal(tokiStats.missedDays,0);
 console.log('PASS: all thirteen schedules and exact account targeting; rolling finishes; arrival window; late reasons/approval and date scope; paid breaks and prorated clock-time payroll; Tokili Friday/weekend pay, points and early departures; extra-time reason enforcement and review; overnight clock-out; correction safeguards; audit; employee privacy.');
 console.log('Disposable test files:',dir);
} catch(e) {console.error(logs.slice(-5000));throw e;}
finally {if(server)server.kill('SIGTERM');await db.$disconnect();}
