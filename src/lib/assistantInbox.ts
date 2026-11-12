import type {Prisma} from "@prisma/client";
export async function captureAssistantNotification(tx:Prisma.TransactionClient, notification:{id:string;userId:string;kind:string;title:string;href:string;entityKey:string}, role:string){
 if(process.env.APP_ASSISTANT_ENABLED==="false" || notification.kind.startsWith("ASSISTANT"))return;
 const requestId=notification.kind==="REQUEST"?notification.entityKey:notification.kind==="REQUEST_DECISION"?notification.entityKey.split(":")[0]:null;
 const request=requestId?await tx.staffRequest.findFirst({where:{id:requestId,...(role==="ADMIN"?{}:{userId:notification.userId})}}):null;
 await tx.assistantTurn.upsert({where:{sourceKey:`notification:${notification.id}`},create:{
  userId:notification.userId,sourceKey:`notification:${notification.id}`,source:"NOTIFICATION",sourceHref:notification.href,
  body:notification.title,status:"READY",requestId:request?.id,reply:request?`${request.kind.replaceAll("_"," ")}: ${request.fromDate} to ${request.toDate}. Status: ${request.status}. ${request.reason}. This is the existing request; no duplicate has been created.`:role==="ADMIN"
   ? "This notification may need your attention. Open the linked item to review it. No approval, attendance or payroll change has been made by the assistant."
   : "There is an update for you. Open the linked item for details. If you need help, send a private message above or ask admin below."
 },update:request?{requestId:request.id}:{}});
}

export async function catchUpAssistantNotifications(tx:Prisma.TransactionClient){
 if(process.env.APP_ASSISTANT_ENABLED==="false")return 0;
 const rows=await tx.$queryRaw<{id:string}[]>`
  SELECT n.id FROM Notification n JOIN User u ON u.id=n.userId
  WHERE u.active=1 AND (u.role='ADMIN' OR (u.role='EMPLOYEE' AND u.approved=1 AND u.mustChangePassword=0))
  AND n.kind NOT LIKE 'ASSISTANT%'
  AND NOT EXISTS (SELECT 1 FROM AssistantTurn a WHERE a.sourceKey='notification:' || n.id)
  ORDER BY n.createdAt DESC, n.id DESC LIMIT 20`;
 for(const row of rows){
  const n=await tx.notification.findUniqueOrThrow({where:{id:row.id},include:{user:{select:{role:true}}}});
  await captureAssistantNotification(tx,n,n.user.role);
 }
 return rows.length;
}
