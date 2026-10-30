import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {PDFDocument} from 'pdf-lib';
async function main(){
 const dir=mkdtempSync(join(tmpdir(),'mc-payroll-'));
 writeFileSync(join(dir,'test.db'),'');
 process.env.DATABASE_URL=`file:${join(dir,'test.db')}`;
 const migrated=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(migrated.status,0,migrated.stderr);
 const {prisma}=await import('../src/lib/prisma');
 const {computeStatsForRange}=await import('../src/lib/stats');
 const {createPayrollPdf}=await import('../src/lib/payrollPdf');
 try{
 const user=await prisma.user.create({data:{name:'Sample Employee',employeeCode:'PDF-DEMO',passwordHash:'not-a-login',createdAt:new Date('2026-10-01T00:00:00+05:30'),hourlyRateRs:50}});
 const at=(d:string,t:string)=>new Date(`${d}T${t}:00+05:30`);
 async function attendance(day:string,policyVersion:number,start:string,end:string|null,unpaid:number,status='APPROVED'){
 await prisma.attendanceRecord.create({data:{userId:user.id,workDate:day,policyVersion,clockInAt:at(day,start),clockOutAt:end?at(day,end):null,scheduledStartAt:at(day,'10:00'),scheduledEndAt:at(day,'19:00'),shiftDurationMinutes:540,paidBreakMinutes:60,unpaidBreakMinutes:unpaid,approvalStatus:status}});
 }
 await attendance('2026-10-02',3,'10:00','20:00',0); // 9 regular + 1 extra
 await attendance('2026-10-03',4,'10:00','20:00',120); // 8 flexible paid
 await attendance('2026-10-04',3,'10:00',null,0);
 await attendance('2026-10-06',3,'10:00','19:00',0,'REJECTED');
 await prisma.staffRequest.create({data:{userId:user.id,kind:'LEAVE',fromDate:'2026-10-07',toDate:'2026-10-07',reason:'Test',status:'APPROVED'}});
 await prisma.workDayOverride.create({data:{workDate:'2026-10-08',mode:'PAID_OFF',updatedById:'test'}});
 const [basic]=await computeStatsForRange('2026-10-01','2026-10-10',{userId:user.id});
 const [detailed]=await computeStatsForRange('2026-10-01','2026-10-10',{userId:user.id},true);
 const {payrollDays,...rest}=detailed;assert.deepEqual(rest,basic);
 const days=payrollDays!;
 assert.equal(days.find(d=>d.date==='2026-10-03')!.regularHours,8);
 assert.equal(days.find(d=>d.date==='2026-10-03')!.unpaidHours,2);
 assert.equal(days.find(d=>d.date==='2026-10-04')!.status,'Incomplete');
 assert.equal(days.find(d=>d.date==='2026-10-06')!.status,'Rejected');
 assert.equal(days.find(d=>d.date==='2026-10-07')!.status,'Approved leave');
 assert.equal(days.find(d=>d.date==='2026-10-08')!.status,'Paid off day');
 assert.equal(days.find(d=>d.date==='2026-10-09')!.status,'Missed shift');
 assert.equal(Math.round(days.reduce((n,d)=>n+d.payRs,0)*100)/100+detailed.bonusPayRs,detailed.salaryRs);
 const bytes=await createPayrollPdf(detailed,'2026-10-01','2026-10-10');
 assert.equal((await PDFDocument.load(bytes)).getPageCount(),2);
 const [month]=await computeStatsForRange('2026-10-01','2026-10-31',{userId:user.id},true);
 const longPdf=await createPayrollPdf(month,'2026-10-01','2026-10-31');
 assert.ok((await PDFDocument.load(longPdf)).getPageCount()>=3);
 if(process.env.PAYROLL_PREVIEW_PATH)writeFileSync(process.env.PAYROLL_PREVIEW_PATH,longPdf);
 const [empty]=await computeStatsForRange('2026-09-01','2026-09-30',{userId:user.id},true);
 assert.equal(empty.salaryRs,0);assert.equal(empty.payrollDays!.length,0);
 assert.equal((await PDFDocument.load(await createPayrollPdf(empty,'2026-09-01','2026-09-30'))).getPageCount(),2);
 console.log('PASS: daily reconciliation, normal/flexible hours, unpaid breaks, leave, off days, incomplete/rejected/missed days, pre-launch range and multipage PDF.');
 }finally{await prisma.$disconnect();rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
