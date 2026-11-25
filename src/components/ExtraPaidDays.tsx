"use client";
import {useEffect,useState} from "react";
import {api,useAction} from "./team/useTeamData";
import {todayWorkDate} from "@/lib/time";
type Allowance={days:number;creditDate:string|null;revision:number;dailyRateRs:number;payRs:number};
const money=(n:number)=>n.toLocaleString("en-IN",{style:"currency",currency:"INR"});
export default function ExtraPaidDays({employeeId,editable=false}:{employeeId?:string;editable?:boolean}){
 const [month,setMonth]=useState(todayWorkDate().slice(0,7)),[days,setDays]=useState(0),[date,setDate]=useState(todayWorkDate()),[data,setData]=useState<Allowance|null>(null),[error,setError]=useState(""),[version,setVersion]=useState(0),[saved,setSaved]=useState(false);
 const action=useAction();
 useEffect(()=>{const c=new AbortController();setData(null);setError("");setSaved(false);
  void api<Allowance>(`/api/payroll/extra-days?month=${month}${employeeId?`&employeeId=${encodeURIComponent(employeeId)}`:""}`,"GET",undefined,c.signal).then(d=>{if(c.signal.aborted)return;setData(d);setDays(d.days);const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);setDate(d.creditDate??(month===todayWorkDate().slice(0,7)?todayWorkDate():end));}).catch(e=>{if(!c.signal.aborted)setError(e instanceof Error?e.message:"Could not load allowance.");});return()=>c.abort();
 },[month,employeeId,version]);
 return <section className="admin-panel p-4 mt-4 space-y-3">
  <h3 className="font-semibold">Extra paid days</h3>
  <label className="block text-sm">Payroll month<input aria-label="Extra paid days month" className="input mt-1" type="month" max={todayWorkDate().slice(0,7)} value={month} disabled={action.busy} onChange={e=>{if(e.target.value)setMonth(e.target.value);}}/></label>
  {error&&<p role="alert" className="text-danger">{error} <button className="underline" onClick={()=>setVersion(v=>v+1)}>Reload</button></p>}
  {!data&&!error&&<p>Loading allowance…</p>}
  {data&&<>{editable?<>
   <label className="block text-sm">Extra days worked<select aria-label="Extra paid days" className="input mt-1" value={days} disabled={action.busy} onChange={e=>{setDays(Number(e.target.value));setSaved(false);}}>{Array.from({length:32},(_,n)=><option key={n} value={n}>{n} {n===1?"day":"days"}</option>)}</select></label>
   <label className="block text-sm">Credit date<input aria-label="Extra paid days credit date" className="input mt-1" type="date" min={`${month}-01`} max={todayWorkDate()} value={date} disabled={action.busy} onChange={e=>{setDate(e.target.value);setSaved(false);}}/></label>
   <p className="text-sm">{days} × {money(data.dailyRateRs)} = <strong>{money(days*data.dailyRateRs)}</strong> added to salary.</p>
   <p className="text-xs text-foreground/60">This is the monthly total. Saving replaces the previous value. Reports include it on the credit date. Set 0 to remove it. Use only for days not already paid through attendance or overtime bonuses.</p>
   <button className="admin-button" disabled={action.busy||!date} onClick={()=>void action.run(async()=>{const result=await api<{allowance:{days:number;creditDate:string;revision:number}}>("/api/payroll/extra-days","POST",{userId:employeeId,month,days,creditDate:date,revision:data.revision});setData({...data,...result.allowance,payRs:result.allowance.days*data.dailyRateRs});setSaved(true);})}>{action.busy?"Saving…":"Save extra paid days"}</button>
   {saved&&<p role="status" className="text-success">Saved. Payroll will include this allowance.</p>}
  </>:<p>{data.days} extra paid {data.days===1?"day":"days"} · <strong>{money(data.payRs)}</strong>{data.creditDate?` · Credit date: ${data.creditDate}`:""}. Updated by admin.</p>}</>}
  {action.error&&<p role="alert" className="text-danger">{action.error} <button className="underline" onClick={()=>setVersion(v=>v+1)}>Reload allowance</button></p>}
 </section>;
}
