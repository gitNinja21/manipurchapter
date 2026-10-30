"use client";
import {useEffect,useState} from "react";
import type {RollingDay} from "@/lib/analytics/rollingForecast";
type Data={today:string;from:string;to:string;results:RollingDay[];missing:string[];updatedAt:string;weatherStatus:string;incompleteDates:string[]};
const number=(n:number|null)=>n===null?"—":n.toLocaleString("en-IN",{maximumFractionDigits:1});
const money=(n:number|null)=>n===null?"—":`₹${Math.round(n).toLocaleString("en-IN")}`;
const hour=(h:number)=>`${String(h).padStart(2,"0")}:00`;
function ForecastChart({day,metric}:{day:RollingDay;metric:"guests"|"sales"}){
 const [selected,setSelected]=useState<number|null>(null);
 const format=metric==="sales"?money:number;
 const actual=(h:RollingDay["hours"][number])=>metric==="sales"?h.actualSales:h.actualGuests;
 const maximum=Math.max(1,...day.hours.flatMap(h=>[h[metric],actual(h)??0]));
 const top=Math.ceil(maximum/4)*4;
 const x=(h:number)=>82+h*32,y=(v:number)=>242-v/top*200;
 const current=day.hours.find(h=>h.state==="current");
 const point=selected===null?null:day.hours[selected];
 const path=(observed:boolean)=>day.hours.filter(h=>!observed||actual(h)!==null).map((h,i)=>`${i?"L":"M"}${x(h.hour)},${y(observed?actual(h)!:h[metric])}`).join(" ");
 return <div className="space-y-2"><h4 className="font-semibold">{metric==="sales"?"Sales by hour (₹)":"Guests by hour"}</h4>
 <div className="flex flex-wrap gap-4 text-sm"><span><span style={{color:"#6366f1"}}>●</span> Predicted</span><span><span style={{color:"#059669"}}>●</span> Actual{current?" (current hour incomplete)":""}</span>{current&&<span>Shaded area: current and remaining hours</span>}</div>
 <div className="overflow-x-auto"><svg viewBox="0 0 860 292" className="w-full min-w-[720px]" role="img" aria-label={`${day.date}: hourly ${metric}, predicted versus actual. Select an hour for exact values.`}>
 {current&&<rect x={x(current.hour)-16} y="32" width={842-x(current.hour)} height="210" fill="#6366f1" opacity="0.07"/>}
 {Array.from({length:5},(_,i)=>{const v=top*i/4;return <g key={i}><line x1="66" x2="834" y1={y(v)} y2={y(v)} stroke="currentColor" opacity="0.12"/><text x="58" y={y(v)+4} textAnchor="end" fontSize="11" fill="currentColor">{format(v)}</text></g>;})}
 {metric==="sales"&&<><path d={path(false)} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeDasharray="6 4"/><path d={path(true)} fill="none" stroke="#059669" strokeWidth="2.5"/></>}
 {day.hours.map(h=><g key={h.hour}>
 {metric==="guests"?<><rect x={x(h.hour)-11} y={y(h.guests)} width="10" height={242-y(h.guests)} fill="#6366f1" rx="2"/>{actual(h)!==null&&<rect x={x(h.hour)+1} y={y(actual(h)!)} width="10" height={242-y(actual(h)!)} fill="#059669" rx="2"/>}</>:<><circle cx={x(h.hour)} cy={y(h.sales)} r="3" fill="#6366f1"/>{actual(h)!==null&&<circle cx={x(h.hour)} cy={y(actual(h)!)} r="3" fill="#059669"/>}</>}
 <text x={x(h.hour)} y="262" textAnchor="middle" fontSize="10" fill="currentColor">{String(h.hour).padStart(2,"0")}</text>
 <rect x={x(h.hour)-15} y="32" width="30" height="236" fill="transparent" stroke={selected===h.hour?"#6366f1":"none"} tabIndex={0} role="button" aria-label={`${hour(h.hour)} predicted ${format(h[metric])}, actual ${format(actual(h))}`} onMouseEnter={()=>setSelected(h.hour)} onFocus={()=>setSelected(h.hour)} onClick={()=>setSelected(h.hour)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setSelected(h.hour);}}}><title>{hour(h.hour)} · Predicted {format(h[metric])} · Actual {format(actual(h))}</title></rect>
 </g>)}<text x="450" y="286" textAnchor="middle" fontSize="11" fill="currentColor">Hour (IST)</text></svg></div>
 <p className="text-sm min-h-6" aria-live="polite">{point?`${hour(point.hour)} · Predicted: ${format(point[metric])} · Actual${point.state==="current"?" so far":""}: ${format(actual(point))} · Error: ${format(metric==="sales"?point.salesError:point.guestError)}`:"Tap or hover over an hour to see its prediction, actual and error."}</p>
 </div>;
}
export default function AnalyticsForecast(){
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const [from,setFrom]=useState(today),[to,setTo]=useState(today),[data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[reload,setReload]=useState(0),[loading,setLoading]=useState(false);
 useEffect(()=>{const t=setInterval(()=>setReload(n=>n+1),60000);return()=>clearInterval(t);},[]);
 useEffect(()=>{const c=new AbortController();setLoading(true);setError("");setData(null);fetch(`/api/analytics/forecast/rolling?from=${from}&to=${to}`,{cache:"no-store",signal:c.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setData(d);}).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[from,to,reload]);
 return <div className="space-y-5"><section className="rounded-2xl border border-border p-5 space-y-3"><h2 className="text-xl font-semibold">Hourly forecast</h2><div className="flex flex-wrap gap-4 items-end"><label>From<input className="block rounded border p-2 bg-surface" type="date" value={from} max={today} onChange={e=>{setFrom(e.target.value);if(e.target.value>to)setTo(e.target.value);}}/></label><label>To<input className="block rounded border p-2 bg-surface" type="date" value={to} min={from} max={today} onChange={e=>setTo(e.target.value)}/></label><button className="rounded bg-brand px-4 py-2 text-white" onClick={()=>{setFrom(today);setTo(today);}}>Today</button><button className="underline" onClick={()=>setReload(n=>n+1)}>Refresh</button></div><p className="text-sm">One date: train on earlier recorded days. A range: train on the first day, predict the second, then include each finished day before predicting the next.</p><p className="text-xs">Hourly predictions update using earlier hours only. Past results are a replay of saved visit data, not forecasts saved at the time. Sales are bill values grouped by arrival hour; later bill edits can change this replay. Running bills are provisional.</p></section>
 {error&&<p role="alert">{error}</p>}{loading&&<p role="status">Loading hourly results…</p>}
 {data&&!data.results.length&&<p>No forecast available. Select a date with at least one earlier recorded day, or a range containing at least two recorded days.</p>}
 {data&&<p className="text-xs">{data.weatherStatus} {data.incompleteDates.length>0?`Days with running bills are excluded from training: ${data.incompleteDates.join(", ")}.`:""}</p>}
 {data?.missing.length? <p className="text-sm">No recorded visits or earlier training data for: {data.missing.join(", ")}. Missing dates are not treated as zero-demand days.</p>:null}
 {data?.results.map(day=>{const remaining=day.hours.filter(h=>h.state!=="past");return <section key={day.date} className="rounded-2xl border border-border p-5 space-y-4"><h3 className="text-lg font-semibold">{day.date} · {day.trainingDates.length} training day{day.trainingDates.length===1?"":"s"}</h3>
 <h4 className="font-medium">Hourly performance {day.date===today?"so far":""}</h4><p className="text-sm">Average absolute hourly error: {number(day.guestMAE)} guests · {money(day.salesMAE)} sales. Error = actual − predicted.</p>
 <details className="text-sm"><summary className="cursor-pointer">Forecast factors</summary><p>Guests: {day.model.selected.guests}. Sales: {day.model.selected.sales}. Compared on {day.model.validationDays} earlier days.</p><p>Calendar features compare weekday, weekend, holidays and festivals. Weather features compare hourly temperature, rain and humidity separately for daytime and evening. Features are used only when earlier-day validation improves error.</p><p>{day.model.monthEffectsActive?"Month-start, middle, end and distance to month-end are eligible.":"Month timing is waiting for at least three months of observations with coverage of early, middle and late month."}</p><p>Historical weather tests use recent readings from earlier hours. Current forecast weather affects only remaining hours. Weather is recorded at visits, so coverage is incomplete when no guests arrive.</p></details>
 <ForecastChart day={day} metric="guests"/>
 <ForecastChart day={day} metric="sales"/>
 {remaining.length>0&&<p className="text-xs">The current hour compares its full-hour prediction with actuals so far. Future hours show predictions only. Errors are calculated after each hour finishes.</p>}
 </section>;})}</div>;
}
