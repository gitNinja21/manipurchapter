"use client";
import {useState} from "react";
import Link from "next/link";
export default function RecoverPage(){
 const [step,setStep]=useState<"phone"|"code"|"password"|"done">("phone"),[phone,setPhone]=useState(""),[code,setCode]=useState(""),[password,setPassword]=useState(""),[confirm,setConfirm]=useState(""),[employeeCode,setEmployeeCode]=useState(""),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy)return;setError("");
  if(step==="password" && password!==confirm){setError("Passwords do not match.");return;}
  setBusy(true);
  try{
   const action=step==="phone"?"send":step==="code"?"verify":"reset";
   const res=await fetch("/api/auth/recovery",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...(action==="send"?{phone}:action==="verify"?{code}:{password})})});
   const data=await res.json();if(!res.ok)throw Error(data.error || "Recovery failed. Please try again.");
   if(step==="phone"){setMessage(data.message);setStep("code");}
   else if(step==="code"){setEmployeeCode(data.employeeCode);setCode("");setMessage("");setStep("password");}
   else {setPassword("");setConfirm("");setStep("done");}
  }catch(e){setError(e instanceof Error?e.message:"Could not connect. Try again.");}finally{setBusy(false);}
 }
 return <main className="review-backdrop min-h-screen flex items-center justify-center p-6"><section className="admin-panel p-6 max-w-md w-full space-y-5">
  <h1 className="text-2xl font-semibold">Recover employee account</h1>
  {step==="done" ? <p role="status">Your password has been changed. Previous sessions have been signed out. Sign in with your login ID <strong>{employeeCode}</strong> and new password.</p> : <form onSubmit={submit} className="space-y-4">
   {step==="phone" && <><p className="text-sm">Enter the mobile number saved in your employee profile. We’ll send an SMS code to verify it before showing your login ID or resetting your password.</p><label className="block text-sm">Registered mobile number<input className="input mt-1" type="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+91" required maxLength={24} disabled={busy}/></label></>}
   {step==="code" && <><p className="text-sm" role="status">{message}</p><label className="block text-sm">SMS code<input className="input mt-1" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{4,10}" maxLength={10} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))} required disabled={busy}/></label><p className="text-xs text-foreground/60">Codes expire after 10 minutes. To request another, wait at least 60 seconds, then choose Start again.</p></>}
   {step==="password" && <><p role="status">Your login ID: <strong>{employeeCode}</strong></p><p className="text-sm">Set a new password below, or return to sign in if you only needed your login ID.</p><label className="block text-sm">New password<input className="input mt-1" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={password} onChange={e=>setPassword(e.target.value)} required disabled={busy}/></label><label className="block text-sm">Confirm password<input className="input mt-1" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={confirm} onChange={e=>setConfirm(e.target.value)} required disabled={busy}/></label><p className="text-xs text-foreground/60">At least 8 characters. Complete this within five minutes.</p></>}
   <button className="admin-button w-full" disabled={busy}>{busy?"Please wait…":step==="phone"?"Send SMS code":step==="code"?"Verify code":"Save new password"}</button>
  </form>}
  {error && <p role="alert" className="text-danger text-sm">{error}</p>}
  {step!=="phone" && step!=="done" && <button disabled={busy} className="text-sm text-brand underline" onClick={()=>{setStep("phone");setError("");setCode("");setPassword("");setConfirm("");setEmployeeCode("");}}>Start again</button>}
  <p className="text-xs text-foreground/60">No access to your registered number, or sharing a number with another employee? Ask your admin to check your profile.</p>
  <Link className="text-sm text-brand underline block" href="/">Back to sign in</Link>
 </section></main>;
}
