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
  return { requests, total, admin: u.role === "ADMIN" };
});
export const POST = teamRoute(async (u, req) => {
  if (u.role !== "EMPLOYEE")
    throw new TeamError("Requests are submitted from employee accounts.");
  const b = await jsonBody(req),
    kind = String(b.kind),
    fromDate = String(b.fromDate),
    toDate = kind === "CORRECTION" ? fromDate : String(b.toDate),
    reason = textField(b.reason, "Reason", 1000);
  if (!["LEAVE", "CORRECTION"].includes(kind) || !validRange(fromDate, toDate))
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
  const proposedIn =
      kind === "CORRECTION" ? new Date(String(b.proposedIn)) : null,
    proposedOut =
      kind === "CORRECTION" ? new Date(String(b.proposedOut)) : null;
  if (
    kind === "CORRECTION" &&
    (!proposedIn ||
      !proposedOut ||
      !Number.isFinite(+proposedIn) ||
      !Number.isFinite(+proposedOut) ||
      +proposedOut <= +proposedIn ||
      +proposedOut - +proposedIn > 24 * 3600000 ||
      workDateFor(proposedIn) !== fromDate ||
      +proposedOut > Date.now())
  )
    throw new TeamError(
      "Enter valid clock-in/out times in IST, up to 24 hours apart and not in the future.",
    );
  const request = await prisma.$transaction(async (tx) => {
    if (
      await tx.staffRequest.findFirst({
        where: {
          userId: u.id,
          kind,
          status: {
            in: kind === "LEAVE" ? ["PENDING", "APPROVED"] : ["PENDING"],
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
      `${u.name}: new ${kind === "LEAVE" ? "leave" : "attendance correction"} request`,
      "team?view=requests",
    );
    return r;
  });
  return { request };
});
