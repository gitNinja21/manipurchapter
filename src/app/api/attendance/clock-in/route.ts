import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { todayWorkDate } from "@/lib/time";
import { saveDataUrlPhoto } from "@/lib/photoStorage";
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

  const workDate = todayWorkDate();

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

  const now = new Date();
  const record = await prisma.attendanceRecord.upsert({
    where: { userId_workDate: { userId: user.id, workDate } },
    create: {
      userId: user.id,
      workDate,
      clockInAt: now,
      clockInPhoto: photoKey,
      clockInFaceMatch: faceMatch,
      clockInFaceDistance: faceDistance,
    },
    update: {
      clockInAt: now,
      clockInPhoto: photoKey,
      clockInFaceMatch: faceMatch,
      clockInFaceDistance: faceDistance,
    },
  });

  return NextResponse.json({ ok: true, record, faceMatch });
}
