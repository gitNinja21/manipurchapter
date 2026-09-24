import { prisma } from "@/lib/prisma";
import {
  teamRoute,
  TeamError,
  jsonBody,
  textField,
  adminOnly,
  notify,
} from "@/lib/team";
import {
  monthlyPerformance,
  syncMeetings,
  policyAudit,
} from "@/lib/performanceServer";
import { todayWorkDate, workDateFor } from "@/lib/time";
import { validRange } from "@/lib/reporting";
export const GET = teamRoute(async (u, req) => {
  const month =
    req.nextUrl.searchParams.get("month") || todayWorkDate().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new TeamError("Choose a valid month.");
  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE", ...(u.role === "ADMIN" ? {} : { id: u.id }) },
    select: {
      id: true,
      name: true,
      employeeCode: true,
      attendancePolicyFrom: true,
    },
  });
  for (const e of employees)
    await prisma.$transaction((tx) => syncMeetings(tx, e.id));
  const ids = employees.map((e) => e.id);
  const [result, meetings, arrivals, referrals, audit] = await Promise.all([
    monthlyPerformance(month, u.role === "ADMIN" ? undefined : u.id),
    prisma.managerMeeting.findMany({
      where: {
        userId: { in: ids },
        OR: [{ status: "PENDING" }, { clearedDate: { startsWith: month } }],
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.arrivalAttempt.findMany({
      where: { userId: { in: ids }, workDate: todayWorkDate() },
      select: {
        id: true,
        userId: true,
        workDate: true,
        arrivedAt: true,
        proposedAt: true,
        reason: true,
        approvedAt: true,
        approvedBy: true,
      },
    }),
    prisma.referralClaim.findMany({
      where: {
        userId: { in: ids },
        OR: [{ status: "PENDING" }, { billDate: { startsWith: month } }],
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.policyAudit.findMany({
      where: { userId: { in: ids } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return {
    employees: employees.map((e) => ({
      ...e,
      ...(result.totals.get(e.id) ?? {
        points: 0,
        eligibleShifts: 0,
        pointsPerShift: 0,
      }),
    })),
    entries: result.entries,
    incidents: result.incidents,
    meetings,
    arrivals,
    referrals,
    audit,
    month,
  };
});
export const POST = teamRoute(async (u, req) => {
  const b = await jsonBody(req);
  if (b.action === "PROPOSE_ARRIVAL") {
    if (u.role !== "EMPLOYEE")
      throw new TeamError("Use your employee account.", 403);
    const proposedAt = new Date(String(b.proposedAt));
    const reason = textField(b.reason, "Reason", 1000);
    if (
      !Number.isFinite(+proposedAt) ||
      workDateFor(proposedAt) !== todayWorkDate() ||
      +proposedAt > Date.now()
    )
      throw new TeamError(
        "Choose your arrival time today in IST, not a future time.",
      );
    await prisma.$transaction(async (tx) => {
      const a = await tx.arrivalAttempt.findUnique({
        where: { userId_workDate: { userId: u.id, workDate: todayWorkDate() } },
      });
      if (!a || a.approvedAt)
        throw new TeamError(
          "Record your arrival using clock-in first. An approved arrival cannot be edited.",
          409,
        );
      if (+proposedAt > +a.arrivedAt)
        throw new TeamError(
          "Your claimed arrival cannot be later than the recorded attempt.",
        );
      const after = await tx.arrivalAttempt.update({
        where: { id: a.id },
        data: { proposedAt, reason },
      });
      await policyAudit(tx, u, u.id, a.id, "ARRIVAL_PROPOSED", a, after);
    });
    return { ok: true };
  }
  if (b.action === "REFERRAL") {
    if (u.role !== "EMPLOYEE")
      throw new TeamError("Submit referrals from your employee account.", 403);
    const billDate = String(b.billDate),
      billNumber = textField(b.billNumber, "Bill number", 80).toUpperCase(),
      partyReference = textField(
        b.partyReference,
        "Party reference",
        100,
      ).toUpperCase(),
      reason = textField(b.reason, "Referral details", 1000);
    if (
      !validRange(billDate, billDate) ||
      billDate > todayWorkDate() ||
      billDate < workDateFor(u.createdAt)
    )
      throw new TeamError("Choose a completed bill date since joining.");
    const billKey = `${billDate}:${billNumber.replace(/\s+/g, "")}`;
    await prisma.$transaction(async (tx) => {
      if (await tx.referralClaim.findUnique({ where: { billKey } }))
        throw new TeamError(
          "This bill has already been claimed. Ask the manager to review the existing claim.",
          409,
        );
      const r = await tx.referralClaim.create({
        data: {
          userId: u.id,
          billDate,
          billNumber,
          billKey,
          partyReference,
          reason,
        },
      });
      await policyAudit(tx, u, u.id, r.id, "REFERRAL_SUBMITTED", null, r);
      const admins = await tx.user.findMany({
        where: { role: "ADMIN", active: true },
        select: { id: true, role: true },
      });
      await notify(
        tx,
        admins,
        "REFERRAL",
        r.id,
        `${u.name}: customer referral needs verification`,
        "team?view=performance&section=clearance",
      );
    });
    return { ok: true };
  }
  throw new TeamError("Unknown action.");
});
export const PATCH = teamRoute(async (u, req) => {
  adminOnly(u);
  const b = await jsonBody(req),
    id = String(b.id),
    note = textField(b.note, "Review / meeting note", 1000);
  await prisma.$transaction(async (tx) => {
    if (b.action === "CLEAR_MEETING") {
      const m = await tx.managerMeeting.findUnique({ where: { id } });
      if (!m || m.status !== "PENDING")
        throw new TeamError("This meeting has already changed.", 409);
      const pending = await syncMeetings(tx, m.userId);
      if (!pending.some((x) => x.id === id))
        throw new TeamError(
          "This streak is no longer pending. Refresh the page.",
          409,
        );
      const employee = await tx.user.findUniqueOrThrow({
        where: { id: m.userId },
      });
      if (!employee.active || !employee.approved)
        throw new TeamError("Employee is not active and approved.", 409);
      const date = todayWorkDate();
      const after = await tx.managerMeeting.update({
        where: { id },
        data: {
          status: "CLEARED",
          clearedDate: date,
          reviewedAt: new Date(),
          reviewedBy: u.name,
          note,
        },
      });
      await policyAudit(tx, u, m.userId, id, "MEETING_CLEARED", m, after);
      await notify(
        tx,
        [employee],
        "MEETING_CLEARED",
        id,
        "Manager meeting completed. Any recorded arrival needs separate approval before you retry clock-in.",
        "team?view=performance&section=clearance",
      );
      return;
    }
    if (b.action === "APPROVE_ARRIVAL") {
      const a = await tx.arrivalAttempt.findUnique({where:{id}});
      if (!a || a.workDate !== todayWorkDate()) throw new TeamError("Choose today's recorded arrival. For older dates, use an attendance correction.",409);
      const employee = await tx.user.findUniqueOrThrow({where:{id:a.userId}});
      if (!employee.active || !employee.approved) throw new TeamError("Employee is not active and approved.",409);
      if (await tx.attendanceRecord.findFirst({where:{userId:a.userId,workDate:a.workDate,clockInAt:{not:null}}})) throw new TeamError("Clock-in already exists. Use an attendance correction.",409);
      if (a.approvedAt) throw new TeamError("Arrival is already approved. Refresh the page.",409);
      const approvedAt = b.useProposed === true && a.proposedAt ? a.proposedAt : a.arrivedAt;
      const changed = await tx.arrivalAttempt.updateMany({where:{id,approvedAt:null},data:{approvedAt,approvedBy:u.name}});
      if (!changed.count) throw new TeamError("Arrival already changed. Refresh.",409);
      await policyAudit(tx,u,a.userId,id,"ARRIVAL_APPROVED",a,{...a,approvedAt,approvedBy:u.name,note});
      await notify(tx,[employee],"ARRIVAL_APPROVED",id,"Arrival approved. Retry clock-in after any pending meetings are cleared.","team?view=performance&section=clearance");
      return;
    }
    if (b.action === "REVIEW_REFERRAL") {
      const r = await tx.referralClaim.findUnique({
        where: { id },
        include: { user: { select: { id: true, role: true } } },
      });
      const status = String(b.status);
      if (
        !r ||
        !(
          (r.status === "PENDING" &&
            ["APPROVED", "REJECTED"].includes(status)) ||
          (r.status === "APPROVED" && status === "REVOKED")
        )
      )
        throw new TeamError("This referral has already changed.", 409);
      const partyReference = textField(
        b.partyReference ?? r.partyReference,
        "Verified party reference",
        100,
      ).toUpperCase();
      const key = partyReference.replace(/\s+/g, "");
      if (status === "APPROVED") {
        if (b.verified !== true)
          throw new TeamError(
            "Confirm payment, customer referral, and that the party has not already earned an award.",
          );
        if (
          await tx.referralClaim.findFirst({
            where: { approvedPartyKey: key, id: { not: id } },
          })
        )
          throw new TeamError(
            "This party has already earned referral points. Split bills and repeat visits do not earn another award.",
            409,
          );
      }
      const after = await tx.referralClaim.update({
        where: { id },
        data: {
          status,
          partyReference,
          approvedPartyKey: status === "APPROVED" ? key : r.approvedPartyKey,
          reviewedBy: u.name,
          reviewedAt: new Date(),
          note,
        },
      });
      await policyAudit(tx, u, r.userId, id, `REFERRAL_${status}`, r, after);
      await notify(
        tx,
        [r.user],
        "REFERRAL_DECISION",
        `${id}:${status}`,
        `Your referral for bill ${r.billNumber} was ${status.toLowerCase()}`,
        "team?view=performance&section=clearance",
      );
      return;
    }
    throw new TeamError("Unknown action.");
  });
  return { ok: true };
});
