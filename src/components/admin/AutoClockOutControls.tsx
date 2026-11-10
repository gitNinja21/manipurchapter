"use client";
import {useEffect,useState} from "react";
import {todayWorkDate} from "@/lib/time";
type Rule={enabled:boolean;cutoffAt:string;revision:number};
export default function AutoClockOutControls({onChanged}:{onChanged:()=>void}){
 const [date,setDate]=useState(todayWorkDate()),[time,setTime]=useState("22:30"),[enabled,setEnabled]=useState(false),[revision,setRevision]=useState(0),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{let active=true;setLoaded(false);setMessage("");fetch(`/api/admin/clock-out-cutoff?date=${date}`,{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);return d.rule as Rule|null;}).then(r=>{if(!active)return;setEnabled(r?.enabled??false);setRevision(r?.revision??0);setTime(r?new Date(new Date(r.cutoffAt).getTime()+19800000).toISOString().slice(11,16):"22:30");setLoaded(true);}).catch(e=>{if(active)setMessage(e.message);});return()=>{active=false;};},[date]);
 async function save(){setBusy(true);setMessage("");try{const r=await fetch("/api/admin/clock-out-cutoff",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({date,time,enabled,revision})});const d=await r.json();if(!r.ok)throw Error(d.error);setRevision(d.rule.revision);setMessage(enabled?`Automatic clock-out saved for ${date} at ${time} IST.`:"Automatic clock-out disabled for this date.");onChanged();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 return <section className="admin-panel p-4 space-y-3">
 <h2 className="font-semibold">Automatic clock-out for a date</h2>
 <p className="text-sm">At the selected time, clock out employees who are still clocked in. Earlier clock-outs stay unchanged. No missing-clock-out penalty applies. Pay uses the recorded time and each employee’s payroll rules.</p>
 <div className="flex flex-wrap items-end gap-3">
 <label className="text-sm">Date<input className="input block" type="date" min={todayWorkDate()} value={date} disabled={busy} onChange={e=>setDate(e.target.value)}/></label>
 <label className="text-sm">Clock-out time (IST)<input className="input block" type="time" value={time} disabled={!loaded||busy} onChange={e=>setTime(e.target.value)}/></label>
 <label className="text-sm"><input type="checkbox" checked={enabled} disabled={!loaded||busy} onChange={e=>setEnabled(e.target.checked)}/> Enable for this date</label>
 <button className="admin-button" disabled={!loaded||busy} onClick={()=>void save()}>{busy?"Saving…":"Save clock-out setting"}</button></div>
 <p className="text-xs text-foreground/60">If today’s chosen time has already passed, saving runs the cutoff immediately for attendance still open. Disabling or changing this setting does not undo completed clock-outs; use attendance corrections.</p>
 {message&&<p role="status" className="text-sm">{message}</p>}
 </section>;
}
