import {test} from 'node:test';
import assert from 'node:assert/strict';
import {weekDates,parseWeekTimes,missingPunchDeductions,validWeek} from './weeklySchedulePolicy';
import {masterPay} from './masterPolicy';
test('first rollout week is Mon 2 November; six days must each span nine hours',()=>{
 const dates=weekDates('2026-11-04');assert.deepEqual(dates,['2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-08']);
 const days=Object.fromEntries(dates.map(d=>[d,{start:'10:00',end:'19:00'}]));assert.deepEqual(parseWeekTimes(days,'2026-11-02'),days);
 assert.throws(()=>parseWeekTimes({...days,'2026-11-04':{start:'10:00',end:'20:00'}},'2026-11-02'),/9 hours/);
 assert.throws(()=>parseWeekTimes({...days,'2026-11-02':{start:'10:00',end:'19:00'}},'2026-11-02'),/six days/);
 assert.throws(()=>parseWeekTimes({...days,'2026-11-04':{start:'25:00',end:'34:00'}},'2026-11-02'),/valid times/);
 assert.equal(validWeek('2026-11-09','2026-11-04'),true);assert.equal(validWeek('2026-11-16','2026-11-04'),false);
});
test('deductions reset monthly, honor waivers and attribute every second incident to its date',()=>{
 const incidents=['2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-12-01'].map(workDate=>({workDate,missingPunch:'OUT'}));
 assert.deepEqual(missingPunchDeductions(incidents,'2026-11-01','2026-11-30'),{incidents:4,days:2});
 assert.deepEqual(missingPunchDeductions(incidents,'2026-11-05','2026-11-05'),{incidents:1,days:1});
 assert.deepEqual(missingPunchDeductions(incidents,'2026-12-01','2026-12-31'),{incidents:1,days:0});
 assert.deepEqual(missingPunchDeductions(incidents.map(r=>({...r,missingPunchWaived:r.workDate==='2026-11-04'})),'2026-11-01','2026-11-30'),{incidents:3,days:1});
});
test('inferred end preserves actual arrival: 11am to 7pm is eight hours, no added grace',()=>{
 const base={clockInAt:'2026-11-04T11:00:00+05:30',clockOutAt:'2026-11-04T19:00:00+05:30',scheduledStartAt:'2026-11-04T10:00:00+05:30',scheduledEndAt:'2026-11-04T19:00:00+05:30',shiftDurationMinutes:540,unpaidBreakMinutes:0};
 assert.equal(masterPay({...base,missingPunch:'OUT'}).regularMs/3600000,8);
 assert.equal(masterPay({...base,missingPunch:'NONE'}).regularMs/3600000,8.25);
});
test('ten-hour employees must include the paid break inside ten total hours',()=>{
 const days=Object.fromEntries(weekDates('2026-11-09').map(d=>[d,{start:'10:00',end:'20:00'}]));
 assert.deepEqual(parseWeekTimes(days,'2026-11-09',10),days);
 assert.throws(()=>parseWeekTimes(days,'2026-11-09',9),/9 hours/);
 assert.throws(()=>parseWeekTimes({...days,'2026-11-10':{start:'10:00',end:'19:00'}},'2026-11-09',10),/10 hours/);
});
