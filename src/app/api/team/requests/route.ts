import { validateShift, effectiveSchedule } from "@/lib/performanceServer";
import { prisma } from "@/lib/prisma";
import {
  teamRoute,
  jsonBody,
  textField,
  TeamError,
  memberWhere,
  notify,
} from "@/lib/team";
import { validRange } from "@/lib/reporting";
import { todayWorkDate, workDateFor } from "@/lib/time";
export const GET = teamRoute(async (u, req) => {
  const status = req.nextUrl.searchParams.get("status");
  const page = Math.max(
    1,
    Math.min(
      10000,
      Math.floor(Number(req.nextUrl.searchParams.get("page")) || 1),
    ),
  );
  const where = {
    ...(u.role === "ADMIN" ? {} : { userId: u.id }),
    ...(status ? { status } : {}),
  };
  const [requests, total] = await prisma.$transaction([
    prisma.staffRequest.findMany({
      where,
      include: { user: { select: { name: true, employeeCode: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
      skip: (page - 1) * 30,
    }),
    prisma.staffRequest.count({ where }),
  ]);
  const records = await prisma.attendanceRecord.findMany({
    where: {id: {in: requests.filter(r => r.kind === "EXTRA_TIME" && r.expectedRecordId).map(r => r.expectedRecordId!)}},
    select: {id: true, extraTimeCutoff: true},
  });
  const cutoffs = new Map(records.map(r => [r.id, r.extraTimeCutoff]));
  return { requests: requests.map(r => ({...r, extraTimeCutoff: r.expectedRecordId ? cutoffs.get(r.expectedRecordId) ?? null : null})), total, admin: u.role === "ADMIN" };
});
export const POST = teamRoute(async (u, req) => {
  if (u.role !== "EMPLOYEE")
    throw new TeamError("Requests are submitted from employee accounts.");
  const b = await jsonBody(req),
    kind = String(b.kind),
    fromDate = String(b.fromDate),
    toDate = kind !== "LEAVE" ? fromDate : String(b.toDate),
    reason = textField(b.reason, "Reason", 1000);
  if (!["LEAVE", "CORRECTION", "LATE_ARRIVAL", "SHIFT_CHANGE", "EARLY_DEPARTURE"].includes(kind) || !validRange(fromDate, toDate))
    throw new TeamError("Choose a valid request and date range.");
  if ((Date.parse(toDate) - Date.parse(fromDate)) / 86400000 > 365)
    throw new TeamError("Choose a period of up to one year.");
  if (
    kind === "CORRECTION" &&
    (fromDate > todayWorkDate() || fromDate < workDateFor(u.createdAt))
  )
    throw new TeamError(
      "Corrections must be between your join date and today.",
    );
  if (kind === "LEAVE" && fromDate < todayWorkDate())
    throw new TeamError("Leave requests must start today or later.");
  if (kind === "LATE_ARRIVAL" && (!(await effectiveSchedule(prisma, u, fromDate)) || fromDate < todayWorkDate() || Date.parse(fromDate) - Date.parse(todayWorkDate()) > 365 * 86400000))
    throw new TeamError("Late-arrival requests must be for today or a future date covered by your attendance rules.");
  const proposedIn =
      ["CORRECTION", "SHIFT_CHANGE"].includes(kind) ? new Date(String(b.proposedIn)) : null,
    proposedOut =
      ["CORRECTION", "SHIFT_CHANGE"].includes(kind) ? new Date(String(b.proposedOut)) : null;
  if (
    ["CORRECTION", "SHIFT_CHANGE"].includes(kind) &&
    (!proposedIn ||
      !proposedOut ||
      !Number.isFinite(+proposedIn) ||
      !Number.isFinite(+proposedOut) ||
      +proposedOut <= +proposedIn ||
      +proposedOut - +proposedIn > 24 * 3600000 ||
      workDateFor(proposedIn) !== fromDate ||
      (kind === "CORRECTION" && +proposedOut > Date.now()))
  )
    throw new TeamError(
      "Enter valid clock-in/out times in IST, up to 24 hours apart and not in the future.",
    );
  if (["SHIFT_CHANGE", "EARLY_DEPARTURE"].includes(kind) && (fromDate < todayWorkDate() || Date.parse(fromDate) - Date.parse(todayWorkDate()) > 365*86400000)) throw new TeamError("Choose today or a date within the next year.");
  const request = await prisma.$transaction(async (tx) => {
    if (kind === "SHIFT_CHANGE") await validateShift(tx, u.id, fromDate, proposedIn!, proposedOut!);
    if (kind === "LATE_ARRIVAL" && await tx.attendanceRecord.findFirst({where: {userId: u.id, workDate: fromDate, clockInAt: {not: null}}}))
      throw new TeamError("You have already clocked in on this date.", 409);
    if (
      await tx.staffRequest.findFirst({
        where: {
          userId: u.id,
          kind,
          status: {
            in: kind !== "CORRECTION" ? ["PENDING", "APPROVED"] : ["PENDING"],
          },
          fromDate: { lte: toDate },
          toDate: { gte: fromDate },
        },
      })
    )
      throw new TeamError(
        "There is already a request covering these dates.",
        409,
      );
    const record =
      kind === "CORRECTION"
        ? await tx.attendanceRecord.findUnique({
            where: { userId_workDate: { userId: u.id, workDate: fromDate } },
          })
        : null;
    const r = await tx.staffRequest.create({
      data: {
        userId: u.id,
        kind,
        fromDate,
        toDate,
        reason,
        proposedIn,
        proposedOut,
        expectedRecordId: record?.id,
        expectedUpdatedAt: record?.updatedAt,
      },
    });
    const admins = await tx.user.findMany({
      where: { ...memberWhere, role: "ADMIN" },
      select: { id: true, role: true },
    });
    await notify(
      tx,
      admins,
      "REQUEST",
      r.id,
      `${u.name}: new ${kind === "LEAVE" ? "leave" : kind === "LATE_ARRIVAL" ? "late-arrival" : kind === "SHIFT_CHANGE" ? "shift change" : kind === "EARLY_DEPARTURE" ? "early departure" : "attendance correction"} request`,
      "team?view=requests",
    );
    return r;
  });
  return { request };
});
