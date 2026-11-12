import type {Prisma} from "@prisma/client";
export async function captureAssistantNotification(tx:Prisma.TransactionClient, notification:{id:string;userId:string;kind:string;title:string;href:string}, role:string){
 if(process.env.APP_ASSISTANT_ENABLED==="false" || notification.kind.startsWith("ASSISTANT"))return;
 await tx.assistantTurn.upsert({where:{sourceKey:`notification:${notification.id}`},create:{
  userId:notification.userId,sourceKey:`notification:${notification.id}`,source:"NOTIFICATION",sourceHref:notification.href,
  body:notification.title,status:"READY",reply:role==="ADMIN"
   ? "This notification may need your attention. Open the linked item to review it. No approval, attendance or payroll change has been made by the assistant."
   : "There is an update for you. Open the linked item for details. If you need help, send a private message above or ask admin below."
 },update:{}});
}
