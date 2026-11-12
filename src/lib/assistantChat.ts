import type {Prisma} from "@prisma/client";
// Shared by the chat write path and tests; one assistant item per saved message.
export async function queueAssistantChat(tx:Prisma.TransactionClient,user:{id:string;role:string;active:boolean;approved:boolean;mustChangePassword:boolean},message:{id:string;body:string}){
 if(user.role!=="EMPLOYEE" || !user.active || !user.approved || user.mustChangePassword || process.env.APP_ASSISTANT_ENABLED==="false")return null;
 const sourceKey=`chat:${message.id}`;
 const existing=await tx.assistantTurn.findUnique({where:{sourceKey}});if(existing)return existing;
 const limited=await tx.assistantTurn.count({where:{userId:user.id,source:{in:["CHAT","DIRECT"]},createdAt:{gte:new Date(Date.now()-3600000)}}})>=30;
 return tx.assistantTurn.create({data:{userId:user.id,sourceKey,source:"CHAT",body:message.body,...(limited?{status:"FAILED",reply:"Assistant message limit reached. Please use Requests or ask admin for help."}:{})}});
}
// Shared chat exposes private replies only to the author. Admin gets workflow status.
export async function assistantChatStatuses(tx:Prisma.TransactionClient,viewer:{id:string;role:string},messageIds:string[]){
 const turns=await tx.assistantTurn.findMany({where:{source:"CHAT",sourceKey:{in:messageIds.map(id=>`chat:${id}`)},...(viewer.role==="ADMIN"?{}:{userId:viewer.id})},select:{id:true,userId:true,sourceKey:true,status:true,reply:true,draftJson:true,requestId:true}});
 return new Map(turns.map(t=>[t.sourceKey.slice(5),{id:t.id,status:t.status,hasDraft:!!t.draftJson,submitted:!!t.requestId,reply:t.userId===viewer.id?t.reply:null,own:t.userId===viewer.id}]));
}

// Discover saved messages, not just queued turns. Small batches and the existing
// per-employee hourly allowance bound provider usage during historical catch-up.
export async function catchUpAssistantChats(tx:Prisma.TransactionClient){
 if(process.env.APP_ASSISTANT_ENABLED==="false" || !process.env.OPENAI_API_KEY?.trim())return 0;
 const cutoff=new Date(Date.now()-3600000);
 const messages=await tx.$queryRaw<{id:string;authorId:string;body:string}[]>`
  SELECT m.id, m.authorId, m.body FROM TeamMessage m JOIN User u ON u.id=m.authorId
  WHERE m.deletedAt IS NULL AND u.role='EMPLOYEE' AND u.active=1 AND u.approved=1 AND u.mustChangePassword=0
  AND NOT EXISTS (SELECT 1 FROM AssistantTurn a WHERE a.sourceKey='chat:' || m.id)
  AND (SELECT COUNT(*) FROM AssistantTurn recent WHERE recent.userId=u.id AND recent.source IN ('CHAT','DIRECT') AND recent.createdAt>=${cutoff})<30
  ORDER BY m.createdAt DESC, m.id DESC LIMIT 5`;
 let count=0;
 for(const msg of messages){
  const user=await tx.user.findUnique({where:{id:msg.authorId}});
  if(user && await queueAssistantChat(tx,user,msg))count++;
 }
 return count;
}
