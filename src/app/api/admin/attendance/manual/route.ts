import { hourlySnapshot } from "@/lib/hourlyPay";
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
  const day=await prisma.workDayOverride.findUnique({where:{workDate}});
  return { record, day };
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
    const day=await tx.workDayOverride.findUnique({where:{workDate}});
    if(day?.mode!=="HOURLY")throw new TeamError("Enable correction mode for this date first. This removes automatic off-day pay for everyone.",409);
    if(day.revision!==b.expectedDayRevision)throw new TeamError("The date rule changed. Reload attendance.",409);
    const unpaid=Number(b.unpaidBreakMinutes);
    if(typeof b.unpaidBreakMinutes!=="number" || !Number.isInteger(unpaid) || unpaid<0 || unpaid>1440 || (clockOutAt && unpaid*60000>+clockOutAt-+clockInAt))throw new TeamError("Unpaid break must be a valid duration no longer than the clocked time.");
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
    const data = {clockInAt,clockOutAt,...hourlySnapshot(unpaid),approvalStatus:"PENDING"};
    const after = await tx.attendanceRecord.upsert({
      where: { userId_workDate: { userId, workDate } },
      create: { userId, workDate, ...data },
      update: data,
    });
    const audit = record
      ? auditData(record, employee, u, "ADMIN_HOURLY_TIME_CORRECTION", after)
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
