"use client";
import {useEffect,useState,useCallback} from 'react';
import {weekStart} from '@/lib/reporting';
import {todayWorkDate} from '@/lib/time';
import {parseWeekTimes,type WeekTimes} from '@/lib/weeklySchedulePolicy';
type Data={week:string;today:string;effectiveFrom:string;days:WeekTimes;submitted:boolean;revision:number;smsConfigured:boolean};
export default function WeeklySchedule({onSaved}:{onSaved:()=>void}){
 const [week,setWeek]=useState(weekStart(todayWorkDate())),[data,setData]=useState<Data|null>(null),[days,setDays]=useState<WeekTimes>({}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const load=useCallback(async()=>{setData(null);setError('');try{const r=await fetch(`/api/employee/weekly-schedule?week=${week}`,{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);setData(d);setDays(d.days);}catch(e){setError((e as Error).message);}},[week]);
 useEffect(()=>{void load();},[load]);
 const current=weekStart(todayWorkDate()),next=new Date(Date.parse(current)+7*86400000).toISOString().slice(0,10);
 let validation='';if(data)try{parseWeekTimes(days,week);}catch(e){validation=(e as Error).message;}
 return <section id="weekly-schedule" className="admin-panel p-4 space-y-3">
  <h2 className="font-semibold">My weekly schedule</h2>
  <p className="text-sm">Submit before your first clock-in each week. Tuesday–Sunday: 9 hours total, including a 1-hour paid break. Monday off. Times are IST.</p>
  <label className="block text-sm">Week<select className="input mt-1" value={week} disabled={busy} onChange={e=>{setWeek(e.target.value);setMessage('');}}><option value={current}>This week · {current}</option><option value={next}>Next week · {next}</option></select></label>
  {data&&<><p className="text-sm font-medium">{data.submitted?'Submitted. Only future dates can be changed.':'Required: confirm your times before clocking in.'}</p>
  <div className="grid grid-cols-3 gap-2 text-xs text-foreground/60"><span>Day</span><span>Start</span><span>Finish</span></div>
  {Object.entries(days).map(([date,t])=>{const locked=date<data.effectiveFrom||date<data.today||(data.submitted&&date<=data.today);return <div key={date} className="grid grid-cols-[1fr_1fr_1fr] gap-2 items-center text-sm"><span>{new Date(date+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'})}</span><input aria-label={`${date} start`} className="input min-w-0" type="time" value={t.start} disabled={locked||busy} onChange={e=>setDays({...days,[date]:{...t,start:e.target.value}})}/><input aria-label={`${date} finish`} className="input min-w-0" type="time" value={t.end} disabled={locked||busy} onChange={e=>setDays({...days,[date]:{...t,end:e.target.value}})}/></div>;})}
  {validation&&<p role="alert" className="text-sm text-danger">{validation}</p>}
  <button className="admin-button" disabled={busy||!!validation} onClick={async()=>{setBusy(true);setError('');setMessage('');try{const r=await fetch('/api/employee/weekly-schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({week,days,revision:data.revision})});const d=await r.json();if(!r.ok)throw Error(d.error);setMessage(d.smsConfigured?'Saved. Admin SMS queued.':'Saved. Admin notified in app; SMS is not configured.');await load();onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'Saving…':data.submitted?'Save future changes':'Submit weekly schedule'}</button></>}
  {error&&<p role="alert" className="text-danger text-sm">{error} <button className="underline" onClick={()=>void load()}>Reload</button></p>}{message&&<p className="text-sm text-success">{message}</p>}
 </section>;
}
