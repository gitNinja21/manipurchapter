"use client";
export function supportsPush() {
  return window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
export async function enableDevicePush(publicKey: string) {
  // Called directly from a click, before any other asynchronous work.
  const permission=await Notification.requestPermission();
  if(permission !== "granted") throw new Error("Sound is enabled, but device notifications were not allowed. Check your browser notification settings.");
  const reg=await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub=await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKey});
  const result=await fetch("/api/team/push",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(sub.toJSON())});
  if(!result.ok) {
    await sub.unsubscribe().catch(()=>false);
    throw new Error((await result.json()).error || "Could not enable device notifications.");
  }
}
