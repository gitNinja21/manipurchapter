import type {User} from "@prisma/client";
import {weeklyApplies} from "@/lib/weeklySchedulePolicy";
import { validateShift, effectiveSchedule } from "@/lib/performanceServer";
import { prisma } from "@/lib/prisma";
import {
  textField,
  TeamError,
  memberWhere,
  notify,
} from "@/lib/team";
import { validRange } from "@/lib/reporting";
import { todayWorkDate, workDateFor } from "@/lib/time";
export async function submitStaffRequest(u: User, b: Record<string, unknown>, assistantId?: string) {
  if (u.role !== "EMPLOYEE")
    throw new TeamError("Requests are submitted from employee accounts.");
  if (!u.active || !u.approved || u.mustChangePassword) throw new TeamError("An active, approved account is required.", 403);
  const kind = String(b.kind),
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
  if (kind === "SHIFT_CHANGE" && weeklyApplies(fromDate)) throw new TeamError("Use My weekly schedule on the Today page to change future dates. Ask admin for a current or past attendance correction.");
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
    if (assistantId) {
      const turn = await tx.assistantTurn.findFirst({where:{id:assistantId,userId:u.id}});
      if (!turn) throw new TeamError("Assistant draft not found.",404);
      if (turn.requestId) return tx.staffRequest.findUniqueOrThrow({where:{id:turn.requestId}});
      if (turn.status !== "READY" || !turn.draftJson) throw new TeamError("This draft is not available.",409);
    }
    if (kind === "SHIFT_CHANGE") {
      await validateShift(tx, u.id, fromDate, proposedIn!, proposedOut!, true);
    }
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
    if (assistantId) await tx.assistantTurn.update({where:{id:assistantId},data:{requestId:r.id,status:"SUBMITTED",reply:"Your request was submitted and is pending admin approval. Attendance and pay have not been changed."}});
    else await tx.assistantTurn.create({data:{userId:u.id,sourceKey:`request:${r.id}`,source:"REQUEST",body:reason,status:"SUBMITTED",requestId:r.id,reply:"Your request is pending admin approval. You can follow its status in Requests."}});
    return r;
  });
  return { request };
}
