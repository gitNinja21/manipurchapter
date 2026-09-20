"use client";
import { useState } from "react";
import Link from "next/link";
import ReportControls from "@/components/admin/ReportControls";
import { useTeamData } from "./useTeamData";
import { ErrorNotice } from "./TeamCommon";
import { todayWorkDate,formatWorkDate,formatIstTime } from "@/lib/time";
import type { StreakDay,TalkStatus } from "@/lib/attendanceStreaks";
type Row=StreakDay & {
  userId:string;recordId:string|null;lateMinutes:number;earlyMinutes:number;lateIncident:boolean;earlyIncident:boolean;
  lateExcused:boolean;earlyExcused:boolean;penaltyActive:boolean;
  clockInAt:string|null;clockOutAt:string|null;expectedStartAt:string|null;requiredEndAt:string|null;arrivalAt:string|null;status:string;
};
type Data={from:string;to:string;today:string;employees:{id:string;name:string;employeeCode:string;active:boolean}[];rows:Row[];
  pendingMeetings:{id:string;userId:string;kind:string;triggerDate:string}[]};
const talkLabel:Record<TalkStatus,string>={NONE:"No talk due",SOON:"1 more incident → talk",DUE_TODAY:"Talk due after today",PENDING:"Talk pending",CLEARED:"Talk completed today",FOLLOW_UP:"Talk completed · follow-up period"};
const when=(value:string|null)=>value ? formatIstTime(new Date(value)) : "—";
const minutes=(value:number)=>value<1 && value>0 ? "<1 min" : `${Math.ceil(value*10)/10} min`;
const attention=(r:Row)=>r.lateMinutes>0 || r.earlyMinutes>0 || [r.lateTalk,r.earlyTalk].some(s=>["PENDING","SOON","DUE_TODAY"].includes(s));
export default function AttendanceTracking() {
  const today=todayWorkDate();
  const [range,setRange]=useState({from:`${today.slice(0,7)}-01`,to:today});
  const [employeeId,setEmployeeId]=useState(""),[filter,setFilter]=useState("attention"),[page,setPage]=useState(1);
  const {data,error,loading,reload}=useTeamData<Data>(`/api/team/attendance-tracking?from=${range.from}&to=${range.to}`,30000);
  const selected=data?.rows.filter(r=>!employeeId || r.userId===employeeId) ?? [];
  const rows=selected.filter(r=>filter==="all" || (filter==="late" ? r.lateIncident : filter==="early" ? r.earlyIncident : filter==="pending" ? r.lateTalk==="PENDING" || r.earlyTalk==="PENDING" : attention(r)));
  const pages=Math.max(1,Math.ceil(rows.length/50)),currentPage=Math.min(page,pages);
  const lastDay=selected.filter(r=>r.date===data?.to);
  const pending=data?.pendingMeetings.filter(m=>!employeeId || m.userId===employeeId) ?? [];
  const name=(id:string)=>data?.employees.find(e=>e.id===id)?.name ?? "Employee";
  const manage=(id:string)=>`/admin/team?view=performance&employeeId=${encodeURIComponent(id)}`;
  return <section className="space-y-5">
    <div><h2 className="text-xl font-semibold">Attendance tracking</h2><p className="text-sm text-foreground/65 mt-1">Date-wise late arrivals, early departures and manager talks. Times are in IST.</p></div>
    <div className="admin-panel p-4 space-y-3">
      <ReportControls {...range} onChange={(from,to)=>{setRange({from,to});setPage(1);}} />
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm">Employee<select className="input mt-1" value={employeeId} onChange={e=>{setEmployeeId(e.target.value);setPage(1);}}><option value="">All employees</option>{data?.employees.map(e=><option key={e.id} value={e.id}>{e.name}{e.active ? "" : " (inactive)"}</option>)}</select></label>
        <label className="text-sm">Show<select className="input mt-1" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}>{[["attention","Needs attention"],["all","All attendance"],["late","Late incidents (>15 min)"],["early","Early departures"],["pending","Pending talks"]].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <button className="admin-button" onClick={reload} disabled={loading}>Refresh</button>
      </div>
    </div>
    <ErrorNotice error={error} />
    {loading && <p role="status">Loading attendance tracking…</p>}
    {data && <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[["Pending talks now",pending.length],["One incident from a talk",lastDay.filter(r=>r.lateTalk==="SOON" || r.earlyTalk==="SOON").length],["Late on end date",lastDay.filter(r=>r.lateIncident).length],["Left early on end date",lastDay.filter(r=>r.earlyIncident).length]].map(([label,value])=><div key={label} className="admin-panel p-4"><p className="text-xs text-foreground/65">{label}</p><p className="text-2xl font-semibold mt-1">{value}</p></div>)}
      </div>
      {pending.length>0 && <div className="admin-panel p-4"><h3 className="font-semibold mb-2">Manager talks awaiting clearance</h3><ul className="space-y-2">{pending.map(m=><li key={m.id} className="text-sm flex flex-wrap gap-x-3"><strong>{name(m.userId)}</strong><span>{m.kind==="LATE" ? "Late arrivals" : "Early departures"} · triggered {formatWorkDate(m.triggerDate)}</span><Link href={manage(m.userId)} className="text-brand underline">Manage talk</Link></li>)}</ul></div>}
      <p className="text-xs text-foreground/65">Late incidents mean more than 15 minutes late. Any unexcused early departure counts. Off-days and approved leave are skipped; a compliant or missed working day breaks the streak. Today is provisional until the relevant clock-in/out is recorded. Manager-talk counts reset on clearance; subsequent incidents in that month use the existing penalty rules.</p>
      <div className="admin-panel overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm min-w-[1050px]">
        <thead><tr>{["Date / employee","Clock-in / finish","Late arrival","Early departure","Consecutive days","Manager talk"].map(label=><th key={label} className="text-left px-4 py-3">{label}</th>)}</tr></thead>
        <tbody>{rows.slice((currentPage-1)*50,currentPage*50).map(r=><tr key={`${r.userId}:${r.date}`} className="border-t border-border align-top">
          <td className="px-4 py-3"><p className="font-semibold">{name(r.userId)}</p><p>{formatWorkDate(r.date)}</p><p className="text-xs text-foreground/60 mt-1">{r.status}{r.date===data.today ? " · provisional" : ""}</p>{r.penaltyActive && <p className="text-xs text-accent">Post-talk penalty rules active</p>}</td>
          <td className="px-4 py-3"><p>In: {when(r.clockInAt)} <span className="text-xs text-foreground/60">(due {when(r.expectedStartAt)})</span></p><p>Out: {when(r.clockOutAt)}</p><p className="text-xs text-foreground/60">Required finish: {when(r.requiredEndAt)}</p>{r.arrivalAt && !r.clockInAt && <p className="text-xs">Arrival recorded: {when(r.arrivalAt)}</p>}</td>
          <td className={`px-4 py-3 ${r.lateIncident ? "text-danger" : ""}`}>{r.clockInAt ? minutes(r.lateMinutes) : "—"}{r.lateExcused ? <p className="text-xs">Excused · not counted</p> : r.lateMinutes>0 && r.lateMinutes<=15 ? <p className="text-xs">Within 15-minute grace</p> : null}</td>
          <td className={`px-4 py-3 ${r.earlyIncident ? "text-danger" : ""}`}>{r.clockOutAt ? minutes(r.earlyMinutes) : "—"}{r.earlyExcused && <p className="text-xs">Excused · not counted</p>}</td>
          <td className="px-4 py-3"><p>Late: <strong>{r.lateStreak}</strong> days</p><p>Early: <strong>{r.earlyStreak}</strong> days</p><p className="text-xs text-foreground/60">As of this date</p></td>
          <td className="px-4 py-3"><p>Late: {talkLabel[r.lateTalk]}</p><p>Early: {talkLabel[r.earlyTalk]}</p>{[r.lateTalk,r.earlyTalk].some(s=>s!=="NONE") && <Link href={manage(r.userId)} className="text-brand underline text-xs">View talks & points</Link>}{r.recordId && <Link href={`/admin/attendance?from=${r.date}&to=${r.date}&userId=${r.userId}`} className="text-brand underline text-xs block mt-1">View attendance</Link>}</td>
        </tr>)}</tbody>
      </table></div>{!rows.length && <p className="p-6 text-sm text-foreground/60">No attendance matches these dates and filters.</p>}
      <div className="p-4 border-t border-border flex flex-wrap justify-between items-center gap-3"><p className="text-sm">{rows.length} rows · page {currentPage} of {pages}</p><div className="flex gap-2"><button className="admin-button" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>Previous</button><button className="admin-button" disabled={currentPage===pages} onClick={()=>setPage(currentPage+1)}>Next</button></div></div></div>
    </>}
  </section>;
}
