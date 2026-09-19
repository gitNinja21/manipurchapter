import { assertScheduleMutable, policyAudit } from "@/lib/performanceServer";
import { prisma } from "@/lib/prisma";
import { teamRoute, adminOnly, TeamError, notify } from "@/lib/team";
export const DELETE = teamRoute(async (u, req) => {
  adminOnly(u);
  const id = req.nextUrl.pathname.split("/").pop()!;
  await prisma.$transaction(async (tx) => {
    const shift = await tx.scheduledShift.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!shift) throw new TeamError("Shift not found.", 404);
    await assertScheduleMutable(tx, shift.userId, shift.workDate);
    await policyAudit(tx, u, shift.userId, shift.id, "SCHEDULE_DELETED", shift, null);
    await tx.scheduledShift.delete({ where: { id } });
    await notify(
      tx,
      [shift.user],
      "SCHEDULE_CANCELLED",
      id,
      `Your shift on ${shift.workDate} was cancelled`,
      "team?view=schedule",
    );
  });
  return { ok: true };
});
