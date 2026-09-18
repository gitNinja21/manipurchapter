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
 assert.equal(gr.unpaidBreakMinutes,60);
 await ok(n,'/api/attendance/clock-in','POST',photo);
 await ok(h,'/api/attendance/clock-in','POST',photo);
 await setTime('2026-09-19T10:31:00+05:30');
 assert.equal((await request(r,'/api/attendance/clock-in','POST',photo)).data.code,'LATE_APPROVAL_REQUIRED');
 const late=(await ok(r,'/api/team/requests','POST',{kind:'LATE_ARRIVAL',fromDate:'2026-09-19',reason:'Delayed bus'})).request;
 assert.equal((await request(r,'/api/attendance/clock-in','POST',photo)).status,403);
 assert.equal((await request(other,`/api/team/requests/${late.id}`,'PATCH',{status:'APPROVED'})).status,403);
 await ok(admin,`/api/team/requests/${late.id}`,'PATCH',{status:'APPROVED'});
 const rr=(await ok(r,'/api/attendance/clock-in','POST',photo)).record;
 assert.equal(rr.lateArrivalRequestId,late.id);
 assert.equal(rr.clockInAt,new Date('2026-09-19T10:31:00+05:30').toISOString());
 const legacy=(await ok(other,'/api/attendance/clock-in','POST',photo)).record;
 assert.equal(legacy.unpaidBreakMinutes,0);assert.equal(legacy.extraTimeCutoff,null);
 assert.equal((await request(other,'/api/team/requests','POST',{kind:'LATE_ARRIVAL',fromDate:'2026-09-20',reason:'Not covered'})).status,400);
 await setTime('2026-09-19T19:00:00+05:30');
 const nr=(await ok(n,'/api/attendance/clock-out','POST',photo)).record;
 assert.equal(nr.extraTimeStatus,'NOT_REQUIRED');
 await ok(admin,`/api/admin/attendance/${nr.id}`,'PATCH',{approvalStatus:'APPROVED'});
 let stats=(await ok(admin,'/api/admin/stats?from=2026-09-19&to=2026-09-19')).stats;
 assert.equal(stats.find(s=>s.userId==='n').totalHours,8.5);
 assert.equal(stats.find(s=>s.userId==='n').regularPayRs,850);
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
 assert.equal(stats.find(s=>s.userId==='g').totalHours,12);
 assert.equal(stats.find(s=>s.userId==='g').overtimeHours,3);
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
 assert.equal(stats.find(s=>s.userId==='h').overtimeHours,5);
 assert.equal(await db.attendanceAudit.count({where:{action:{in:['EXTRA_TIME_APPROVED','EXTRA_TIME_REJECTED']}}}),2);
 // Corrections cannot silently bypass break and after-hours review.
 const correction=(await ok(n,'/api/team/requests','POST',{kind:'CORRECTION',fromDate:'2026-09-19',reason:'Actual leaving time was later',proposedIn:'2026-09-19T09:30:00+05:30',proposedOut:'2026-09-19T23:00:00+05:30'})).request;
 await ok(admin,`/api/team/requests/${correction.id}`,'PATCH',{status:'APPROVED'});
 const corrected=await db.attendanceRecord.findUnique({where:{id:nr.id}});
 assert.equal(corrected.unpaidBreakMinutes,60);assert.equal(corrected.extraTimeStatus,'PENDING');assert.equal(corrected.approvalStatus,'PENDING');
 assert.equal(await db.staffRequest.count({where:{userId:'n',kind:'EXTRA_TIME',status:'PENDING'}}),1);
 const recurrence=await ok(g,'/api/team/schedule?from=2026-09-19&to=2026-09-20');assert.equal(recurrence.recurring.length,1);assert.equal(recurrence.recurring[0].id,'g');
 assert.equal((await ok(admin,'/api/team/schedule?from=2026-09-19&to=2026-09-20')).recurring.length,4);
 await setTime('2026-09-20T11:00:00+05:30');
 assert.equal((await request(g,'/api/attendance/clock-in','POST',photo)).status,403); // no previous-day approval reuse
 assert.equal((await request(r,'/api/attendance/clock-out','POST',{...photo,extraTimeReason:'Forgot yesterday'})).status,409); // >24h needs correction
 console.log('PASS: exact four-person rollout; arrival window; late reasons/approval and date scope; unchanged other employees; break-adjusted payroll; extra-time reason enforcement and review; overnight clock-out; correction safeguards; audit; employee privacy.');
 console.log('Disposable test files:',dir);
} catch(e) {console.error(logs.slice(-5000));throw e;}
finally {if(server)server.kill('SIGTERM');await db.$disconnect();}
