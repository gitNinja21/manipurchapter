import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signSession, SESSION_COOKIE, SESSION_COOKIE_MAX_AGE } from "@/lib/auth";
import { saveDataUrlPhoto } from "@/lib/photoStorage";
import { serializeDescriptor } from "@/lib/faceMatch";

// Public — no auth required. This is how a new employee creates their own
// account (replacing the old "admin creates the login" flow as the primary
// path). The account starts unapproved (see prisma/schema.prisma) and is
// blocked from the rest of the app until an admin reviews and approves it
// from the Employees tab, even though the session cookie is issued right
// away so they can see a "pending approval" screen in the meantime.
export async function POST(req: NextRequest) {
  let body: {
    employeeCode?: string;
    name?: string;
    password?: string;
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

  const employeeCode = (body.employeeCode || "").trim().toUpperCase();
  const name = (body.name || "").trim();
  const password = body.password || "";
  const phone = (body.phone || "").trim();
  const alternatePhone = (body.alternatePhone || "").trim();
  const address = (body.address || "").trim();
  const hobbies = (body.hobbies || "").trim();
  const { photoDataUrl, descriptor } = body;

  if (!employeeCode || !name) {
    return NextResponse.json({ error: "Login ID and full name are required." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
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

  const existing = await prisma.user.findUnique({ where: { employeeCode } });
  if (existing) {
    return NextResponse.json(
      { error: "That login ID is already taken. Try a different one." },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Created in two steps because the photo's storage key is namespaced by
  // user id — the id doesn't exist until the row does. If the photo save
  // fails, the half-created account is rolled back rather than left dangling
  // with no way to ever log in usefully.
  let created;
  try {
    created = await prisma.user.create({
      data: {
        employeeCode,
        name,
        passwordHash,
        role: "EMPLOYEE",
        phone,
        alternatePhone: alternatePhone || null,
        address,
        hobbies: hobbies || null,
        mustChangePassword: false,
        approved: false,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "That login ID is already taken. Try a different one." },
      { status: 409 }
    );
  }

  let photoKey: string;
  try {
    photoKey = await saveDataUrlPhoto(photoDataUrl, created.id, "profile");
  } catch (e) {
    await prisma.user.delete({ where: { id: created.id } });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save photo." },
      { status: 400 }
    );
  }

  const updated = await prisma.user.update({
    where: { id: created.id },
    data: {
      profilePhoto: photoKey,
      faceDescriptor: serializeDescriptor(descriptor),
    },
  });

  const token = await signSession({
    userId: updated.id,
    role: "EMPLOYEE",
    employeeCode: updated.employeeCode,
    name: updated.name,
    mustChangePassword: false,
    approved: false,
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
