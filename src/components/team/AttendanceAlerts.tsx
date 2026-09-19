"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { AttendanceReminder } from "@/lib/attendanceReminders";
import { attendanceChimeOnce, soundReady, unlockChime } from "@/lib/chatSound";
export default function AttendanceAlerts() {
  const [reminder,setReminder]=useState<AttendanceReminder|null>(null);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState("");
  const [userId,setUserId]=useState("");
  useEffect(()=>{
    let stopped=false,running=false,currentUser="";
    const poll=async()=>{
      if(running || document.visibilityState !== "visible") return;
      running=true;
      try {
        const response=await fetch("/api/attendance/reminders",{cache:"no-store"});
        if(!response.ok) {if(!stopped) setReminder(null);return;}
        const data=await response.json() as {userId:string;reminder:AttendanceReminder|null};
        if(stopped) return;
        currentUser=data.userId;setUserId(data.userId);
        setReminder(data.reminder);setReady(soundReady());
        if(data.reminder && soundReady()) await attendanceChimeOnce(data.userId,`${data.reminder.kind}:${data.reminder.key}`);
      } catch {if(!stopped) setReminder(null);}
      finally {running=false;}
    };
    void poll();const timer=setInterval(()=>void poll(),15000);
    const refresh=()=>void poll();
    const unlock=()=>{
      try {if(currentUser && localStorage.getItem(`mc-attendance-sound:${currentUser}`)==="on") void unlockChime().then(refresh).catch(()=>setReady(false));} catch { /* Storage may be unavailable. */ }
    };
    window.addEventListener("pointerdown",unlock);
    window.addEventListener("keydown",unlock);
    document.addEventListener("visibilitychange",refresh);
    window.addEventListener("focus",refresh);
    window.addEventListener("attendance-updated",refresh);
    window.addEventListener("attendance-sound-enabled",refresh);
    return ()=>{window.removeEventListener("pointerdown",unlock);window.removeEventListener("keydown",unlock);stopped=true;clearInterval(timer);document.removeEventListener("visibilitychange",refresh);window.removeEventListener("focus",refresh);window.removeEventListener("attendance-updated",refresh);window.removeEventListener("attendance-sound-enabled",refresh);};
  },[]);
  async function enable() {
    try {await unlockChime();localStorage.setItem(`mc-attendance-sound:${userId}`,"on");setReady(true);setError("");window.dispatchEvent(new Event("attendance-sound-enabled"));}
    catch {setError("Allow sound in this browser, then try again.");}
  }
  if(!reminder) return null;
  return <div role="status" className="max-w-6xl mx-auto px-4 sm:px-6 pb-3 text-sm">
    <div className="rounded-lg bg-white text-brand p-3 space-y-2">
      <p className="font-semibold">{reminder.message}</p>
      <Link className="underline font-semibold" href={reminder.href}>Open attendance →</Link>
      {!ready && <button className="ml-4 underline" onClick={enable}>Enable loud reminder sound</button>}
      {error && <p role="alert">{error}</p>}
    </div>
  </div>;
}
