import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getCurrentUser, signSession, SESSION_COOKIE, SESSION_COOKIE_MAX_AGE } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveDataUrlPhoto } from "@/lib/photoStorage";
import { serializeDescriptor } from "@/lib/faceMatch";

// Handles the forced first-login flow: the employee replaces the shared
// default password with one only they know, optionally picks a new login
// ID, fills in their profile, and enrolls a reference face photo that every
// future clock-in/out selfie gets compared against.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (user.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Only employee accounts go through onboarding." }, { status: 403 });
  }

  let body: {
    newEmployeeCode?: string;
    newPassword?: string;
    phone?: string;
    alternatePhone?: string;
    address?: string;
    hobbies?: string;
    photoDataUrl?: string;
    descriptor?: number[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const newPassword = body.newPassword || "";
  const phone = (body.phone || "").trim();
  const alternatePhone = (body.alternatePhone || "").trim();
  const address = (body.address || "").trim();
  const hobbies = (body.hobbies || "").trim();
  const { photoDataUrl, descriptor } = body;

  if (newPassword.length < 6) {
    return NextResponse.json(
      { error: "New password must be at least 6 characters." },
      { status: 400 }
    );
  }
  if (!phone || !address) {
    return NextResponse.json(
      { error: "Phone number and address are required." },
      { status: 400 }
    );
  }
  if (!photoDataUrl || !descriptor || !Array.isArray(descriptor) || descriptor.length === 0) {
    return NextResponse.json(
      { error: "A profile photo (with a clearly visible face) is required." },
      { status: 400 }
    );
  }

  let newEmployeeCode: string | undefined;
  if (typeof body.newEmployeeCode === "string" && body.newEmployeeCode.trim()) {
    newEmployeeCode = body.newEmployeeCode.trim().toUpperCase();
    if (newEmployeeCode !== user.employeeCode) {
      const existing = await prisma.user.findUnique({ where: { employeeCode: newEmployeeCode } });
      if (existing) {
        return NextResponse.json({ error: "That login ID is already in use." }, { status: 409 });
      }
    }
  }

  let profilePhotoKey: string;
  try {
    profilePhotoKey = await saveDataUrlPhoto(photoDataUrl, user.id, "profile");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save photo." },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      employeeCode: newEmployeeCode ?? user.employeeCode,
      passwordHash,
      phone,
      alternatePhone: alternatePhone || null,
      address,
      hobbies: hobbies || null,
      profilePhoto: profilePhotoKey,
      faceDescriptor: serializeDescriptor(descriptor),
      mustChangePassword: false,
    },
  });

  // Re-sign the session so mustChangePassword flips to false immediately
  // (middleware reads it straight off the JWT, not the database) and the
  // employeeCode reflects any change they just made.
  const token = await signSession({
    userId: updated.id,
    role: updated.role as "ADMIN" | "EMPLOYEE",
    employeeCode: updated.employeeCode,
    name: updated.name,
    mustChangePassword: false,
    approved: updated.approved,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
  return res;
}
