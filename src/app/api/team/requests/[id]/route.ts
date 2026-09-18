import { prisma } from "@/lib/prisma";
import { teamRoute, jsonBody, TeamError, notify } from "@/lib/team";
import { auditData } from "@/lib/attendanceAudit";
export const PATCH = teamRoute(async (u, req) => {
  const id = req.nextUrl.pathname.split("/").pop()!,
    b = await jsonBody(req),
    status = String(b.status),
    reviewNote = typeof b.reviewNote === "string" ? b.reviewNote.trim() : "";
  if (
    !["APPROVED", "REJECTED", "CANCELLED"].includes(status) ||
    reviewNote.length > 1000
  )
    throw new TeamError("Invalid decision or note.");
  await prisma.$transaction(async (tx) => {
    const r = await tx.staffRequest.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            employeeCode: true,
            role: true,
            active: true,
            approved: true,
          },
        },
      },
    });
    if (!r) throw new TeamError("Request not found.", 404);
    if (status === "CANCELLED" ? r.userId !== u.id : u.role !== "ADMIN")
      throw new TeamError("Not permitted.", 403);
    if (r.status !== "PENDING")
      throw new TeamError("This request has already been decided.", 409);
    if (status === "APPROVED" && (!r.user.active || !r.user.approved))
      throw new TeamError("This employee is not active and approved.", 409);
    if (
      status === "APPROVED" &&
      r.kind === "LEAVE" &&
      (await tx.scheduledShift.findFirst({
        where: {
          userId: r.userId,
          workDate: { gte: r.fromDate, lte: r.toDate },
        },
      }))
    )
      throw new TeamError(
        "This employee has assigned shifts during the leave. Cancel or reassign those shifts before approving.",
        409,
      );
    if (status === "APPROVED" && r.kind === "CORRECTION") {
      const record = await tx.attendanceRecord.findUnique({
        where: { userId_workDate: { userId: r.userId, workDate: r.fromDate } },
      });
      if (
        (record?.id ?? null) !== r.expectedRecordId ||
        (record?.updatedAt?.toISOString() ?? null) !==
          (r.expectedUpdatedAt?.toISOString() ?? null)
      )
        throw new TeamError(
          "Attendance changed after this request. Reject it and ask for a fresh request.",
          409,
        );
      const after = await tx.attendanceRecord.upsert({
        where: { userId_workDate: { userId: r.userId, workDate: r.fromDate } },
        create: {
          userId: r.userId,
          workDate: r.fromDate,
          clockInAt: r.proposedIn,
          clockOutAt: r.proposedOut,
          approvalStatus: "PENDING",
        },
        update: {
          clockInAt: r.proposedIn,
          clockOutAt: r.proposedOut,
          approvalStatus: "PENDING",
        },
      });
      await tx.attendanceAudit.create({
        data: record
          ? auditData(record, r.user, u, "CORRECTED", after)
          : {
              recordId: after.id,
              userId: r.userId,
              employeeName: r.user.name,
              employeeCode: r.user.employeeCode,
              workDate: r.fromDate,
              actorId: u.id,
              actorName: u.name,
              action: "CORRECTED",
              beforeJson: "null",
              afterJson: JSON.stringify({
                clockInAt: after.clockInAt,
                clockOutAt: after.clockOutAt,
                approvalStatus: after.approvalStatus,
              }),
            },
      });
    }
    const changed = await tx.staffRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status, reviewNote, reviewedAt: new Date(), reviewedBy: u.name },
    });
    if (!changed.count) throw new TeamError("Request already changed.", 409);
    await notify(
      tx,
      [r.user],
      "REQUEST_DECISION",
      `${id}:${status}`,
      `Your ${r.kind === "LEAVE" ? "leave" : "correction"} request was ${status.toLowerCase()}`,
      "team?view=requests",
    );
  });
  return { ok: true };
});
