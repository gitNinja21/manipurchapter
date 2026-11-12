import {after} from "next/server";
import {queueAssistantChat} from "@/lib/assistantChat";
import {prisma} from "@/lib/prisma";
import {teamRoute,jsonBody,textField,TeamError,notify,memberWhere} from "@/lib/team";
import {assistantConfigured,processAssistantTurn} from "@/lib/assistantServer";
import {submitStaffRequest} from "@/lib/staffRequestSubmission";
import {parseAssistantResult} from "@/lib/assistantPolicy";
export const GET=teamRoute(async(u,req)=>{
  if(!u.active)throw new TeamError("Account inactive",403);
  const page=Math.max(1,Math.min(10000,Math.floor(Number(req.nextUrl.searchParams.get("page"))||1)));
  const where=u.role==="ADMIN"?{OR:[{escalated:true},{userId:u.id}]}:{userId:u.id};
  const [turns,total]=await prisma.$transaction([prisma.assistantTurn.findMany({where,orderBy:[{createdAt:"desc"},{id:"desc"}],take:20,skip:(page-1)*20,include:{user:{select:{name:true,employeeCode:true}}}}),prisma.assistantTurn.count({where})]);
  const requests=await prisma.staffRequest.findMany({where:{id:{in:turns.flatMap(t=>t.requestId?[t.requestId]:[])},...(u.role==="ADMIN"?{}:{userId:u.id})},select:{id:true,status:true}});
  const statuses=new Map(requests.map(r=>[r.id,r.status]));
  return {turns:turns.map(t=>({...t,requestStatus:t.requestId?statuses.get(t.requestId)??null:null})),total,configured:assistantConfigured()};
});
export const POST=teamRoute(async(u,req)=>{
  if(!u.active)throw new TeamError("Account inactive",403);
  const b=await jsonBody(req), action=String(b.action);
  if(action==="processChat") {
    if(!assistantConfigured())throw new TeamError("Assistant is disabled or its API key is missing. Check Railway configuration.",503);
    const msg=await prisma.teamMessage.findFirst({where:{id:String(b.messageId),deletedAt:null},include:{author:true}});
    if(!msg?.author || (u.role!=="ADMIN" && msg.authorId!==u.id))throw new TeamError("Message not found",404);
    const turn=await prisma.$transaction(async tx=>{
      const item=await queueAssistantChat(tx,msg.author!,msg);
      if(!item)throw new TeamError("Only active, approved employee messages can be processed.",400);
      if(item.status==="FAILED") {
        if(item.updatedAt.getTime()>Date.now()-60000)throw new TeamError("Wait one minute before retrying this message.",429);
        return tx.assistantTurn.update({where:{id:item.id},data:{status:"QUEUED"}});
      }
      return item;
    });
    after(async()=>{try{await processAssistantTurn(turn.id);}catch{console.warn("Assistant dispatch unavailable; queued for retry.");}});
    return {ok:true,status:turn.status};
  }
  if(action==="handled") {
    const changed=await prisma.assistantTurn.updateMany({where:{id:String(b.id),userId:u.id,source:"NOTIFICATION",status:"READY"},data:{status:"DISMISSED"}});
    if(!changed.count)throw new TeamError("Notification not found or already handled",404);
    return {ok:true};
  }
  if(u.role==="ADMIN"){
    if(action!=="resolve")throw new TeamError("Use Requests to review employee requests.",403);
    const note=textField(b.note,"Reply",1000);
    const result=await prisma.$transaction(async tx=>{
      const turn=await tx.assistantTurn.findFirst({where:{id:String(b.id),escalated:true,resolvedAt:null}});
      if(!turn)throw new TeamError("Open escalation not found",404);
      const saved=await tx.assistantTurn.update({where:{id:turn.id},data:{resolvedAt:new Date(),...(["QUEUED","PROCESSING","FAILED"].includes(turn.status)?{status:"READY"}:{}),reply:`Admin ${u.name}: ${note}`}});
      await notify(tx,[{id:turn.userId,role:"EMPLOYEE"}],"ASSISTANT_ADMIN",turn.id,"Admin replied to your message","team?view=assistant");return saved;
    });return {turn:result};
  }
  if(u.role!=="EMPLOYEE")throw new TeamError("Employee account required",403);
  if(action==="send"){
    if(!assistantConfigured())throw new TeamError("Assistant is not configured. Please use Requests.",503);
    const body=textField(b.body,"Message",2000),nonce=textField(b.nonce,"Message key",80);
    if(!/^[a-zA-Z0-9-]+$/.test(nonce))throw new TeamError("Invalid message key");
    const turn=await prisma.$transaction(async tx=>{
      const sourceKey=`direct:${u.id}:${nonce}`;
      const existing=await tx.assistantTurn.findUnique({where:{sourceKey}});if(existing)return existing;
      if(await tx.assistantTurn.count({where:{userId:u.id,source:{in:["CHAT","DIRECT"]},createdAt:{gte:new Date(Date.now()-3600000)}}})>=30)throw new TeamError("Please use Requests or wait before sending more assistant messages.",429);
      return tx.assistantTurn.create({data:{userId:u.id,sourceKey,source:"DIRECT",body}});
    });
    await processAssistantTurn(turn.id);return {ok:true};
  }
  const turn=await prisma.assistantTurn.findFirst({where:{id:String(b.id),userId:u.id}});
  if(!turn)throw new TeamError("Message not found",404);
  if(action==="confirm"){
    if(turn.requestId)return {request:await prisma.staffRequest.findFirst({where:{id:turn.requestId,userId:u.id}})};
    if(turn.status!=="READY"||!turn.draftJson)throw new TeamError("No draft to submit",409);
    const parsed=parseAssistantResult({reply:"Draft",escalate:false,draft:JSON.parse(turn.draftJson)});
    return submitStaffRequest(u,parsed.draft!,turn.id);
  }
  if(action==="dismiss"){
    await prisma.assistantTurn.updateMany({where:{id:turn.id,userId:u.id,status:{in:["READY","FAILED"]},requestId:null,escalated:false},data:{status:"DISMISSED",draftJson:null}});return {ok:true};
  }
  if(action==="escalate"){
    await prisma.$transaction(async tx=>{
      await tx.assistantTurn.update({where:{id:turn.id},data:{escalated:true}});
      const admins=await tx.user.findMany({where:{...memberWhere,role:"ADMIN"},select:{id:true,role:true}});
      await notify(tx,admins,"ASSISTANT_REVIEW",turn.id,`${u.name} needs admin help`,"team?view=assistant");
    });return {ok:true};
  }
  if(action==="retry"){
    if(!assistantConfigured())throw new TeamError("Assistant is not configured. Please use Requests.",503);
    if(turn.updatedAt.getTime()>Date.now()-60000)throw new TeamError("Please wait one minute before retrying.",429);
    await prisma.assistantTurn.updateMany({where:{id:turn.id,userId:u.id,status:"FAILED"},data:{status:"QUEUED"}});
    await processAssistantTurn(turn.id);return {ok:true};
  }
  throw new TeamError("Unknown action");
});
