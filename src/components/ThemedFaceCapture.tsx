"use client";
import {useEffect,useState} from "react";
import FaceCapture from "./FaceCapture";
import SelfiePoseGuide from "./SelfiePoseGuide";
import {isSelfieTheme,type SelfieAction,type SelfieThemeKey} from "@/lib/selfieThemes";
type Data={theme:{key:SelfieThemeKey;revision:number}|null;exempt:boolean;configured:boolean};
export default function ThemedFaceCapture({action,onCaptured,onCancel}:{action:SelfieAction;onCaptured:(photo:string,descriptor:number[],receipt?:string|null)=>void;onCancel:()=>void}){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[started,setStarted]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{const c=new AbortController();setData(null);setError("");setStarted(false);fetch(`/api/attendance/selfie-theme?action=${action}`,{cache:"no-store",signal:c.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(d.theme&&!isSelfieTheme(d.theme.key))throw Error("Unknown selfie theme. Ask your admin for help.");setData(d);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[action,reload]);
 if(!data)return <div className="space-y-3"><p role="status">{error||"Checking today’s selfie theme…"}</p>{error&&<button className="underline" onClick={()=>setReload(n=>n+1)}>Retry</button>}<button className="underline ml-3" onClick={onCancel}>Cancel</button></div>;
 const themed=!!data.theme&&!data.exempt;
 async function verify(photoDataUrl:string){const r=await fetch("/api/attendance/selfie-theme/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,photoDataUrl})});const d=await r.json();if(!r.ok)throw Error(d.error||"Pose check failed. Please retry.");return d.receipt as string|null;}
 return <div className="space-y-4">
 {themed&&<><SelfiePoseGuide theme={data.theme!.key}/><p className="text-xs">Your photo will be sent to OpenAI to check the pose. Attendance is saved only after the pose and normal attendance checks pass.</p>{!data.configured&&<p role="alert">The pose service is not configured. Ask your admin for a theme exception or to disable today’s theme.</p>}</>}
 {data.exempt&&data.theme&&<p className="text-sm">An admin granted you a theme exception for this clock-{action}. Normal selfie verification still applies.</p>}
 {(!themed||started)?<>{themed&&<p className="text-sm font-medium">Follow the example above, then tap Take photo. If it doesn’t pass, adjust your pose and try again.</p>}<FaceCapture mode="verify" onCaptured={onCaptured} onCancel={onCancel} verifyPhoto={themed?verify:undefined}/></>:<div className="flex gap-4"><button className="admin-button disabled:opacity-50" disabled={!data.configured} onClick={()=>setStarted(true)}>I understand — open camera</button><button className="underline" onClick={onCancel}>Cancel</button></div>}
 </div>;
}
