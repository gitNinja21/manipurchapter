import { prisma } from "@/lib/prisma";
import { teamRoute, TeamError } from "@/lib/team";
export const GET = teamRoute(async (u, req) => {
  const id = req.nextUrl.pathname.split("/").at(-2)!;
  const announcement = await prisma.announcement.findUnique({
    where: { id },
    include: {
      author: { select: { name: true } },
      acknowledgements: {
        where: { userId: u.id },
        select: { acknowledgedAt: true },
      },
    },
  });
  if (!announcement) throw new TeamError("This announcement was removed.", 404);
  return { announcement };
});
