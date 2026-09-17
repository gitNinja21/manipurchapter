import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deletePhotoByKey } from "@/lib/photoStorage";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin only." }, { status: 403 });

  const { id } = await params;

  let body: {
    name?: string;
    hourlyRateRs?: number;
    active?: boolean;
    newPassword?: string;
    resetOnboarding?: boolean;
    approved?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || target.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  const data: {
    name?: string;
    hourlyRateRs?: number;
    active?: boolean;
    passwordHash?: string;
    mustChangePassword?: boolean;
    approved?: boolean;
  } = {};

  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.hourlyRateRs === "number" && body.hourlyRateRs >= 0)
    data.hourlyRateRs = body.hourlyRateRs;
  if (typeof body.active === "boolean") data.active = body.active;
  if (typeof body.newPassword === "string" && body.newPassword.length > 0) {
    if (body.newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters." },
        { status: 400 }
      );
    }
    data.passwordHash = await bcrypt.hash(body.newPassword, 10);
    // An admin-set password is a shared secret again, so make the employee
    // set their own on next login, same as a brand-new account.
    data.mustChangePassword = true;
  }
  // Lets an admin force someone back through onboarding (e.g. to re-take
  // their profile photo) without touching their password.
  if (body.resetOnboarding === true) data.mustChangePassword = true;
  // Approving or un-approving a self-signup — see prisma/schema.prisma.
  if (typeof body.approved === "boolean") data.approved = body.approved;

  const employee = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      employeeCode: true,
      name: true,
      hourlyRateRs: true,
      active: true,
      approved: true,
      createdAt: true,
      mustChangePassword: true,
      phone: true,
      alternatePhone: true,
      address: true,
      hobbies: true,
      profilePhoto: true,
    },
  });

  return NextResponse.json({ employee });
}

// Permanently deletes an employee: their login, profile, and every
// attendance record and photo they have. This is irreversible and destroys
// their attendance/salary history — the Employees UI should only offer it
// behind an explicit, scary confirmation. Deactivating (PATCH { active:
// false }) is the reversible alternative that keeps history intact.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin only." }, { status: 403 });

  const { id } = await params;

  const target = await prisma.user.findUnique({
    where: { id },
    include: { attendance: true, announcements: true },
  });
  if (!target || target.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  // Employees never author announcements in this app (only admins can, via
  // the Announcements API) — this is just a defensive guard in case that
  // ever changes, so a delete can't silently orphan an announcement.
  if (target.announcements.length > 0) {
    return NextResponse.json(
      { error: "This employee has authored announcements and can't be deleted. Deactivate them instead." },
      { status: 409 }
    );
  }

  await prisma.$transaction([
    prisma.attendanceRecord.deleteMany({ where: { userId: id } }),
    prisma.user.delete({ where: { id } }),
  ]);

  // Best-effort photo cleanup on disk, after the database delete has
  // already succeeded — a leftover file here is harmless, unlike leaving
  // the DB in a half-deleted state.
  for (const record of target.attendance) {
    if (record.clockInPhoto) await deletePhotoByKey(record.clockInPhoto);
    if (record.clockOutPhoto) await deletePhotoByKey(record.clockOutPhoto);
  }
  if (target.profilePhoto) await deletePhotoByKey(target.profilePhoto);

  return NextResponse.json({ ok: true });
}
