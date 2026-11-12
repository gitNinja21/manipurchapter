import {prisma} from "./prisma";
import {parseAssistantResult} from "./assistantPolicy";
import {submitStaffRequest} from "./staffRequestSubmission";
import {TeamError,notify,memberWhere} from "./team";
// Only PENDING requests can be created here. All actual approvals remain in the
// existing admin endpoint. Linking the draft is transactional with creation.
export async function dispatchAssistantDraft(id:string){
 const turn=await prisma.assistantTurn.findUnique({where:{id},include:{user:true}});
 if(!turn || turn.status!=="READY" || !turn.draftJson || turn.requestId || !["CHAT","DIRECT"].includes(turn.source))return;
 try{
  const draft=parseAssistantResult({reply:"Draft",escalate:false,draft:JSON.parse(turn.draftJson)}).draft!;
  const existing=await prisma.staffRequest.findFirst({where:{userId:turn.userId,kind:draft.kind,fromDate:draft.fromDate,toDate:draft.toDate,status:{in:["PENDING","APPROVED"]},...(draft.kind==="CORRECTION"?{proposedIn:new Date(draft.proposedIn!),proposedOut:new Date(draft.proposedOut!)}:{})}});
  if(existing){
   await prisma.assistantTurn.updateMany({where:{id,status:"READY",requestId:null},data:{requestId:existing.id,status:"SUBMITTED",reply:"This request already exists. Track its current status in Requests; no duplicate was created."}});
   return;
  }
  await submitStaffRequest(turn.user,draft,id);
 }catch(error){
  // Do not overwrite a request submitted by a concurrent worker.
  await prisma.$transaction(async tx=>{
   const changed=await tx.assistantTurn.updateMany({where:{id,status:"READY",requestId:null},data:{draftJson:null,escalated:true,reply:`The request could not be submitted automatically. ${error instanceof TeamError?error.message:"Admin needs to review this message."} Sent to admin for help. No attendance or salary was changed.`}});
   if(!changed.count)return;
   const admins=await tx.user.findMany({where:{...memberWhere,role:"ADMIN"},select:{id:true,role:true}});
   await notify(tx,admins,"ASSISTANT_REVIEW",id,`${turn.user.name}: request needs admin help`,"team?view=assistant");
  });
 }
}
