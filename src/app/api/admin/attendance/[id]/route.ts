import { auditData } from "@/lib/attendanceAudit";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deletePhotoByKey } from "@/lib/photoStorage";
import { APPROVAL_STATUS, isApprovalStatus } from "@/lib/attendanceApproval";

// Approves, rejects, or resets a completed day. Only APPROVED days count
// toward hours/salary in the admin Overview — see src/lib/stats.ts. A day
// isn't eligible until it has both a clock-in and a clock-out.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin)
    return NextResponse.json({ error: "Admin only." }, { status: 403 });

  const { id } = await params;

  let body: { approvalStatus?: string; expectedUpdatedAt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  if (!isApprovalStatus(body.approvalStatus)) {
    return NextResponse.json(
      { error: "approvalStatus must be PENDING, APPROVED, or REJECTED." },
      { status: 400 },
    );
  }

  const record = await prisma.attendanceRecord.findUnique({
    where: { id },
    include: { user: { select: { name: true, employeeCode: true } } },
  });
  if (!record) {
    return NextResponse.json(
      { error: "Attendance record not found." },
      { status: 404 },
    );
  }
  if (
    body.approvalStatus !== APPROVAL_STATUS.PENDING &&
    (!record.clockInAt || !record.clockOutAt)
  ) {
    return NextResponse.json(
      {
        error:
          "This day hasn't been clocked out yet, so it can't be approved or rejected.",
      },
      { status: 409 },
    );
  }

  if (
    body.expectedUpdatedAt &&
    body.expectedUpdatedAt !== record.updatedAt.toISOString()
  ) {
    return NextResponse.json(
      { error: "This shift changed. Refresh and review it again." },
      { status: 409 },
    );
  }
  if (record.approvalStatus === body.approvalStatus)
    return NextResponse.json({ ok: true, record });
  if (record.extraTimeStatus === "PENDING" && body.approvalStatus === "APPROVED")
    return NextResponse.json({error: "Review the extra-time request in Team → Requests before approving attendance."}, {status: 409});
  const nextStatus = body.approvalStatus;
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.attendanceRecord.updateMany({
      where: {
        id,
        updatedAt: record.updatedAt,
        approvalStatus: record.approvalStatus,
      },
      data: { approvalStatus: nextStatus },
    });
    if (!changed.count) return null;
    const result = await tx.attendanceRecord.findUniqueOrThrow({
      where: { id },
    });
    await tx.attendanceAudit.create({
      data: auditData(record, record.user, admin, nextStatus, result),
    });
    return result;
  });
  if (!updated)
    return NextResponse.json(
      { error: "This shift changed. Refresh and review it again." },
      { status: 409 },
    );

  return NextResponse.json({ ok: true, record: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin)
    return NextResponse.json({ error: "Admin only." }, { status: 403 });

  const { id } = await params;

  const record = await prisma.attendanceRecord.findUnique({
    where: { id },
    include: { user: { select: { name: true, employeeCode: true } } },
  });
  if (!record) {
    return NextResponse.json(
      { error: "Attendance record not found." },
      { status: 404 },
    );
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const result = await tx.attendanceRecord.deleteMany({
      where: { id, updatedAt: record.updatedAt },
    });
    if (!result.count) return false;
    await tx.attendanceAudit.create({
      data: auditData(record, record.user, admin, "DELETED", null),
    });
    return true;
  });
  if (!deleted)
    return NextResponse.json(
      { error: "This shift changed. Refresh before deleting." },
      { status: 409 },
    );

  // Best-effort cleanup of the selfies on disk — never let a photo-deletion
  // hiccup undo the record deletion, which has already succeeded.
  if (record.clockInPhoto) await deletePhotoByKey(record.clockInPhoto);
  if (record.clockOutPhoto) await deletePhotoByKey(record.clockOutPhoto);

  return NextResponse.json({ ok: true });
}
