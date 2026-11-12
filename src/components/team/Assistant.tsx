"use client";
import {useRef,useState} from "react";
import {api,useAction,useTeamData} from "./useTeamData";
import {ErrorNotice,Pager} from "./TeamCommon";
import {formatIstDateTime} from "@/lib/time";
import type {AssistantDraft} from "@/lib/assistantPolicy";
type Turn={id:string;body:string;reply:string|null;status:string;source:string;sourceHref:string|null;draftJson:string|null;requestId:string|null;requestStatus:string|null;escalated:boolean;resolvedAt:string|null;createdAt:string;user:{name:string;employeeCode:string}};
export default function Assistant({admin}:{admin:boolean}){
 const [body,setBody]=useState(""),[page,setPage]=useState(1),[notes,setNotes]=useState<Record<string,string>>({});
 const nonce=useRef<string|null>(null);
 const {data,error,loading,reload}=useTeamData<{turns:Turn[];total:number;configured:boolean}>(`/api/team/assistant?page=${page}`,10000);
 const action=useAction(reload);
 const act=(name:string,id:string)=>action.run(()=>api("/api/team/assistant","POST",{action:name,id}));
 return <div className="space-y-4">
  <h2 className="text-xl font-semibold">{admin?"Assistant inbox":"My assistant"}</h2>
  <p className="text-sm text-foreground/70">{admin?"Notifications and employee messages needing help appear here. Open the linked item to act, or reply to escalated questions. Leave and attendance approvals remain in Requests.":"Ask about attendance, leave or your pay. The assistant submits complete requests automatically for admin approval and asks for missing details. It cannot approve requests or change your salary."}</p>
  <a className="underline" href={`/${admin?"admin":"employee"}/team?view=requests`}>Open Requests</a>
  {!admin&&<>
   <p className="text-xs text-foreground/60">Notifications and your Team Chat messages also appear here. Chat messages receive private assistance. Messages and limited information from your own account are processed by OpenAI. Admin can read messages escalated for help. Do not include passwords or OTPs.</p>
   {data&&!data.configured&&<p role="status">Assistant unavailable: admin needs to configure it. The Requests form remains available.</p>}
   <form className="admin-panel p-4 space-y-3" onSubmit={e=>{e.preventDefault();void action.run(async()=>{nonce.current??=crypto.randomUUID();await api("/api/team/assistant","POST",{action:"send",body,nonce:nonce.current});nonce.current=null;setBody("");setPage(1);});}}>
    <label className="block" htmlFor="assistant-message">Your message</label>
    <textarea id="assistant-message" className="admin-input w-full" rows={3} required maxLength={2000} value={body} onChange={e=>{setBody(e.target.value);nonce.current=null;}} placeholder="I need leave tomorrow because…" disabled={action.busy}/>
    <button className="admin-button" disabled={action.busy||!data?.configured}>{action.busy?"Working…":"Send to assistant"}</button>
   </form>
  </>}
  <ErrorNotice error={error||action.error}/>
  {loading&&!data&&<p>Loading messages…</p>}
  {data?.turns.length===0&&<p>{admin?"No messages need admin help.":"Your messages and request updates will appear here."}</p>}
  {data?.turns.map(t=>{
   const draft=t.draftJson?JSON.parse(t.draftJson) as AssistantDraft:null;
   return <article key={t.id} className="admin-panel p-5 space-y-3">
    <div className="text-sm text-foreground/60">{admin?`${t.user.name} · ${t.user.employeeCode} · `:""}{formatIstDateTime(new Date(t.createdAt))} · {t.source.toLowerCase()} · {t.status.toLowerCase()}</div>
    <p className="whitespace-pre-wrap">{t.body}</p>
    <div className="bg-foreground/5 rounded-lg p-3 whitespace-pre-wrap">{t.requestId?`Request ${t.requestStatus?.toLowerCase()||"submitted"}. See Requests for the decision and details.`:t.reply||"Waiting for the assistant…"}</div>
    {t.sourceHref&&(t.sourceHref==="/account"||t.sourceHref.startsWith(admin?"/admin/":"/employee/"))&&<a className="underline block" href={t.sourceHref}>Open notification and take action</a>}
    {t.source==="NOTIFICATION"&&t.status==="READY"&&<button className="admin-button" disabled={action.busy} onClick={()=>void act("handled",t.id)}>Mark handled in assistant</button>}
    {t.escalated&&<p className="text-sm">{t.resolvedAt?"Admin has replied.":"Sent to admin for help."}</p>}
    {!admin&&draft&&t.status==="READY"&&<div className="border rounded-lg p-4 space-y-2">
     <h3 className="font-semibold">Request being prepared — not submitted yet</h3>
     <p>{draft.kind.replaceAll("_"," ")}: {draft.fromDate}{draft.toDate!==draft.fromDate?` to ${draft.toDate}`:""}</p>
     {draft.proposedIn&&<p>Clock in: {formatIstDateTime(new Date(draft.proposedIn))}<br/>Clock out: {formatIstDateTime(new Date(draft.proposedOut!))}</p>}
     <p>Reason: {draft.reason}</p>
     <p className="text-sm">The assistant will submit this request for admin review. Contact admin if anything is wrong.</p>
     <button className="admin-button" disabled={action.busy} onClick={()=>void act("confirm",t.id)}>Submit for admin approval</button>
    </div>}
    {!admin&&<div className="flex gap-2 flex-wrap">
     {t.status==="FAILED"&&<button className="admin-button" disabled={action.busy} onClick={()=>void act("retry",t.id)}>Retry</button>}
     {!t.escalated&&t.status!=="DISMISSED"&&<button className="admin-button" disabled={action.busy} onClick={()=>void act("escalate",t.id)}>Ask admin for help</button>}
     {!t.escalated&&!t.requestId&&["READY","FAILED"].includes(t.status)&&<button className="admin-button" disabled={action.busy} onClick={()=>void act("dismiss",t.id)}>Dismiss</button>}
    </div>}
    {admin&&t.escalated&&!t.resolvedAt&&<form className="space-y-2" onSubmit={e=>{e.preventDefault();void action.run(()=>api("/api/team/assistant","POST",{action:"resolve",id:t.id,note:notes[t.id]}));}}>
     <label htmlFor={`reply-${t.id}`}>Admin reply</label>
     <textarea id={`reply-${t.id}`} className="admin-input w-full" required maxLength={1000} value={notes[t.id]||""} onChange={e=>setNotes({...notes,[t.id]:e.target.value})}/>
     <button className="admin-button" disabled={action.busy}>Reply and resolve</button>
    </form>}
   </article>;
  })}
  {data&&<Pager page={page} total={data.total} size={20} onPage={setPage}/>}
 </div>;
}
