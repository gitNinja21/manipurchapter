"use client";
import {useState} from "react";
export default function AnalyticsLogout(){const[error,setError]=useState(false);return <><button className="text-sm underline" onClick={async()=>{try{const r=await fetch("/api/analytics/auth/logout",{method:"POST"});if(!r.ok)throw new Error();location.href="/analytics";}catch{setError(true);}}}>Sign out</button>{error&&<span role="alert">Could not sign out. Try again.</span>}</>;}
