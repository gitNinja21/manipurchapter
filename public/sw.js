self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  let data={};try{data=event.data?.json()||{};}catch{}
  event.waitUntil((async()=>{
    const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    // A visible page handles the custom chime; keep the OS notification silent there.
    const foreground=clients.some(c=>c.visibilityState==="visible");
    const chat=data.kind==="CHAT";
    const attendance=["ATTENDANCE_IN","ATTENDANCE_OUT"].includes(data.kind);
    const path=attendance ? (data.url === "/employee/team?view=requests" ? data.url : "/employee") : chat && ["/admin/team?view=chat","/employee/team?view=chat"].includes(data.url) ? data.url : "/";
    await self.registration.showNotification("Manipur Chapter",{
      body:attendance ? "Attendance reminder: open the app to check your clock-in or clock-out." : chat ? "A new team message is available. Sign in to read it." : "A new team announcement is available. Sign in to read it.",
      tag:data.tag || "announcement",silent:attendance ? foreground : chat ? !!data.silent || foreground : false,
      data:{url:path},
    });
  })());
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const path=event.notification.data?.url;
  const safe=["/admin/team?view=chat","/employee/team?view=chat","/employee","/employee/team?view=requests"].includes(path) ? path : "/";
  event.waitUntil(self.clients.openWindow(new URL(safe,self.location.origin).href));
});
