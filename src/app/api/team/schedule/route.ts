import { prisma } from "@/lib/prisma";
import { teamRoute, jsonBody, TeamError, adminOnly, notify } from "@/lib/team";
import { validRange } from "@/lib/reporting";
import { todayWorkDate, workDateFor } from "@/lib/time";
export const GET = teamRoute(async (u, req) => {
  const from = req.nextUrl.searchParams.get("from") || todayWorkDate(),
    to = req.nextUrl.searchParams.get("to") || from;
  if (
    !validRange(from, to) ||
    Date.parse(to) - Date.parse(from) > 93 * 86400000
  )
    throw new TeamError("Choose up to three months of schedules.");
  const [shifts, leave, employees] = await Promise.all([
    prisma.scheduledShift.findMany({
      where: {
        workDate: { gte: from, lte: to },
        ...(u.role === "ADMIN" ? {} : { userId: u.id }),
      },
      include: { user: { select: { name: true } } },
      orderBy: [{ workDate: "asc" }, { startsAt: "asc" }],
    }),
    prisma.staffRequest.findMany({
      where: {
        kind: "LEAVE",
        status: "APPROVED",
        fromDate: { lte: to },
        toDate: { gte: from },
        ...(u.role === "ADMIN" ? {} : { userId: u.id }),
      },
      select: {
        id: true,
        userId: true,
        fromDate: true,
        toDate: true,
        user: { select: { name: true } },
      },
    }),
    u.role === "ADMIN"
      ? prisma.user.findMany({
          where: { role: "EMPLOYEE", active: true, approved: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const recurring = await prisma.user.findMany({where: {
    role: "EMPLOYEE", active: true, attendancePolicyFrom: {not: null, lte: to},
    ...(u.role === "ADMIN" ? {} : {id: u.id}),
  }, select: {id: true, name: true, employeeCode: true, attendancePolicyFrom: true, attendanceStartMinute: true, attendanceLatestMinute: true, attendanceEndMinute: true, attendanceAllowEarly: true}, orderBy: {name: "asc"}});
  return { shifts, leave, employees, recurring, admin: u.role === "ADMIN" };
});
export const POST = teamRoute(async (u, req) => {
  adminOnly(u);
  const b = await jsonBody(req),
    userId = String(b.userId),
    workDate = String(b.workDate),
    startsAt = new Date(String(b.startsAt)),
    endsAt = new Date(String(b.endsAt)),
    note = typeof b.note === "string" ? b.note.trim() : "";
  if (
    !validRange(workDate, workDate) ||
    !Number.isFinite(+startsAt) ||
    !Number.isFinite(+endsAt) ||
    +endsAt <= +startsAt ||
    +endsAt - +startsAt > 24 * 3600000 ||
    workDateFor(startsAt) !== workDate ||
    note.length > 500
  )
    throw new TeamError("Enter a valid shift in IST, no longer than 24 hours.");
  const shift = await prisma.$transaction(async (tx) => {
    const employee = await tx.user.findFirst({
      where: { id: userId, role: "EMPLOYEE", active: true, approved: true },
    });
    if (!employee) throw new TeamError("Choose an active employee.");
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
        "This employee has approved leave on this date.",
        409,
      );
    if (
      await tx.scheduledShift.findFirst({
        where: {
          userId,
          workDate: { not: workDate },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      })
    )
      throw new TeamError("This overlaps another assigned shift.", 409);
    const result = await tx.scheduledShift.upsert({
      where: { userId_workDate: { userId, workDate } },
      create: { userId, workDate, startsAt, endsAt, note },
      update: { startsAt, endsAt, note },
    });
    await notify(
      tx,
      [employee],
      "SCHEDULE",
      `${result.id}:${result.updatedAt.toISOString()}`,
      `Your shift on ${workDate} was scheduled or updated`,
      "team?view=schedule",
    );
    return result;
  });
  return { shift };
});
