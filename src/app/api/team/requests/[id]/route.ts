import { effectiveSchedule, validateShift, policyAudit, penaltyContext, syncMeetings } from "@/lib/performanceServer";
import { extraCutoff, durationSnapshot } from "@/lib/performance";
import { requestExtraTime } from "@/lib/workPolicyServer";
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
            weeklyScheduleJson: true,
            attendancePolicyFrom: true,
            attendanceStartMinute: true,
            attendanceLatestMinute: true,
            attendanceEndMinute: true,
            attendanceAllowEarly: true,
          },
        },
      },
    });
    if (!r) throw new TeamError("Request not found.", 404);
    if (status === "CANCELLED" ? r.userId !== u.id : u.role !== "ADMIN")
      throw new TeamError("Not permitted.", 403);
    if (r.kind === "EXTRA_TIME" && status === "CANCELLED")
      throw new TeamError("Extra-time reviews cannot be cancelled. Ask your admin to review or correct the shift.", 409);
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
    if (status === "APPROVED" && r.kind === "SHIFT_CHANGE") {
      if (!r.proposedIn || !r.proposedOut) throw new TeamError("Shift times are missing.");
      await validateShift(tx, r.userId, r.fromDate, r.proposedIn, r.proposedOut);
      const before = await tx.scheduledShift.findUnique({where: {userId_workDate: {userId: r.userId, workDate: r.fromDate}}});
      const after = await tx.scheduledShift.upsert({where: {userId_workDate: {userId: r.userId, workDate: r.fromDate}},
        create: {userId: r.userId, workDate: r.fromDate, startsAt: r.proposedIn, endsAt: r.proposedOut, note: r.reason},
        update: {startsAt: r.proposedIn, endsAt: r.proposedOut, note: r.reason}});
      await policyAudit(tx, u, r.userId, after.id, "SHIFT_CHANGE_APPROVED", before, after);
    }
    if (status === "APPROVED" && ["LATE_ARRIVAL", "EARLY_DEPARTURE"].includes(r.kind)) {
      const record = await tx.attendanceRecord.findUnique({where: {userId_workDate: {userId: r.userId, workDate: r.fromDate}}});
      if (record) {
        const after = await tx.attendanceRecord.update({where: {id: record.id}, data: {
          ...(r.kind === "LATE_ARRIVAL" ? {lateExcused: true, lateArrivalRequestId: r.id} : {earlyExcused: true}), approvalStatus: "PENDING"}});
        await tx.attendanceAudit.create({data: auditData(record, r.user, u, "EXCEPTION_APPROVED", after)});
      }
    }
    if (r.kind === "EXTRA_TIME") {
      const record = await tx.attendanceRecord.findUnique({where: {id: r.expectedRecordId ?? ""}});
      if (!record || record.userId !== r.userId || record.extraTimeStatus !== "PENDING" || record.clockOutAt?.toISOString() !== r.proposedOut?.toISOString() || record.clockInAt?.toISOString() !== r.proposedIn?.toISOString())
        throw new TeamError("This attendance record changed. Review the latest request instead.", 409);
      const after = await tx.attendanceRecord.update({where: {id: record.id}, data: {extraTimeStatus: status, approvalStatus: "PENDING"}});
      await tx.attendanceAudit.create({data: auditData(record, r.user, u, `EXTRA_TIME_${status}`, after)});
    }
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
      const schedule = await effectiveSchedule(tx, r.user, r.fromDate);
      const breakMinutes = record ? record.unpaidBreakMinutes : schedule?.breakMinutes ?? 60;
      const version = record ? record.policyVersion : 2;
      const end = record ? record.scheduledEndAt : schedule?.end;
      const v2 = version === 2 ? durationSnapshot(r.proposedIn!, schedule, record) : null;
      const extraTimeCutoff = v2 ? v2.extraTimeCutoff : version ? extraCutoff(r.proposedIn!, breakMinutes, end) : record?.extraTimeCutoff ?? null;
      const needsExtra = !!extraTimeCutoff && !!r.proposedOut && r.proposedOut > extraTimeCutoff;
      const workRules = {
        policyVersion: version,
        scheduledStartAt: record ? record.scheduledStartAt : schedule?.start,
        scheduledEndAt: end,
        ...(record ? {} : await penaltyContext(tx, r.userId, r.fromDate)),
        unpaidBreakMinutes: breakMinutes,
        ...(v2 ?? {}),
        extraTimeCutoff,
        extraTimeStatus: needsExtra ? "PENDING" : "NOT_REQUIRED",
        extraTimeReason: needsExtra ? r.reason : null,
      };
      const after = await tx.attendanceRecord.upsert({
        where: { userId_workDate: { userId: r.userId, workDate: r.fromDate } },
        create: {
          userId: r.userId,
          workDate: r.fromDate,
          ...workRules,
          clockInAt: r.proposedIn,
          clockOutAt: r.proposedOut,
          approvalStatus: "PENDING",
        },
        update: {
          ...workRules,
          clockInAt: r.proposedIn,
          clockOutAt: r.proposedOut,
          approvalStatus: "PENDING",
        },
      });
      if (needsExtra) await requestExtraTime(tx, after, r.user.name, r.reason);
      else await tx.staffRequest.updateMany({where: {userId: r.userId, kind: "EXTRA_TIME", fromDate: r.fromDate, status: "PENDING"}, data: {status: "CANCELLED", reviewNote: "Superseded by corrected attendance."}});
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
                ...workRules,
              }),
            },
      });
    }
    const changed = await tx.staffRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status, reviewNote, reviewedAt: new Date(), reviewedBy: u.name },
    });
    if (!changed.count) throw new TeamError("Request already changed.", 409);
    await syncMeetings(tx, r.userId);
    await notify(
      tx,
      [r.user],
      "REQUEST_DECISION",
      `${id}:${status}`,
      `Your ${r.kind === "LEAVE" ? "leave" : r.kind === "LATE_ARRIVAL" ? "late-arrival" : r.kind === "SHIFT_CHANGE" ? "shift change" : r.kind === "EARLY_DEPARTURE" ? "early departure" : r.kind === "EXTRA_TIME" ? "extra-time" : "correction"} request was ${status.toLowerCase()}`,
      "team?view=requests",
    );
  });
  return { ok: true };
});
