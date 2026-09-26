"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Link from "next/link";
import { api, useAction, useTeamData } from "@/components/team/useTeamData";
import { ErrorNotice, Pager } from "@/components/team/TeamCommon";
import { todayWorkDate, formatIstDateTime } from "@/lib/time";
import { REVIEW_QUESTIONS, type Ratings } from "@/lib/customerReviews";
type Invite = { id: string; code: string; expiresAt: string; claimedAt: string | null };
type Data = { reviews: (Ratings & {id:string;createdAt:string;totalStars:number;points:number;user:{id:string;name:string}})[];total:number;points:number;average:number|null;invite:Invite|null;employees:{id:string;name:string}[];serverTime:string };
export default function StaffReviews({admin=false}:{admin?:boolean}) {
  const [month,setMonth] = useState(todayWorkDate().slice(0,7));
  const [employeeId,setEmployeeId] = useState("");
  const [page,setPage] = useState(1);
  const [now,setNow] = useState(Date.now());
  const [customerUrl,setCustomerUrl] = useState("");
  const [qr,setQr] = useState<{url:string;image:string}|null>(null);
  const [copied,setCopied] = useState(false);
  const {data,error,loading,reload} = useTeamData<Data>(`/api/team/reviews?month=${month}&employeeId=${encodeURIComponent(employeeId)}&page=${page}`,10000);
  const action = useAction(reload);
  const [fresh,setFresh] = useState<{invite:Invite;serverTime:string;receivedAt:number}|null>(null);
  const [clockOffset,setClockOffset] = useState(0);
  useEffect(() => {
    setCustomerUrl(`${window.location.origin}/review`);
    const timer=setInterval(()=>setNow(Date.now()),1000);
    return ()=>clearInterval(timer);
  },[]);
  useEffect(() => {if(data) {setClockOffset(+new Date(data.serverTime)-Date.now());setFresh(null);}},[data]);
  const invite = fresh?.invite ?? data?.invite;
  const serverNow = fresh ? now-fresh.receivedAt + +new Date(fresh.serverTime) : now+clockOffset;
  const remaining = invite ? Math.max(0,Math.min(300,Math.ceil((+new Date(invite.expiresAt)-serverNow)/1000))) : 0;
  const inviteUrl = invite && !invite.claimedAt && remaining > 0 && customerUrl ? `${customerUrl}#${new URLSearchParams({code:invite.code,invite:invite.id})}` : "";
  useEffect(() => {
    let active=true;
    setQr(null); setCopied(false);
    if(inviteUrl) void QRCode.toDataURL(inviteUrl,{width:320,margin:4,errorCorrectionLevel:"M"}).then(image=>{if(active)setQr({url:inviteUrl,image});}).catch(()=>{ /* The code and copy-link fallback remain available. */ });
    return ()=>{active=false;};
  },[inviteUrl]);
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-semibold">Customer reviews</h1><p className="text-sm text-foreground/60 mt-2">Five star ratings per review. 25 stars earns 1 point; 20 stars earns 0.8. Points are added automatically to the employee’s monthly points balance.</p></div>
    {!admin && <section className="admin-panel p-5 space-y-4">
      <h2 className="font-semibold">Invite a customer to review you</h2>
      <p className="text-sm">Generate a QR code and ask the customer to scan it with their phone camera. Then tap Start review—no address or code to type.</p>

      {invite && remaining > 0 ? <div className="rounded-xl bg-brand/5 p-5 text-center space-y-2">
        {invite.claimedAt ? <><p className="font-semibold">Customer is completing the review</p><p className="text-sm text-foreground/60">This code has been used. Their review can be submitted once.</p></> : <>{qr?.url === inviteUrl && <div className="mx-auto max-w-[320px] bg-white rounded-lg overflow-hidden">{/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr.image} width={320} height={320} alt="Scan to open your customer review" className="w-full h-auto" />
        </div>}<p className="font-semibold">Scan to rate your service</p><button className="admin-button" disabled={!inviteUrl} onClick={()=>{void action.run(async()=>{await navigator.clipboard.writeText(inviteUrl);setCopied(true);});}}>{copied ? "Link copied" : "Copy review link"}</button><p className="text-sm">Or open {customerUrl || "/review"} and enter this code</p><p className="text-5xl tracking-[0.25em] font-mono font-bold text-brand" aria-label={`Review code ${invite.code}`}>{invite.code}</p><p className="text-sm tabular-nums">Expires in {Math.floor(remaining/60)}:{String(remaining%60).padStart(2,"0")}</p></>}
      </div> : <><button className="admin-button" disabled={loading || action.busy} onClick={() => {void action.run(async()=>{const result=await api<{invite:Invite;serverTime:string}>("/api/team/reviews","POST",{});setFresh({...result,receivedAt:Date.now()});});}}>{action.busy ? "Generating…" : "Generate QR code"}</button><p className="text-xs text-foreground/60">Valid for five minutes. Each QR code is linked only to you and accepts one customer review.</p></>}
      <Link href="/employee/team?view=performance" className="text-brand underline text-sm block">View my points balance</Link>
    </section>}
    <ErrorNotice error={error || action.error}/>
    <div className="flex flex-wrap gap-3"><label className="text-sm">Month<input className="input mt-1" type="month" value={month} onChange={e=>{setMonth(e.target.value);setPage(1);}}/></label>{admin && <label className="text-sm">Employee<select className="input mt-1" value={employeeId} onChange={e=>{setEmployeeId(e.target.value);setPage(1);}}><option value="">All employees</option>{data?.employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>}</div>
    <div className="grid grid-cols-3 gap-3">{[["Reviews",data?.total ?? 0],["Average stars",data?.average == null ? "—" : `${data.average} / 5`],["Review points",data?.points ?? 0]].map(([label,value])=><div className="admin-panel p-4" key={label}><p className="text-xs text-foreground/60">{label}</p><p className="text-xl font-semibold mt-1">{value}</p></div>)}</div>
    {loading && <p role="status">Loading reviews…</p>}
    {data?.reviews.map(r=><article key={r.id} className="admin-panel p-4 space-y-3"><div className="flex justify-between gap-3"><div><h2 className="font-semibold">{r.user.name}</h2><p className="text-xs text-foreground/60">{formatIstDateTime(new Date(r.createdAt))}</p></div><span className="admin-badge self-start">+{r.points} points</span></div><dl className="space-y-2">{REVIEW_QUESTIONS.map(q=><div className="flex justify-between gap-2 text-sm" key={q.key}><dt>{q.label}</dt><dd className="whitespace-nowrap text-amber-600" aria-label={`${r[q.key]} out of 5 stars`}>{"★".repeat(r[q.key])}{"☆".repeat(5-r[q.key])}</dd></div>)}</dl></article>)}
    {!loading && data?.total === 0 && <p className="admin-panel p-5 text-foreground/60">No customer reviews this month.</p>}
    {data && <Pager page={page} total={data.total} onPage={setPage}/>}
  </div>;
}
