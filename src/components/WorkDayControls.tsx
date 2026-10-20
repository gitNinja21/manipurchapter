"use client";
import { useEffect, useState } from "react";
import { todayWorkDate } from "@/lib/time";
type Day={mode:string;revision:number};
type Info={date:string;day:Day|null;attendanceCount:number};
export default function WorkDayControls({date:chosen,onChanged}:{date?:string;onChanged?:()=>void}){
 const [selected,setSelected]=useState(todayWorkDate),date=chosen ?? selected;
 const [info,setInfo]=useState<Info|null>(null),[action,setAction]=useState("CORRECTION"),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[reload,setReload]=useState(0),[error,setError]=useState(""),[message,setMessage]=useState("");
 useEffect(()=>{let active=true;setInfo(null);setConfirmed(false);setError("");setMessage("");fetch(`/api/admin/work-days?date=${date}`,{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}).then(d=>{if(active)setInfo(d);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[date,reload]);
 const monday=new Date(`${date}T12:00:00Z`).getUTCDay()===1;
 async function save(){if(!info || info.date!==date)return;setBusy(true);setError("");try{const r=await fetch("/api/admin/work-days",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({date,action,revision:info.day?.revision ?? 0,confirm:confirmed})});const d=await r.json();if(!r.ok)throw new Error(d.error);setInfo({...info,day:d.day});setConfirmed(false);setMessage(d.day.mode==="HOURLY"?"Hourly attendance pay is active. Automatic off-day pay is removed. Enter each employee’s hours and unpaid break below or in Attendance.":"This date is closed. The usual paid-off-day rules now apply.");onChanged?.();}catch(e){setError(e instanceof Error?e.message:"Could not update date.");}finally{setBusy(false);}}
 return <section className="admin-panel p-5 space-y-3"><h2 className="font-semibold text-lg">Working dates &amp; paid closures</h2>
 <p className="text-sm text-foreground/65">Changes apply to everyone on the selected date, including past dates. Other dates stay unchanged.</p>
 {!chosen && <label className="block text-sm">Date (IST)<input className="input mt-1" type="date" value={date} disabled={busy} onChange={e=>setSelected(e.target.value)}/></label>}
 {info && info.date===date && <p className="text-sm">{date}: <strong>{info.day?.mode==="HOURLY"?"Flexible hourly pay":info.day?.mode==="PAID_OFF"?"Closed / paid off":"Usual schedule and pay rules"}</strong>. {info.attendanceCount} saved attendance records.</p>}
 <label className="block text-sm">Action<select className="input mt-1" value={action} disabled={busy} onChange={e=>{setAction(e.target.value);setConfirmed(false);setMessage("");}}><option value="CORRECTION">Correction mode — actual hours for any date</option><option value="OPEN_MONDAY" disabled={!monday}>Open Monday — flexible clock-in/out</option><option value="CLOSE">Close date — usual paid-off salary</option></select></label>
 <p className="text-sm">{action==="CLOSE"?"Clock-in will be closed on this date. Payroll uses the same daily credit and eligibility as the usual Monday off, instead of attendance pay. Existing attendance stays saved.":"No fixed shift or late penalties. Pay = clocked duration minus the unpaid break entered by admin, multiplied by hourly rate. One hour of paid break is included, not added. No attendance means zero pay. Existing completed attendance counts immediately; old scheduled break deductions are removed when first switching to hourly pay."}</p>
 <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>I confirm this payroll change for everyone on {date}.</label>
 <div className="flex gap-3"><button className="admin-button" disabled={busy || !confirmed || info?.date!==date || (action==="OPEN_MONDAY" && !monday) || (action==="CORRECTION" && date>todayWorkDate())} onClick={()=>void save()}>{busy?"Saving…":"Apply date rule"}</button><button className="text-sm underline" disabled={busy} onClick={()=>setReload(v=>v+1)}>Refresh</button></div>
 {action==="CORRECTION" && date>todayWorkDate() && <p className="text-sm">Correction mode is available for today and past dates.</p>}
 {error && <p role="alert" className="text-red-700">{error}</p>}{message && <p role="status" className="text-green-800">{message}</p>}
 </section>;
}
