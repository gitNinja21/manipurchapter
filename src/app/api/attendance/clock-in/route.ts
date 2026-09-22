import { effectiveSchedule, syncMeetings, penaltyContext } from "@/lib/performanceServer";
import { durationSnapshot } from "@/lib/performance";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { todayWorkDate } from "@/lib/time";
import { saveDataUrlPhoto, deletePhotoByKey } from "@/lib/photoStorage";
import { euclideanDistance, isFaceMatch, parseDescriptor } from "@/lib/faceMatch";
import { checkWithinRestaurant, getRestaurantLocationConfig } from "@/lib/geofence";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!user.approved) {
    return NextResponse.json(
      { error: "Your account is still awaiting admin approval." },
      { status: 403 }
    );
  }

  let body: { photoDataUrl?: string; descriptor?: number[]; lat?: number; lng?: number };
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
  const workDate = todayWorkDate();
  const schedule = await effectiveSchedule(prisma, user, workDate);
  if (user.weeklyScheduleJson && !schedule) return NextResponse.json({error: "You have no scheduled shift today. Ask your admin to assign one."}, {status: 403});
  if (schedule && now < schedule.opens) return NextResponse.json({error: "Clock-in opens 15 minutes before your scheduled start. For an earlier start, submit a shift-change request and obtain admin approval; same-day requests are allowed."}, {status: 403});
  const leave = await prisma.staffRequest.findFirst({where: {userId: user.id, kind: "LEAVE", status: "APPROVED", fromDate: {lte: workDate}, toDate: {gte: workDate}}});
  if (leave) return NextResponse.json({error: "You have approved leave today. Ask your manager to resolve this before clock-in."}, {status: 409});
  const open = await prisma.attendanceRecord.findFirst({where: {userId: user.id, clockInAt: {not: null}, clockOutAt: null}});
  if (open) return NextResponse.json({error: "You already have an open shift. Clock out or ask your admin to correct it before starting another."}, {status: 409});

  const existing = await prisma.attendanceRecord.findUnique({
    where: { userId_workDate: { userId: user.id, workDate } },
  });
  if (existing?.clockInAt) {
    return NextResponse.json(
      { error: "You've already clocked in today." },
      { status: 409 }
    );
  }

  // Location gate — a no-op unless RESTAURANT_LAT/RESTAURANT_LNG are set in
  // the environment. Checked before the face match so someone clocking in
  // from off-site gets a clear, honest reason rather than a face-match error.
  if (getRestaurantLocationConfig()) {
    if (typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json(
        { error: "Location access is required to clock in. Please allow location permissions and try again." },
        { status: 400 }
      );
    }
    const geofence = checkWithinRestaurant(lat, lng);
    if (geofence && !geofence.withinRange) {
      return NextResponse.json(
        {
          error: `You're about ${Math.round(geofence.distanceMeters)}m from the restaurant — you need to be within ${geofence.radiusMeters}m to clock in.`,
        },
        { status: 403 }
      );
    }
  }

  // Face match is a hard gate: a clock-in only succeeds if the selfie
  // matches the employee's own enrolled reference photo. This is what
  // stops a coworker from punching someone else in on their account — a
  // mismatch is rejected outright rather than just flagged, and nothing is
  // written to the database or disk. A genuine false rejection (bad
  // lighting, a mask, a new haircut) just means retaking the photo; if it
  // keeps happening, an admin can reset onboarding to re-enroll their face.
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

  let photoKey: string;
  try {
    photoKey = await saveDataUrlPhoto(photoDataUrl, user.id, "in");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save photo." },
      { status: 400 }
    );
  }

  const record = await prisma.$transaction(async (tx) => {
    const duplicate = await tx.attendanceRecord.findFirst({where: {userId: user.id, OR: [{clockInAt: {not: null}, clockOutAt: null}, {workDate, clockInAt: {not: null}}]}});
    if (duplicate) return null;
    const pending = await syncMeetings(tx, user.id, workDate);
    if (pending.length) {
      const attempt = await tx.arrivalAttempt.upsert({where: {userId_workDate: {userId: user.id, workDate}},
        create: {userId: user.id, workDate, arrivedAt: now, photo: photoKey, latitude: lat, longitude: lng}, update: {}});
      return {meetingRequired: true, arrivedAt: attempt.arrivedAt, arrivalPhoto: attempt.photo};
    }
    const attempt = await tx.arrivalAttempt.findUnique({where: {userId_workDate: {userId: user.id, workDate}}});
    const clockInAt = attempt?.approvedAt ?? now;
    const currentSchedule = await effectiveSchedule(tx, user, workDate);
    const approval = await tx.staffRequest.findFirst({where: {userId: user.id, kind: "LATE_ARRIVAL", fromDate: workDate, status: "APPROVED"}});
    const rules = {
      clockInAt, ...durationSnapshot(clockInAt, currentSchedule),
      extraTimeStatus: "NOT_REQUIRED", lateArrivalRequestId: approval?.id ?? null, lateExcused: !!approval,
      ...await penaltyContext(tx, user.id, workDate),
      approvalStatus: "PENDING", clockInPhoto: photoKey, clockInFaceMatch: faceMatch, clockInFaceDistance: faceDistance,
    };
    return tx.attendanceRecord.upsert({where: {userId_workDate: {userId: user.id, workDate}},
      create: {userId: user.id, workDate, ...rules}, update: rules});

  });
  if (!record) await deletePhotoByKey(photoKey);
  if (record && "meetingRequired" in record && record.arrivalPhoto !== photoKey) await deletePhotoByKey(photoKey);
  if (!record) return NextResponse.json({error: "A clock-in has already been recorded. Refresh the page."}, {status: 409});
  if ("meetingRequired" in record) return NextResponse.json({error: "Your arrival has been recorded. Meet your manager, then open Team → Performance for clearance. Retry clock-in after approval; your approved arrival time will be used.", code: "MEETING_REQUIRED", arrivedAt: record.arrivedAt}, {status: 403});
  return NextResponse.json({ ok: true, record, faceMatch });
}
