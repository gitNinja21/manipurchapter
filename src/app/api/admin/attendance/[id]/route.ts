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
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin only." }, { status: 403 });

  const { id } = await params;

  let body: { approvalStatus?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isApprovalStatus(body.approvalStatus)) {
    return NextResponse.json(
      { error: "approvalStatus must be PENDING, APPROVED, or REJECTED." },
      { status: 400 }
    );
  }

  const record = await prisma.attendanceRecord.findUnique({ where: { id } });
  if (!record) {
    return NextResponse.json({ error: "Attendance record not found." }, { status: 404 });
  }
  if (
    body.approvalStatus !== APPROVAL_STATUS.PENDING &&
    (!record.clockInAt || !record.clockOutAt)
  ) {
    return NextResponse.json(
      { error: "This day hasn't been clocked out yet, so it can't be approved or rejected." },
      { status: 409 }
    );
  }

  const updated = await prisma.attendanceRecord.update({
    where: { id },
    data: { approvalStatus: body.approvalStatus },
  });

  return NextResponse.json({ ok: true, record: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin only." }, { status: 403 });

  const { id } = await params;

  const record = await prisma.attendanceRecord.findUnique({ where: { id } });
  if (!record) {
    return NextResponse.json({ error: "Attendance record not found." }, { status: 404 });
  }

  await prisma.attendanceRecord.delete({ where: { id } });

  // Best-effort cleanup of the selfies on disk — never let a photo-deletion
  // hiccup undo the record deletion, which has already succeeded.
  if (record.clockInPhoto) await deletePhotoByKey(record.clockInPhoto);
  if (record.clockOutPhoto) await deletePhotoByKey(record.clockOutPhoto);

  return NextResponse.json({ ok: true });
}
