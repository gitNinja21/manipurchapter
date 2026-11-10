import {assertBeforeAdminCutoff} from "@/lib/adminClockOut";
import {missingClockInContext,reconcileMissingClockOut} from "@/lib/missingPunchServer";
import {todayWorkDate} from "@/lib/time";
import {durationSnapshot} from "@/lib/performance";
import {TeamError} from "@/lib/team";
import {enforceSelfieTheme} from "@/lib/selfieThemeServer";
import {SelfieThemeError} from "@/lib/selfieThemes";
import { lateClockOutRule } from "@/lib/attendanceTime";
import { notify } from "@/lib/team";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveDataUrlPhoto, deletePhotoByKey } from "@/lib/photoStorage";
import { euclideanDistance, isFaceMatch, parseDescriptor } from "@/lib/faceMatch";
import { checkWithinRestaurant, getRestaurantLocationConfig } from "@/lib/geofence";

async function handlePost(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!user.approved) {
    return NextResponse.json(
      { error: "Your account is still awaiting admin approval." },
      { status: 403 }
    );
  }

  let body: { photoDataUrl?: string; poseReceipt?: string; descriptor?: number[]; lat?: number; lng?: number; extraTimeReason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { photoDataUrl, descriptor, lat, lng } = body;
  if (!photoDataUrl) {
    return NextResponse.json({ error: "Photo is required." }, { status: 400 });
  }
  if (!descriptor || !Array.isArray(descriptor) || descriptor.length === 0) {
    return NextResponse.json({ error: "Could not read a face from that photo." }, { status: 400 });
  }

  const now = new Date();
  await reconcileMissingClockOut(user.id);
  const existing = await prisma.attendanceRecord.findFirst({
    where: { userId: user.id, clockInAt: { not: null }, clockOutAt: null },
    orderBy: { workDate: "desc" },
  });
  const missingSchedule = !existing ? await missingClockInContext(prisma,user,todayWorkDate(),now) : null;
  const source = existing ?? {workDate:todayWorkDate(),clockInAt:missingSchedule!.start,clockOutAt:null,
    extraTimeCutoff:missingSchedule!.end,policyVersion:3,earlyExcused:false};
  if (+now - +source.clockInAt! > 24 * 3600000) return NextResponse.json({error:"This shift is over 24 hours old. Ask admin for a correction."},{status:409});
  if (body.extraTimeReason !== undefined && (typeof body.extraTimeReason !== "string" || body.extraTimeReason.trim().length > 1000)) {
    return NextResponse.json({error:"The optional reason must be text, up to 1000 characters."},{status:400});
  }
  const extraTimeReason = body.extraTimeReason?.trim() || null;
  const hasExtraTime = !!source.extraTimeCutoff && now > source.extraTimeCutoff;

  // Location gate — a no-op unless RESTAURANT_LAT/RESTAURANT_LNG are set.
  // Checked before the face match so an off-site clock-out gets a clear,
  // honest reason rather than a face-match error.
  if (getRestaurantLocationConfig()) {
    if (typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json(
        { error: "Location access is required to clock out. Please allow location permissions and try again." },
        { status: 400 }
      );
    }
    const geofence = checkWithinRestaurant(lat, lng);
    if (geofence && !geofence.withinRange) {
      return NextResponse.json(
        {
          error: `You're about ${Math.round(geofence.distanceMeters)}m from the restaurant — you need to be within ${geofence.radiusMeters}m to clock out.`,
        },
        { status: 403 }
      );
    }
  }

  // Face match is a hard gate — see clock-in route for the full rationale.
  // This is what stops a coworker from punching someone else out later,
  // after they've actually already left.
  const enrolled = parseDescriptor(user.faceDescriptor);
  if (!enrolled) {
    return NextResponse.json(
      { error: "Your face isn't enrolled yet. Ask your manager to reset your onboarding." },
      { status: 409 }
    );
  }
  const faceDistance = euclideanDistance(enrolled, descriptor);
  const faceMatch = isFaceMatch(faceDistance);
  if (!faceMatch) {
    return NextResponse.json(
      { error: "That photo doesn't look like you. Please retake it in good lighting, facing the camera directly." },
      { status: 422 }
    );
  }

  await enforceSelfieTheme(prisma,user.id,"out",photoDataUrl,body.poseReceipt);

  let photoKey: string;
  try {
    photoKey = await saveDataUrlPhoto(photoDataUrl, user.id, "out");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save photo." },
      { status: 400 }
    );
  }

  const record = await prisma.$transaction(async (tx) => {
    await assertBeforeAdminCutoff(tx,source.workDate,now);
    await enforceSelfieTheme(tx,user.id,"out",photoDataUrl,body.poseReceipt,true);
    const exception = await tx.staffRequest.findFirst({where: {userId: user.id, kind: "EARLY_DEPARTURE", fromDate: source.workDate, status: "APPROVED"}});
    let target=existing;
    if(!target){
      const schedule=await missingClockInContext(tx,user,source.workDate,now);
      target=await tx.attendanceRecord.create({data:{userId:user.id,workDate:source.workDate,
        clockInAt:schedule.start,...durationSnapshot(schedule.start,schedule),missingPunch:"IN",approvalStatus:"PENDING"}});
      await tx.attendanceAudit.create({data:{recordId:target.id,userId:user.id,employeeName:user.name,employeeCode:user.employeeCode,
        workDate:source.workDate,actorId:user.id,actorName:user.name,action:"MISSING_CLOCK_IN_INFERRED",beforeJson:"null",
        afterJson:JSON.stringify({clockInAt:schedule.start,clockOutAt:now,missingPunch:"IN",source:"SAVED_SCHEDULE_AND_VERIFIED_CLOCK_OUT"})}});
    }
    const changed = await tx.attendanceRecord.updateMany({
      where: { id: target.id, clockOutAt: null, updatedAt: target.updatedAt },
      data: {
        clockOutAt: now,
        ...lateClockOutRule(source.workDate, now, source.policyVersion===4),
        earlyExcused: source.earlyExcused || !!exception,
        clockOutPhoto: photoKey,
        clockOutFaceMatch: faceMatch,
        clockOutFaceDistance: faceDistance,
        extraTimeReason,
        extraTimeStatus: hasExtraTime ? "AUTOMATIC" : "NOT_REQUIRED",
        approvalStatus: "PENDING",
      },
    });
    if (!changed.count) return null;
    const result = await tx.attendanceRecord.findUniqueOrThrow({where: {id: target.id}});
    if (result.lateClockOutStatus === "PENDING") {
      const request = await tx.staffRequest.create({data:{userId:user.id,kind:"LATE_CLOCK_OUT",fromDate:source.workDate,toDate:source.workDate,reason:extraTimeReason || "Clocked out after 10:45 pm IST. Admin approval is required for the time after 10:45 pm.",proposedIn:source.clockInAt,proposedOut:now,expectedRecordId:result.id,expectedUpdatedAt:result.updatedAt}});
      const admins = await tx.user.findMany({where:{role:"ADMIN",active:true},select:{id:true,role:true}});
      await notify(tx,admins,"REQUEST",request.id,`${user.name}: clock-out after 10:45 pm needs approval`,"team?view=requests");
    }
    return result;
  }).catch(async error=>{await deletePhotoByKey(photoKey);throw error;});
  if (!record) {await deletePhotoByKey(photoKey); return NextResponse.json({error: "This shift changed. Refresh before trying again."}, {status: 409});}

  return NextResponse.json({ ok: true, record, faceMatch });
}

export async function POST(req:NextRequest){try{return await handlePost(req);}catch(e){if(e instanceof SelfieThemeError || e instanceof TeamError)return NextResponse.json({error:e.message},{status:e.status});throw e;}}
