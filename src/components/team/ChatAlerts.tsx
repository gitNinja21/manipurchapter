"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { shouldChime } from "@/lib/chatAlerts";
import { unlockChime, soundReady, playChime, chimeOnce } from "@/lib/chatSound";
import { enableDevicePush, supportsPush } from "@/lib/pushClient";
type Alerts = {userId:string;mode:string;muted:boolean;cursor:string;since:string;publicKey:string|null;messages:{id:string;authorId:string|null;authorRole:string|null;createdAt:string}[]};
export default function ChatAlerts({root}:{root:string}) {
  const [data,setData]=useState<Alerts|null>(null), [ready,setReady]=useState(false), [notice,setNotice]=useState(""), [busy,setBusy]=useState(false), [newMessage,setNewMessage]=useState(false);
  const cursor=useRef(""), since=useRef(""), user=useRef("");
  useEffect(()=>{
    let stopped=false, running=false;
    const poll=async()=>{
      if(running || document.visibilityState !== "visible") return;
      running=true;
      try {
        const query=new URLSearchParams(cursor.current ? {after:cursor.current} : since.current ? {since:since.current} : {});
        const response=await fetch(`/api/team/chat/alerts?${query}`,{cache:"no-store"});
        if(!response.ok) return;
        const next=await response.json() as Alerts;
        if(stopped) return;
        if(user.current && user.current !== next.userId) {cursor.current="";since.current="";user.current=next.userId;return;}
        user.current=next.userId;cursor.current=next.cursor;since.current=next.since;setData(next);
        const enabled=localStorage.getItem(`mc-chat-sound:${next.userId}`)==="on";
        setReady(enabled && soundReady());
        for(const message of next.messages) {
          if(message.authorId === next.userId || next.muted) continue;
          setNewMessage(true);
          // No backlog of sounds when returning to a sleeping/background tab.
          if(enabled && Date.now()-Date.parse(message.createdAt)<30000 && shouldChime(next.mode,next.muted,next.userId,message.authorId,message.authorRole)) await chimeOnce(next.userId,message.id);
        }
      } catch { /* Existing notification UI continues to show connectivity errors. */ }
      finally {running=false;}
    };
    void poll();const timer=setInterval(()=>void poll(),5000);
    const visible=()=>{ if(document.visibilityState === "visible") {cursor.current="";since.current="";} void poll(); };
    const unlock=()=>{
      try { if(user.current && localStorage.getItem(`mc-chat-sound:${user.current}`)==="on") void unlockChime().then(()=>setReady(true)).catch(()=>setReady(false)); } catch {setReady(false);}
    };
    document.addEventListener("visibilitychange",visible);
    window.addEventListener("pointerdown",unlock);window.addEventListener("keydown",unlock);
    return ()=>{stopped=true;clearInterval(timer);document.removeEventListener("visibilitychange",visible);window.removeEventListener("pointerdown",unlock);window.removeEventListener("keydown",unlock);};
  },[]);
  async function enable() {
    if(!data) return;
    setBusy(true);setNotice("");
    // Both permission requests start within the user's click gesture.
    const audio=unlockChime();
    const push=data.publicKey && supportsPush() ? enableDevicePush(data.publicKey) : Promise.resolve();
    const [a,p]=await Promise.allSettled([audio,push]);
    if(a.status==="fulfilled") {
      try { localStorage.setItem(`mc-chat-sound:${data.userId}`,"on"); } catch {setNotice("Allow browser storage to enable sound and prevent duplicate chimes.");setBusy(false);return;}
      setReady(true);playChime();
      setNotice(p.status==="rejected" ? String(p.reason.message) : !data.publicKey ? "Bell enabled. Background notifications await administrator setup." : !supportsPush() ? "Bell enabled. For iPhone background alerts, add this site to the Home Screen and enable notifications there." : "Bell and device notifications enabled.");
    } else setNotice("Audio could not start. Tap Enable again and check your device volume.");
    setBusy(false);
  }
  async function preference(mode:string) {
    if(!data) return;setBusy(true);
    try {
      const response=await fetch("/api/team/profile",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({chatSoundMode:mode})});
      if(!response.ok) throw new Error("Could not save sound preference.");
      setData({...data,mode});setNotice("Sound preference saved.");
    } catch {setNotice("Could not save sound preference. Try again.");} finally {setBusy(false);}
  }
  if(!data) return null;
  return <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 border-t border-white/20 text-xs space-y-2">
    <div className="flex flex-wrap items-center gap-3">
      <button className="rounded border border-white/40 px-2 py-1" disabled={busy} onClick={()=>void enable()}>{ready ? "Test bell / enable device alerts" : "Enable notifications & sound"}</button>
      <label>Chat sound <select className="ml-2 rounded bg-white text-black p-1" value={data.mode} disabled={busy} onChange={e=>void preference(e.target.value)}>
        <option value="ADMIN">Admin messages only</option><option value="ALL">All team messages</option><option value="OFF">Muted</option>
      </select></label>
      <span>{data.muted ? "Chat alerts are muted in Team chat." : ready && data.mode!=="OFF" ? "Bell ready in this tab" : "Sound is off or needs a tap to enable"}</span>
      {newMessage && <Link href={`${root}/team?view=chat`} className="underline font-semibold" onClick={()=>setNewMessage(false)}>New team message · Open chat</Link>}
    </div>
    {notice && <p role="status">{notice}</p>}
  </div>;
}
