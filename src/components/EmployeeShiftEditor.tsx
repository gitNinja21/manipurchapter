"use client";
import { useCallback, useEffect, useState } from "react";
import type { EditableDay } from "@/lib/scheduleVersions";
const names=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const time=(n:number)=>`${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;
const minutes=(s:string)=>{const [h,m]=s.split(":").map(Number);return h*60+m;};
type Data={days:Record<string,EditableDay>;from:string;minDate:string;revision:string;current:string;versions:string[]};
export default function EmployeeShiftEditor({employeeId}:{employeeId:string}) {
  const [data,setData]=useState<Data|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const load=useCallback(async(from?:string)=>{
    setBusy(true);setError("");
    try {const res=await fetch(`/api/admin/employees/${employeeId}/schedule${from ? `?from=${from}` : ""}`); const value=await res.json();if(!res.ok)throw new Error(value.error);setData(value);}
    catch(e){setError(e instanceof Error ? e.message : "Could not load schedule.");}
    finally{setBusy(false);}
  },[employeeId]);
  useEffect(()=>{void load();},[load]);
  function change(day:string,patch:Partial<EditableDay>){setMessage("");setData(d=>d ? {...d,days:{...d.days,[day]:{...d.days[day],...patch}}}:d);}
  async function save(){
    setBusy(true);setError("");setMessage("");
    try{const res=await fetch(`/api/admin/employees/${employeeId}/schedule`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});const result=await res.json();if(!res.ok)throw new Error(result.error);await load(data?.from);setMessage(`Shift schedule saved, effective ${data?.from}.`);}
    catch(e){setError(e instanceof Error ? e.message : "Could not save schedule.");}finally{setBusy(false);}
  }
  return <section className="mt-6 border-t border-border pt-4 max-w-4xl">
    <h3 className="font-semibold">Shift timings</h3>
    <p className="text-sm text-foreground/70 mt-1">Times are in IST. Monday stays off. Changes start on the selected date; existing attendance stays unchanged. Approved date-specific shifts take priority.</p>
    {data && <fieldset disabled={busy} className="mt-3 space-y-3">
      <details className="text-sm"><summary>Current schedule</summary><p className="mt-2">{data.current}</p></details>
      <label className="block text-sm">Effective from <input aria-label="Schedule effective date" type="date" min={data.minDate} value={data.from} onChange={e=>{if(e.target.value){setMessage("");void load(e.target.value);}}} className="input ml-2 w-auto"/></label>
      {!!data.versions.length && <p className="text-xs text-foreground/70">Saved effective dates: {data.versions.join(", ")}. Saving the same date replaces that version. Later versions still take effect on their dates.</p>}
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Day","Start","Finish","Paid break (min)","Unpaid break (min)","Expected work"].map(h=><th key={h} className="text-left p-2">{h}</th>)}</tr></thead><tbody>
      {[1,2,3,4,5,6,0].map(day=>{const key=String(day),r=data.days[key];return <tr key={day} className="border-t border-border"><td className="p-2"><label><input type="checkbox" disabled={day===1} checked={!!r} onChange={e=>{setMessage("");setData(d=>{if(!d)return d;const days={...d.days};if(e.target.checked)days[key]={start:600,latest:600,duration:540,paidBreak:60,unpaidBreak:0};else delete days[key];return {...d,days};});}}/> {names[day]}</label></td>
      {r ? <><td className="p-2"><input aria-label={`${names[day]} start`} type="time" className="input" value={time(r.start)} onChange={e=>{if(e.target.value){const start=minutes(e.target.value);change(key,{start,duration:r.start+r.duration-start});}}}/></td><td className="p-2"><input aria-label={`${names[day]} finish`} type="time" className="input" value={time(r.start+r.duration)} onChange={e=>{if(e.target.value)change(key,{duration:minutes(e.target.value)-r.start});}}/></td>
      {(["paidBreak","unpaidBreak"] as const).map(field=><td key={field} className="p-2"><input aria-label={`${names[day]} ${field}`} type="number" min={0} step={1} className="input w-24" value={r[field]} onChange={e=>change(key,{[field]:Number(e.target.value)})}/></td>)}
      <td className="p-2">{((r.duration-r.paidBreak-r.unpaidBreak)/60).toFixed(2)} hrs<br/><span className="text-xs">{r.duration>0 ? (100*r.unpaidBreak/r.duration).toFixed(2):"—"}% unpaid</span></td></> : <td colSpan={5} className="p-2 text-foreground/60">Off</td>}</tr>;})}
      </tbody></table></div>
      <p className="text-xs text-foreground/70">Unpaid breaks are deducted proportionally to the time clocked. Paid breaks stay included in pay. The existing 15-minute arrival grace remains.</p>
      <button type="button" onClick={save} className="rounded-lg bg-brand px-4 py-2 text-white text-sm disabled:opacity-50">{busy ? "Saving…" : "Save shift timings"}</button>
    </fieldset>}
    {busy && !data && <p>Loading shift timings…</p>}{error && <p role="alert" className="mt-2 text-danger">{error} <button type="button" className="underline" onClick={()=>load(data?.from)}>Reload</button></p>}{message && <p role="status" className="mt-2 text-green-700">{message}</p>}
  </section>;
}
