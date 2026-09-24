import { teamRoute, jsonBody, TeamError, notify } from "@/lib/team";
import { prisma } from "@/lib/prisma";
import { todayWorkDate } from "@/lib/time";
import { parseDescriptor, euclideanDistance, isFaceMatch } from "@/lib/faceMatch";
import { saveDataUrlPhoto, deletePhotoByKey } from "@/lib/photoStorage";
import { checkFallbackIn } from "@/lib/locationFallback";
import { syncMeetings } from "@/lib/performanceServer";
export const POST = teamRoute(async (user,req) => {
  if (user.role !== "EMPLOYEE" || !user.active) throw new TeamError("Employee account required.",403);
  const body = await jsonBody(req), action = body.action;
  if (action !== "in" && action !== "out") throw new TeamError("Invalid action.");
  const enrolled = parseDescriptor(user.faceDescriptor), descriptor = body.descriptor;
  if (!enrolled || !Array.isArray(descriptor) || descriptor.length !== 128 || !descriptor.every(n => typeof n === "number" && Number.isFinite(n))) throw new TeamError("A valid enrolled face and selfie are required.",422);
  const distance = euclideanDistance(enrolled,descriptor);
  if (!isFaceMatch(distance)) throw new TeamError("Selfie does not match. Please retake in good lighting.",422);
  if (typeof body.photoDataUrl !== "string") throw new TeamError("Selfie required.");
  const now = new Date(), kind = action === "in" ? "GPS_CLOCK_IN" : "GPS_CLOCK_OUT";
  const photo = await saveDataUrlPhoto(body.photoDataUrl,user.id,action);
  try {
    const result = await prisma.$transaction(async tx => {
      const open = await tx.attendanceRecord.findFirst({where:{userId:user.id,clockInAt:{not:null},clockOutAt:null},orderBy:{workDate:"desc"}});
      const date = action === "out" ? open?.workDate : todayWorkDate();
      if (!date || (action === "out" && (!open?.clockInAt || +now - +open.clockInAt > 86400000))) throw new TeamError("No valid open shift. Ask for an attendance correction.",409);
      if (action === "in") await checkFallbackIn(tx,user,date,now);
      if (await tx.staffRequest.findFirst({where:{userId:user.id,kind,fromDate:date,status:"PENDING"}})) throw new TeamError("A GPS fallback request is already pending. Check Team → Requests.",409);
      const record = await tx.attendanceRecord.findUnique({where:{userId_workDate:{userId:user.id,workDate:date}}});
      const request = await tx.staffRequest.create({data:{userId:user.id,kind,fromDate:date,toDate:date,reason:"Location unavailable. Please verify my physical presence at the restaurant.",proposedIn:action === "in" ? now : open!.clockInAt,proposedOut:action === "out" ? now : null,verificationPhoto:photo,verificationDistance:distance,expectedRecordId:record?.id ?? null,expectedUpdatedAt:record?.updatedAt ?? null}});
      if (action === "in" && (await syncMeetings(tx,user.id,date)).length) await tx.arrivalAttempt.upsert({where:{userId_workDate:{userId:user.id,workDate:date}},create:{userId:user.id,workDate:date,arrivedAt:now,photo},update:{}});
      await notify(tx,await tx.user.findMany({where:{role:"ADMIN",active:true},select:{id:true,role:true}}),"REQUEST",request.id,`${user.name}: GPS clock-${action} needs physical verification`,"team?view=requests");
      return {ok:true,requestId:request.id};
    });
    return result;
  } catch(error) { await deletePhotoByKey(photo); throw error; }
});
