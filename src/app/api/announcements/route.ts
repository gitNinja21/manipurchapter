import { prisma } from "@/lib/prisma";
import {
  teamRoute,
  adminOnly,
  jsonBody,
  textField,
  memberWhere,
  notify,
} from "@/lib/team";
import { sendAnnouncementPush } from "@/lib/push";
export const GET = teamRoute(async (u, req) => {
  const page = Math.max(
    1,
    Math.min(
      10000,
      Math.floor(Number(req.nextUrl.searchParams.get("page")) || 1),
    ),
  );
  const [announcements, total] = await prisma.$transaction([
    prisma.announcement.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 20,
      take: 20,
      include: {
        author: { select: { name: true } },
        acknowledgements: {
          where: { userId: u.id },
          select: { acknowledgedAt: true },
        },
      },
    }),
    prisma.announcement.count(),
  ]);
  return { announcements, total };
});
export const POST = teamRoute(async (u, req) => {
  adminOnly(u);
  const b = await jsonBody(req),
    title = textField(b.title, "Title", 150),
    body = textField(b.body, "Message", 10000);
  const announcement = await prisma.$transaction(async (tx) => {
    const a = await tx.announcement.create({
      data: { title, body, authorId: u.id },
      include: { author: { select: { name: true } } },
    });
    const members = await tx.user.findMany({
      where: memberWhere,
      select: { id: true, role: true },
    });
    await notify(
      tx,
      members,
      "ANNOUNCEMENT",
      a.id,
      title,
      `announcements?announcement=${a.id}`,
    );
    return a;
  });
  await sendAnnouncementPush(announcement.id).catch(() =>
    console.warn("Push delivery unavailable; in-app notifications saved."),
  );
  return { announcement };
});
