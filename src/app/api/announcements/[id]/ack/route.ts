import { prisma } from "@/lib/prisma";
import { teamRoute, adminOnly, memberWhere, TeamError } from "@/lib/team";
export const POST = teamRoute(async (u, req) => {
  const id = req.nextUrl.pathname.split("/").at(-2)!;
  await prisma.$transaction(async (tx) => {
    if (!(await tx.announcement.findUnique({ where: { id } })))
      throw new TeamError("Announcement not found.", 404);
    await tx.announcementAck.upsert({
      where: { announcementId_userId: { announcementId: id, userId: u.id } },
      create: { announcementId: id, userId: u.id },
      update: {},
    });
    await tx.notification.updateMany({
      where: {
        userId: u.id,
        kind: "ANNOUNCEMENT",
        entityKey: id,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
  });
  return { ok: true };
});
export const GET = teamRoute(async (u, req) => {
  adminOnly(u);
  const id = req.nextUrl.pathname.split("/").at(-2)!;
  if (!(await prisma.announcement.findUnique({ where: { id } })))
    throw new TeamError("Announcement not found.", 404);
  const people = await prisma.user.findMany({
    where: { AND: [memberWhere, { role: "EMPLOYEE" }] },
    select: {
      id: true,
      name: true,
      employeeCode: true,
      acknowledgements: {
        where: { announcementId: id },
        select: { acknowledgedAt: true },
      },
    },
    orderBy: { name: "asc" },
  });
  return { people };
});
