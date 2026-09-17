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
  if (!existing?.clockInAt) {
    return NextResponse.json(
      { error: "You haven't clocked in yet today." },
      { status: 409 }
    );
  }
  if (existing.clockOutAt) {
    return NextResponse.json(
      { error: "You've already clocked out today." },
      { status: 409 }
    );
  }

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

  let photoKey: string;
  try {
    photoKey = await saveDataUrlPhoto(photoDataUrl, user.id, "out");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save photo." },
      { status: 400 }
    );
  }

  const record = await prisma.attendanceRecord.update({
    where: { userId_workDate: { userId: user.id, workDate } },
    data: {
      clockOutAt: new Date(),
      clockOutPhoto: photoKey,
      clockOutFaceMatch: faceMatch,
      clockOutFaceDistance: faceDistance,
    },
  });

  return NextResponse.json({ ok: true, record, faceMatch });
}
