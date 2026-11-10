import assert from "node:assert/strict";
import { test, beforeEach, afterEach, mock } from "node:test";
beforeEach(() => mock.timers.enable({apis:["Date"],now:new Date("2027-01-31T12:00:00Z")}));
afterEach(() => mock.timers.reset());
import type { AttendanceRecord, User } from "@prisma/client";
import { prisma } from "./prisma";
const originalDayFind=prisma.workDayOverride.findUnique,originalDayList=prisma.workDayOverride.findMany;
beforeEach(()=>{prisma.workDayOverride.findUnique=(async()=>null) as typeof originalDayFind;prisma.workDayOverride.findMany=(async()=>[]) as typeof originalDayList;});
afterEach(()=>{prisma.workDayOverride.findUnique=originalDayFind;prisma.workDayOverride.findMany=originalDayList;});
const originalLeaves = prisma.staffRequest.findMany;
beforeEach(()=>{prisma.staffRequest.findMany=(async()=>[]) as typeof originalLeaves;});
afterEach(()=>{prisma.staffRequest.findMany=originalLeaves;});
import { computeStatsForRange } from "./stats";
import { todayWorkDate } from "./time";

test("billing starts at account creation in IST and respects the report range", async (t) => {
  let createdAt = new Date("2026-12-15T18:30:00Z"); // December 16 IST
  let records: AttendanceRecord[] = [];
  const originalUsers = prisma.user.findMany;
  const originalRecords = prisma.attendanceRecord.findMany;
  t.after(() => {
    prisma.user.findMany = originalUsers;
    prisma.attendanceRecord.findMany = originalRecords;
  });
  prisma.user.findMany = (async () => [{
    id: "employee", name: "Employee", employeeCode: "MC-001",
    createdAt, hourlyRateRs: 100, active: true,
  } as User]) as typeof prisma.user.findMany;
  prisma.attendanceRecord.findMany = (async () => records) as typeof prisma.attendanceRecord.findMany;
  const attendance = (workDate: string, approvalStatus = "APPROVED", complete = true) => ({
    userId: "employee", workDate, approvalStatus,
    clockInAt: new Date(`${workDate}T03:30:00Z`),
    clockOutAt: complete ? new Date(`${workDate}T13:30:00Z`) : null,
  } as AttendanceRecord);
  records = [attendance("2026-12-15"), attendance("2026-12-16")];
  let [s] = await computeStatsForRange("2026-12-01", "2026-12-16");
  assert.equal(s.billingFromDate, "2026-12-16");
  assert.equal(s.offDays, 0);
  assert.equal(s.missedDays, 0);
  assert.equal(s.daysPresent, 1);
  assert.equal(s.totalHours, 10);
  assert.equal(s.salaryRs, 900);

  records = [attendance("2026-12-14", "PENDING"), attendance("2026-12-15", "REJECTED"), attendance("2026-12-13", "PENDING", false)];
  [s] = await computeStatsForRange("2026-12-01", "2026-12-15");
  for (const key of ["daysPresent", "daysComplete", "incompleteDays", "missedDays", "pendingApprovalDays", "rejectedDays", "totalHours", "offDays", "salaryRs"] as const) assert.equal(s[key], 0, key);
  assert.equal(s.billingFromDate, null);

  records = [];
  [s] = await computeStatsForRange("2026-12-01", "2026-12-21");
  assert.equal(s.offDays, 1);
  assert.equal(s.salaryRs, 900);
  assert.equal(s.missedDays, 5);
  createdAt = new Date("2026-12-21T00:00:00Z");
  [s] = await computeStatsForRange("2026-12-01", "2026-12-21");
  assert.equal(s.offDays, 1);
  assert.equal(s.missedDays, 0);
  createdAt = new Date("2026-11-01T00:00:00Z");
  [s] = await computeStatsForRange("2026-12-14", "2026-12-14");
  assert.equal(s.billingFromDate, "2026-12-14");
  assert.equal(s.salaryRs, 900);

  createdAt = new Date();
  const today = todayWorkDate();
  records = [attendance("2099-01-01")];
  [s] = await computeStatsForRange(`${today.slice(0, 7)}-01`, "2099-01-01");
  assert.equal(s.billingFromDate, today);
  assert.equal(s.daysPresent, 0);
  assert.equal(s.totalHours, 0);
  const monday = new Date(`${today}T00:00:00Z`).getUTCDay() === 1;
  assert.equal(s.offDays, monday ? 1 : 0);
  assert.equal(s.salaryRs, monday ? 900 : 0);
});

test("overtime pays whole days, carries across months, and stays separate per employee", async (t) => {
  const originalUsers = prisma.user.findMany;
  const originalRecords = prisma.attendanceRecord.findMany;
  t.after(() => {
    prisma.user.findMany = originalUsers;
    prisma.attendanceRecord.findMany = originalRecords;
  });
  prisma.user.findMany = (async () => ["a", "b"].map(id => ({
    id, name: id, employeeCode: id, createdAt: new Date("2020-01-01T00:00:00Z"),
    hourlyRateRs: 100, active: true,
  } as User))) as typeof prisma.user.findMany;
  let records: AttendanceRecord[] = [];
  prisma.attendanceRecord.findMany = (async () => records) as typeof prisma.attendanceRecord.findMany;
  const shift = (userId: string, workDate: string, extraHours: number, approvalStatus = "APPROVED") => {
    const clockInAt = new Date(`${workDate}T03:30:00Z`);
    return { userId, workDate, clockInAt,
      clockOutAt: new Date(clockInAt.getTime() + (9 + extraHours) * 3600000),
      approvalStatus,
    } as AttendanceRecord;
  };
  for (const [hours, days, balance] of [[0, 0, 0], [4, 0, 4], [7, 1, 0], [8, 1, 1], [12, 1, 5], [14, 2, 0], [16, 2, 2]]) {
    records = [shift("a", "2026-12-01", hours / 2), shift("a", "2026-12-02", hours / 2), shift("b", "2026-12-01", 1)];
    const [a, b] = await computeStatsForRange("2026-12-01", "2026-12-02");
    assert.equal(a.overtimeHours, hours);
    assert.equal(a.bonusDays, days);
    assert.equal(a.bonusPayRs, days * 900);
    assert.equal(a.salaryRs, 1800 + days * 900);
    assert.equal(a.overtimeBalanceHours, balance);
    assert.equal(b.bonusDays, 0);
    assert.equal(b.overtimeBalanceHours, 1);
  }
  records = [shift("a", "2026-11-29", 6), shift("a", "2026-12-01", 1),
    shift("a", "2026-12-02", 7, "PENDING"), shift("a", "2026-12-03", 8, "REJECTED"),
    shift("a", "2026-11-30", 8)]; // Monday retains existing paid-off-day policy
  let [a] = await computeStatsForRange("2026-12-01", "2026-12-03");
  assert.equal(a.overtimeHours, 8);
  assert.equal(a.bonusDays, 2);
  assert.equal(a.overtimeBalanceHours, 0);
  [a] = await computeStatsForRange("2026-12-02", "2026-12-03");
  assert.equal(a.bonusDays, 1); // only the new seven-hour block is paid
  records = [shift("a", "2026-12-01", 3.5), shift("a", "2026-12-02", 3.5 - 1 / 3600)];
  [a] = await computeStatsForRange("2026-12-01", "2026-12-02");
  assert.equal(a.bonusDays, 0); // one second short must not round up
  assert.equal(a.overtimeBalanceHours, 6.99);
});

test("salary previews do not mutate attendance and paid-day equivalents handle zero rates", async (t) => {
  const originalUsers = prisma.user.findMany, originalRecords = prisma.attendanceRecord.findMany;
  t.after(() => { prisma.user.findMany = originalUsers; prisma.attendanceRecord.findMany = originalRecords; });
  prisma.user.findMany = (async () => [{ id: "employee", name: "Employee", employeeCode: "MC-1", createdAt: new Date("2020-01-01T00:00:00Z"), hourlyRateRs: 0, active: true } as User]) as typeof prisma.user.findMany;
  const record = { id: "shift", userId: "employee", workDate: "2026-12-01", clockInAt: new Date("2026-12-01T03:30:00Z"), clockOutAt: new Date("2026-12-01T08:00:00Z"), approvalStatus: "PENDING" } as AttendanceRecord;
  prisma.attendanceRecord.findMany = (async () => [record]) as typeof prisma.attendanceRecord.findMany;
  const [preview] = await computeStatsForRange("2026-12-01", "2026-12-01", { userId: "employee", recordId: "shift", approvalStatus: "APPROVED" });
  assert.equal(preview.paidWorkDays, 0.5);
  assert.equal(preview.salaryRs, 0);
  assert.equal(record.approvalStatus, "PENDING");
  const [actual] = await computeStatsForRange("2026-12-01", "2026-12-01");
  assert.equal(actual.paidWorkDays, 0.5);
  assert.equal(actual.pendingApprovalDays, 0);
});


test("payroll uses net hours, keeps old records unchanged and awards exact bonus blocks", async (t) => {
  const users = prisma.user.findMany, attendance = prisma.attendanceRecord.findMany;
  t.after(() => { prisma.user.findMany = users; prisma.attendanceRecord.findMany = attendance; });
  prisma.user.findMany = (async () => [{id: "a", name: "A", employeeCode: "A", createdAt: new Date("2020-01-01"), hourlyRateRs: 100, active: true} as User]) as typeof prisma.user.findMany;
  let records: AttendanceRecord[] = [];
  prisma.attendanceRecord.findMany = (async () => records) as typeof prisma.attendanceRecord.findMany;
  const shift = (day: string, elapsed: number, breakMinutes = 60) => ({id: day, userId: "a", workDate: day, approvalStatus: "APPROVED", clockInAt: new Date(`${day}T00:00:00Z`), clockOutAt: new Date(+new Date(`${day}T00:00:00Z`) + elapsed * 3600000), unpaidBreakMinutes: breakMinutes} as AttendanceRecord);
  records = [shift("2026-12-01", 9.5), shift("2026-12-02", 10), shift("2026-12-03", 14), shift("2026-12-04", 14)];
  let [s] = await computeStatsForRange("2026-12-01", "2026-12-04");
  assert.equal(s.totalHours, 43.5);
  assert.equal(s.regularPayRs, 3550);
  assert.equal(s.overtimeHours, 8);
  assert.equal(s.bonusDays, 1);
  assert.equal(s.salaryRs, 4450);
  records = [shift("2026-12-01", 0.5), shift("2026-12-02", 10, 0)];
  [s] = await computeStatsForRange("2026-12-01", "2026-12-02");
  assert.equal(s.regularPayRs, 900);
  assert.equal(s.overtimeHours, 1);
  const late = {...shift("2026-12-01", 14), extraTimeCutoff: new Date("2026-12-01T12:00:00Z"), extraTimeStatus: "REJECTED"};
  records = [late];
  [s] = await computeStatsForRange("2026-12-01", "2026-12-01");
  assert.equal(s.totalHours, 11);
  assert.equal(s.overtimeHours, 2);
  records = [{...late, extraTimeStatus: "APPROVED"}];
  [s] = await computeStatsForRange("2026-12-01", "2026-12-01");
  assert.equal(s.totalHours, 13);
  assert.equal(s.overtimeHours, 4);
});

test("duration policy pays clock hours, carries automatic bonus blocks, and preserves old records", async (t) => {
  const users = prisma.user.findMany, attendance = prisma.attendanceRecord.findMany;
  t.after(() => { prisma.user.findMany = users; prisma.attendanceRecord.findMany = attendance; });
  prisma.user.findMany = (async () => [{id:"v2",name:"Test",employeeCode:"TEST",hourlyRateRs:100,active:true,createdAt:new Date("2020-01-01T00:00:00Z")} as User]) as typeof prisma.user.findMany;
  const row = (date: string, end: string, extraTimeStatus="AUTOMATIC") => ({
    id:date,userId:"v2",workDate:date,clockInAt:new Date(`${date}T10:00:00+05:30`),clockOutAt:new Date(`${date}T${end}:00+05:30`),
    policyVersion:2,shiftDurationMinutes:540,unpaidBreakMinutes:0,
    extraTimeCutoff:new Date(`${date}T19:00:00+05:30`),extraTimeStatus,approvalStatus:"APPROVED",
  } as AttendanceRecord);
  prisma.attendanceRecord.findMany = (async () => [row("2026-12-29","23:00"),row("2026-12-30","21:59"),row("2027-01-01","19:01")]) as typeof prisma.attendanceRecord.findMany;
  let [s] = await computeStatsForRange("2027-01-01","2027-01-01");
  assert.equal(s.regularPayRs,900);assert.equal(s.bonusDays,1);assert.equal(s.bonusPayRs,900);assert.equal(s.overtimeBalanceHours,0);assert.equal(s.salaryRs,1800);
  prisma.attendanceRecord.findMany = (async () => [row("2027-01-01","23:00","REJECTED")]) as typeof prisma.attendanceRecord.findMany;
  [s] = await computeStatsForRange("2027-01-01","2027-01-01");
  assert.equal(s.regularPayRs,900);assert.equal(s.overtimeHours,0);assert.equal(s.totalHours,9);
});

test("completed pending shifts and extra hours count automatically, retaining short-hour deductions and exclusions", async t => {
  const users=prisma.user.findMany, attendance=prisma.attendanceRecord.findMany;
  t.after(()=>{prisma.user.findMany=users;prisma.attendanceRecord.findMany=attendance;});
  prisma.user.findMany=(async()=>[{id:"a",name:"Employee",employeeCode:"A",createdAt:new Date("2020-01-01"),hourlyRateRs:100,active:true} as User]) as typeof users;
  const at=(day:string,hour:string)=>new Date(`2026-12-${day}T${hour}:00+05:30`);
  const record={id:"one",userId:"a",workDate:"2026-12-01",policyVersion:2,shiftDurationMinutes:540,unpaidBreakMinutes:0,approvalStatus:"PENDING",clockInAt:at("01","10:00"),clockOutAt:at("01","18:30"),extraTimeCutoff:at("01","19:00"),extraTimeStatus:"NOT_REQUIRED"} as AttendanceRecord;
  let records=[record];
  prisma.attendanceRecord.findMany=(async()=>records) as typeof attendance;
  let [s]=await computeStatsForRange("2026-12-01","2026-12-01");
  assert.equal(s.regularPayRs,850);assert.equal(s.pendingApprovalDays,0);
  records=[{...record,clockOutAt:at("01","22:00"),extraTimeStatus:"PENDING"}];
  [s]=await computeStatsForRange("2026-12-01","2026-12-01");
  assert.equal(s.regularPayRs,900);assert.equal(s.overtimeHours,3);
  records=[{...records[0],extraTimeStatus:"APPROVED"}];
  [s]=await computeStatsForRange("2026-12-01","2026-12-01");assert.equal(s.overtimeHours,3);
  records=[{...record,approvalStatus:"REJECTED"}];
  [s]=await computeStatsForRange("2026-12-01","2026-12-01");assert.equal(s.salaryRs,0);assert.equal(s.rejectedDays,1);
  records=[{...record,clockOutAt:null}];
  [s]=await computeStatsForRange("2026-12-01","2026-12-01");assert.equal(s.salaryRs,0);assert.equal(s.incompleteDays,1);
});

test("master policy pays all ten regular hours rather than capping salary at nine", async t=>{
  const oldUsers=prisma.user.findMany, oldRecords=prisma.attendanceRecord.findMany;
  t.after(()=>{prisma.user.findMany=oldUsers;prisma.attendanceRecord.findMany=oldRecords;});
  const date="2026-10-03", at=(s:string)=>new Date(`${date}T${s}:00+05:30`);
  prisma.user.findMany=(async()=>[{id:"p",name:"Pankaj",employeeCode:"PANKAJ",hourlyRateRs:100,createdAt:new Date("2026-09-01"),active:true} as User]) as typeof prisma.user.findMany;
  prisma.attendanceRecord.findMany=(async()=>[{id:"r",userId:"p",workDate:date,clockInAt:at("10:00"),clockOutAt:at("22:30"),scheduledStartAt:at("10:00"),scheduledEndAt:at("22:30"),shiftDurationMinutes:750,unpaidBreakMinutes:150,policyVersion:3,approvalStatus:"PENDING"} as AttendanceRecord]) as typeof prisma.attendanceRecord.findMany;
  const [row]=await computeStatsForRange(date,date);
  assert.equal(row.regularPayRs,1000);assert.equal(row.totalHours,10);assert.equal(row.overtimeHours,0);
});

test("October go-live excludes September salary, missed days and all overtime carry-in", async t => {
  const users=prisma.user.findMany, attendance=prisma.attendanceRecord.findMany;
  t.after(()=>{prisma.user.findMany=users;prisma.attendanceRecord.findMany=attendance;});
  prisma.user.findMany=(async()=>[{id:"a",name:"A",employeeCode:"A",hourlyRateRs:100,createdAt:new Date("2026-09-01"),active:true} as User]) as typeof users;
  const row=(date:string,extra:number)=>({id:date,userId:"a",workDate:date,policyVersion:2,shiftDurationMinutes:540,unpaidBreakMinutes:0,approvalStatus:"APPROVED",clockInAt:new Date(`${date}T00:00:00Z`),clockOutAt:new Date(+new Date(`${date}T00:00:00Z`)+(9+extra)*3600000)} as AttendanceRecord);
  const records=[row("2026-09-30",7),row("2026-10-01",1),row("2026-10-02",7),row("2026-10-03",2)];
  prisma.attendanceRecord.findMany=(async args=>{
    assert.equal((args?.where?.workDate as {gte:string}).gte,"2026-10-01");
    return records;
  }) as typeof attendance;
  let [result]=await computeStatsForRange("2026-10-01","2026-10-01");
  assert.equal(result.bonusDays,0);assert.equal(result.overtimeBalanceHours,1);assert.equal(result.salaryRs,900);
  [result]=await computeStatsForRange("2026-09-01","2026-09-30");
  assert.equal(result.billingFromDate,null);
  for(const key of ["salaryRs","bonusDays","overtimeBalanceHours","offDays","missedDays","daysPresent","totalHours"] as const) assert.equal(result[key],0,key);
  [result]=await computeStatsForRange("2026-09-01","2026-10-01");
  assert.equal(result.billingFromDate,"2026-10-01");assert.equal(result.daysPresent,1);assert.equal(result.missedDays,0);assert.equal(result.offDays,0);
  [result]=await computeStatsForRange("2026-10-02","2026-10-02");
  assert.equal(result.bonusDays,1);assert.equal(result.overtimeBalanceHours,1);
  [result]=await computeStatsForRange("2026-11-01","2026-11-01");
  assert.equal(result.bonusDays,0);assert.equal(result.overtimeBalanceHours,3); // October remainder still carries.
  assert.equal(records[0].workDate,"2026-09-30"); // Source data is untouched.
});

test("selected Monday has normal pay, overtime and absence rules; other Mondays stay paid off",async t=>{
 const users=prisma.user.findMany,attendance=prisma.attendanceRecord.findMany;
 t.after(()=>{prisma.user.findMany=users;prisma.attendanceRecord.findMany=attendance;});
 const date="2026-12-07",at=(time:string)=>new Date(`${date}T${time}:00+05:30`);
 const emp={id:"m",name:"Monday",employeeCode:"M",hourlyRateRs:100,createdAt:new Date("2026-10-01"),active:true,paidWeeklyOff:true,scheduleHistoryJson:JSON.stringify([{from:date,oneDay:true,days:{"1":{start:600,latest:600,duration:540,unpaidBreak:0,paidBreak:60}}}])} as User;
 let records:AttendanceRecord[]=[];
 prisma.user.findMany=(async()=>[emp]) as typeof users;
 prisma.attendanceRecord.findMany=(async()=>records) as typeof attendance;
 let [row]=await computeStatsForRange(date,date);
 assert.equal(row.offDays,0);assert.equal(row.missedDays,1);assert.equal(row.salaryRs,0);
 records=[{id:"m1",userId:"m",workDate:date,clockInAt:at("10:00"),clockOutAt:at("21:00"),scheduledStartAt:at("10:00"),scheduledEndAt:at("19:00"),shiftDurationMinutes:540,unpaidBreakMinutes:0,paidBreakMinutes:60,policyVersion:3,approvalStatus:"APPROVED"} as AttendanceRecord];
 [row]=await computeStatsForRange(date,date);
 assert.equal(row.offDays,0);assert.equal(row.missedDays,0);assert.equal(row.regularPayRs,900);assert.equal(row.overtimeHours,2);
 [row]=await computeStatsForRange("2026-12-14","2026-12-14");
 assert.equal(row.offDays,1);assert.equal(row.salaryRs,900);assert.equal(row.missedDays,0);
});

test("date-wide hourly correction and paid closure replace rather than stack salary",async t=>{
 const users=prisma.user.findMany,attendance=prisma.attendanceRecord.findMany;
 t.after(()=>{prisma.user.findMany=users;prisma.attendanceRecord.findMany=attendance;});
 const date="2026-10-19",at=(time:string)=>new Date(`${date}T${time}:00+05:30`);
 const emp={id:"flex",name:"Flexible",hourlyRateRs:100,createdAt:new Date("2026-10-01"),active:false,paidWeeklyOff:true} as User;
 let mode:string|null=null,records:AttendanceRecord[]=[];
 prisma.workDayOverride.findMany=(async()=>mode?[{workDate:date,mode}]:[]) as typeof prisma.workDayOverride.findMany;
 prisma.user.findMany=(async()=>[emp]) as typeof users;
 prisma.attendanceRecord.findMany=(async()=>records) as typeof attendance;
 assert.equal((await computeStatsForRange(date,date))[0].salaryRs,900);
 mode="HOURLY";
 assert.equal((await computeStatsForRange(date,date))[0].salaryRs,0);
 records=[{userId:emp.id,workDate:date,clockInAt:at("10:00"),clockOutAt:at("20:00"),policyVersion:4,paidBreakMinutes:60,unpaidBreakMinutes:120,approvalStatus:"PENDING"} as AttendanceRecord];
 let [row]=await computeStatsForRange(date,date);
 assert.equal(row.salaryRs,800);assert.equal(row.offDaysPayRs,0);assert.equal(row.overtimeHours,0);
 records[0].clockOutAt=at("23:30");
 assert.equal((await computeStatsForRange(date,date))[0].salaryRs,1150);
 mode="PAID_OFF";
 [row]=await computeStatsForRange(date,date);
 assert.equal(row.salaryRs,900);assert.equal(row.regularPayRs,0);assert.equal(row.overtimeHours,0);assert.equal(row.totalHours,0);
 const weekday="2026-10-20";
 prisma.workDayOverride.findMany=(async()=>[{workDate:weekday,mode:"PAID_OFF"}]) as typeof prisma.workDayOverride.findMany;
 assert.equal((await computeStatsForRange(weekday,weekday))[0].salaryRs,900);
 assert.equal((await computeStatsForRange("2026-10-21","2026-10-21"))[0].salaryRs,0);
});

test('weekly missing-punch deductions reconcile by calendar month and admin waivers reverse them',async t=>{
 const oldUsers=prisma.user.findMany,oldRecords=prisma.attendanceRecord.findMany,oldLeaves=prisma.staffRequest.findMany;
 t.after(()=>{prisma.user.findMany=oldUsers;prisma.attendanceRecord.findMany=oldRecords;prisma.staffRequest.findMany=oldLeaves;});
 prisma.user.findMany=(async()=>[{id:'week',name:'Week',employeeCode:'W',hourlyRateRs:50,createdAt:new Date('2026-10-01'),active:true} as User]) as typeof oldUsers;
 let waived=false;
 const row=(d:string)=>({id:d,userId:'week',workDate:d,clockInAt:new Date(`${d}T11:00:00+05:30`),clockOutAt:new Date(`${d}T19:00:00+05:30`),scheduledStartAt:new Date(`${d}T10:00:00+05:30`),scheduledEndAt:new Date(`${d}T19:00:00+05:30`),policyVersion:3,shiftDurationMinutes:540,unpaidBreakMinutes:0,paidBreakMinutes:60,approvalStatus:'PENDING',missingPunch:'OUT',missingPunchWaived:waived&&d==='2026-11-04'} as AttendanceRecord);
 prisma.attendanceRecord.findMany=(async()=>[row('2026-11-04'),row('2026-11-05')]) as typeof oldRecords;
 prisma.staffRequest.findMany=(async()=>[{userId:'week',fromDate:'2026-11-06',toDate:'2026-11-06',status:'APPROVED'}]) as typeof oldLeaves;
 let [s]=await computeStatsForRange('2026-11-04','2026-11-07',undefined,true);
 assert.equal(s.regularPayRs,800);assert.equal(s.missingPunchIncidents,2);assert.equal(s.missingPunchDeductionDays,1);assert.equal(s.missingPunchDeductionRs,450);assert.equal(s.salaryRs,350);
 assert.equal(s.missedDays,1);assert.equal(s.payrollDays!.find(d=>d.date==='2026-11-06')!.status,'Approved leave');assert.equal(s.payrollDays!.find(d=>d.date==='2026-11-07')!.status,"Didn't show up");
 [s]=await computeStatsForRange('2026-11-05','2026-11-05');assert.equal(s.missingPunchDeductionDays,1);assert.equal(s.salaryRs,-50);
 waived=true;[s]=await computeStatsForRange('2026-11-04','2026-11-07');assert.equal(s.missingPunchDeductionDays,0);assert.equal(s.salaryRs,800);
});

test("annualized 16k ten-hour rate revises past pay, off days and monthly deductions without changing punches", async t => {
 const oldUsers=prisma.user.findMany,oldRecords=prisma.attendanceRecord.findMany;
 t.after(()=>{prisma.user.findMany=oldUsers;prisma.attendanceRecord.findMany=oldRecords;});
 const rate=16000*12/365/10;
 prisma.user.findMany=(async()=>[{id:'jit',name:'Jit',employeeCode:'JIT SINGH',createdAt:new Date('2026-10-10'),active:true,paidWeeklyOff:true,standardShiftHours:10,hourlyRateRs:rate} as User]) as typeof oldUsers;
 const row=(date:string)=>({userId:'jit',workDate:date,policyVersion:3,clockInAt:new Date(date+'T10:00:00+05:30'),clockOutAt:new Date(date+'T20:00:00+05:30'),scheduledStartAt:new Date(date+'T10:00:00+05:30'),scheduledEndAt:new Date(date+'T20:00:00+05:30'),shiftDurationMinutes:600,paidBreakMinutes:60,unpaidBreakMinutes:0,missingPunch:'OUT',missingPunchWaived:false,approvalStatus:'APPROVED'} as AttendanceRecord);
 const records=[row('2026-11-04'),row('2026-11-05')];
 prisma.attendanceRecord.findMany=(async()=>records) as typeof oldRecords;
 const before=JSON.stringify(records);
 const [s]=await computeStatsForRange('2026-11-04','2026-11-09',undefined,true);
 assert.equal(s.hourlyRateRs,rate);assert.equal(s.dailyRateRs,526.03);
 assert.equal(s.regularPayRs,1052.05);assert.equal(s.offDaysPayRs,526.03);
 assert.equal(s.missingPunchDeductionRs,526.03);assert.equal(s.salaryRs,1052.05);
 assert.equal(s.fullDaysWorked,2);assert.equal(s.overtimeHours,0);
 assert.equal(s.payrollDays?.find(d=>d.date==='2026-11-04')?.regularHours,10);
 assert.equal(JSON.stringify(records),before);
 // A nine-hour attendance in a corrected ten-hour shift pays only nine actual hours.
 records.splice(0,records.length,{...row('2026-10-13'),missingPunch:'NONE',clockOutAt:new Date('2026-10-13T19:00:00+05:30'),scheduledEndAt:new Date('2026-10-13T20:00:00+05:30'),shiftDurationMinutes:600});
 const [past]=await computeStatsForRange('2026-10-13','2026-10-13');
 assert.equal(past.regularPayRs,473.42);assert.equal(past.fullDaysWorked,0);
});

test("corrected ten-hour history earns one Jit salary day at seven extra hours", async t => {
 const oldUsers=prisma.user.findMany,oldRecords=prisma.attendanceRecord.findMany;
 t.after(()=>{prisma.user.findMany=oldUsers;prisma.attendanceRecord.findMany=oldRecords;});
 const rate=16000*12/365/10;
 prisma.user.findMany=(async()=>[{id:'jit',name:'Jit',employeeCode:'JIT SINGH',createdAt:new Date('2026-10-10'),active:true,paidWeeklyOff:true,standardShiftHours:10,hourlyRateRs:rate} as User]) as typeof oldUsers;
 const records=['13','14','15','16','17','18','20'].map(day=>{
  const date='2026-10-'+day;
  return {id:date,userId:'jit',workDate:date,clockInAt:new Date(date+'T10:00:00+05:30'),clockOutAt:new Date(date+'T21:00:00+05:30'),scheduledStartAt:new Date(date+'T10:00:00+05:30'),scheduledEndAt:new Date(date+'T20:00:00+05:30'),policyVersion:3,shiftDurationMinutes:600,unpaidBreakMinutes:0,paidBreakMinutes:60,approvalStatus:'APPROVED'} as AttendanceRecord;
 });
 prisma.attendanceRecord.findMany=(async()=>records) as typeof oldRecords;
 const [s]=await computeStatsForRange('2026-10-13','2026-10-20',undefined,true);
 assert.equal(s.regularPayRs,3682.19);assert.equal(s.overtimeHours,7);
 assert.equal(s.bonusDays,1);assert.equal(s.bonusPayRs,526.03);assert.equal(s.overtimeBalanceHours,0);
 assert.equal(s.payrollDays?.find(d=>d.date==='2026-10-13')?.regularHours,10);
 assert.equal(s.payrollDays?.find(d=>d.date==='2026-10-13')?.overtimeHours,1);
});

test("Gokul corrected rate revises historical regular, off-day, bonus and missing-punch amounts",async t=>{
 const oldUsers=prisma.user.findMany,oldRecords=prisma.attendanceRecord.findMany;
 t.after(()=>{prisma.user.findMany=oldUsers;prisma.attendanceRecord.findMany=oldRecords;});
 let rate=69;
 prisma.user.findMany=(async()=>[{id:"gokul",name:"Gokul",employeeCode:"KONG GOKUL",createdAt:new Date("2026-10-01"),active:true,paidWeeklyOff:true,standardShiftHours:9,hourlyRateRs:rate,flexibleNineHours:true} as User]) as typeof oldUsers;
 const records=["03","04","05","06","07","08","10"].map(day=>{
  const date="2026-11-"+day;
  return {id:date,userId:"gokul",workDate:date,policyVersion:5,clockInAt:new Date(date+"T08:30:00+05:30"),clockOutAt:new Date(date+"T22:30:00+05:30"),approvalStatus:"APPROVED",missingPunch:["04","05"].includes(day)?"OUT":"NONE",missingPunchWaived:false} as AttendanceRecord;
 });
 prisma.attendanceRecord.findMany=(async()=>records) as typeof oldRecords;
 const [old]=await computeStatsForRange("2026-11-03","2026-11-10");
 assert.equal(old.dailyRateRs,621);
 rate=657.5/9;
 const [corrected]=await computeStatsForRange("2026-11-03","2026-11-10",undefined,true);
 assert.equal(corrected.dailyRateRs,657.5);assert.equal(corrected.regularPayRs,4602.5);
 assert.equal(corrected.offDaysPayRs,657.5);assert.equal(corrected.bonusDays,1);
 assert.equal(corrected.bonusPayRs,657.5);assert.equal(corrected.missingPunchDeductionRs,657.5);
 assert.equal(corrected.salaryRs,5260);assert.equal(corrected.overtimeHours,old.overtimeHours);
 assert.equal(corrected.payrollDays?.find(d=>d.date==="2026-11-03")?.payRs,657.5);
});
