self.addEventListener("push", event => {
 let data={};try{data=event.data?.json()||{};}catch{}
 event.waitUntil(self.registration.showNotification("Manipur Chapter",{body:"A new team announcement is available. Sign in to read it.",tag:data.tag||"announcement",data:{url:"/"}}));
});
self.addEventListener("notificationclick", event => {
 event.notification.close();
 event.waitUntil(self.clients.openWindow(new URL("/",self.location.origin).href));
});
