import { lateClockOutRule } from "@/lib/attendanceTime";
import { prisma } from "@/lib/prisma";
import {
  teamRoute,
  adminOnly,
  jsonBody,
  textField,
  TeamError,
  notify,
} from "@/lib/team";
import { validRange } from "@/lib/reporting";
import { todayWorkDate, workDateFor } from "@/lib/time";
import {
  effectiveSchedule,
  penaltyContext,
  syncMeetings,
  policyAudit,
} from "@/lib/performanceServer";
import { extraCutoff, durationSnapshot } from "@/lib/performance";
import { retireExtraTimeRequests } from "@/lib/workPolicyServer";
import { auditData } from "@/lib/attendanceAudit";

export const GET = teamRoute(async (u, req) => {
  adminOnly(u);
  const userId = req.nextUrl.searchParams.get("userId") || "";
  const workDate = req.nextUrl.searchParams.get("workDate") || "";
  if (!validRange(workDate, workDate))
    throw new TeamError("Choose a valid date.");
  const record = await prisma.attendanceRecord.findUnique({
    where: { userId_workDate: { userId, workDate } },
  });
  return { record };
});

export const POST = teamRoute(async (u, req) => {
  adminOnly(u);
  const b = await jsonBody(req);
  const userId = String(b.userId),
    workDate = String(b.workDate);
  const reason = textField(b.reason, "Correction reason", 1000);
  const clockInAt = new Date(String(b.clockInAt));
  const clockOutAt = b.clockOutAt ? new Date(String(b.clockOutAt)) : null;
  const today = todayWorkDate();
  if (
    !validRange(workDate, workDate) ||
    workDate > today ||
    !Number.isFinite(+clockInAt) ||
    workDateFor(clockInAt) !== workDate ||
    +clockInAt > Date.now() ||
    (clockOutAt &&
      (!Number.isFinite(+clockOutAt) ||
        +clockOutAt <= +clockInAt ||
        +clockOutAt > Date.now() ||
        +clockOutAt - +clockInAt > 24 * 3600000))
  )
    throw new TeamError(
      "Enter valid actual times in IST, not future times. Clock-out must be after clock-in and within 24 hours.",
    );
  if (!clockOutAt && workDate < today)
    throw new TeamError(
      "For a past date, enter both the actual clock-in and clock-out.",
    );
  if (!("expectedUpdatedAt" in b) || !("expectedRecordId" in b))
    throw new TeamError("Load the employee's attendance before saving.", 409);
  const result = await prisma.$transaction(async (tx) => {
    const employee = await tx.user.findUnique({ where: { id: userId } });
    if (!employee || employee.role !== "EMPLOYEE" || !employee.approved)
      throw new TeamError("Choose an approved employee.");
    if (workDate < workDateFor(employee.createdAt))
      throw new TeamError(
        "Attendance cannot start before this employee joined.",
      );
    if (!clockOutAt && !employee.active)
      throw new TeamError("An inactive employee cannot start an open shift.");
    const record = await tx.attendanceRecord.findUnique({
      where: { userId_workDate: { userId, workDate } },
    });
    if (
      (record?.id ?? null) !== b.expectedRecordId ||
      (record?.updatedAt.toISOString() ?? null) !== b.expectedUpdatedAt
    )
      throw new TeamError(
        "Attendance changed since you loaded it. Reload and review the latest times.",
        409,
      );
    const conflicts = await tx.attendanceRecord.findMany({
      where: {
        userId,
        id: { not: record?.id ?? "" },
        clockInAt: { not: null },
      },
    });
    if (
      conflicts.some(
        (r) =>
          +r.clockInAt! < (clockOutAt ? +clockOutAt : Infinity) &&
          (r.clockOutAt ? +r.clockOutAt : Infinity) > +clockInAt,
      )
    )
      throw new TeamError(
        "This overlaps another shift, or an older shift is still open. Correct that shift first.",
        409,
      );
    if (
      await tx.staffRequest.findFirst({
        where: {
          userId,
          kind: "LEAVE",
          status: "APPROVED",
          fromDate: { lte: workDate },
          toDate: { gte: workDate },
        },
      })
    )
      throw new TeamError(
        "This date has approved leave. Resolve the leave before adding attendance.",
        409,
      );
    if (!record?.clockInAt && workDate === today) {
      const pending = await syncMeetings(tx, userId);
      if (pending.length && b.managerMeetingCompleted !== true)
        throw new TeamError(
          "A manager meeting is required. Complete it, then select the meeting confirmation before recording today's arrival.",
          409,
        );
      for (const meeting of pending) {
        const after = await tx.managerMeeting.update({
          where: { id: meeting.id },
          data: {
            status: "CLEARED",
            clearedDate: today,
            reviewedAt: new Date(),
            reviewedBy: u.name,
            note: reason,
          },
        });
        await policyAudit(
          tx,
          u,
          userId,
          meeting.id,
          "MEETING_CLEARED_MANUALLY",
          meeting,
          after,
        );
      }
    }
    const schedule = await effectiveSchedule(tx, employee, workDate);
    const recalculate = b.applyCurrentPolicy === true;
    if (recalculate && (!record?.clockInAt || !record.clockOutAt || !clockOutAt))
      throw new TeamError("Load a completed attendance record to recalculate its policy.");
    const policyVersion = recalculate ? 2 : record?.policyVersion ?? 2;
    const unpaidBreakMinutes =
      record?.unpaidBreakMinutes ?? schedule?.breakMinutes ?? 60;
    const scheduledEndAt = record
      ? record.scheduledEndAt
      : (schedule?.end ?? null);
    const v2 = policyVersion === 2 ? durationSnapshot(clockInAt, schedule, recalculate ? null : record) : null;
    const cutoff = v2 ? v2.extraTimeCutoff : policyVersion
      ? extraCutoff(clockInAt, unpaidBreakMinutes, scheduledEndAt)
      : (record?.extraTimeCutoff ?? null);
    const needsExtra = !!clockOutAt && !!cutoff && clockOutAt > cutoff;
    const exceptions = await tx.staffRequest.findMany({
      where: {
        userId,
        fromDate: workDate,
        status: "APPROVED",
        kind: { in: ["LATE_ARRIVAL", "EARLY_DEPARTURE"] },
      },
    });
    const data = {
      clockInAt,
      clockOutAt,
      policyVersion,
      unpaidBreakMinutes,
      scheduledEndAt,
      scheduledStartAt: record
        ? record.scheduledStartAt
        : (schedule?.start ?? null),
      ...(record ? {} : await penaltyContext(tx, userId, workDate)),
      lateExcused:
        record?.lateExcused ||
        exceptions.some((r) => r.kind === "LATE_ARRIVAL"),
      earlyExcused:
        record?.earlyExcused ||
        exceptions.some((r) => r.kind === "EARLY_DEPARTURE"),
      ...(v2 ?? {}),
      extraTimeCutoff: cutoff,
      extraTimeStatus: needsExtra ? "AUTOMATIC" : "NOT_REQUIRED",
      ...lateClockOutRule(workDate, clockOutAt, true),
      extraTimeReason: needsExtra ? reason : null,
      approvalStatus: "PENDING",
    };
    const after = await tx.attendanceRecord.upsert({
      where: { userId_workDate: { userId, workDate } },
      create: { userId, workDate, ...data },
      update: data,
    });
    const audit = record
      ? auditData(record, employee, u, recalculate ? "POLICY_RECALCULATED" : "ADMIN_TIME_CORRECTION", after)
      : {
          recordId: after.id,
          userId,
          employeeName: employee.name,
          employeeCode: employee.employeeCode,
          workDate,
          actorId: u.id,
          actorName: u.name,
          action: "ADMIN_TIME_ENTRY",
          beforeJson: "null",
          afterJson: JSON.stringify(data),
        };
    await tx.attendanceAudit.create({
      data: {
        ...audit,
        afterJson: JSON.stringify({
          ...JSON.parse(audit.afterJson!),
          correctionReason: reason,
          source: "ADMIN_MANUAL",
        }),
      },
    });
    await retireExtraTimeRequests(tx, userId, workDate);
    await syncMeetings(tx, userId);
    await notify(
      tx,
      [employee],
      "ATTENDANCE_CORRECTED",
      `${after.id}:${after.updatedAt.toISOString()}`,
      `Your attendance on ${workDate} was entered or corrected by ${u.name}`,
      "history",
    );
    return after;
  });
  return { record: result };
});
