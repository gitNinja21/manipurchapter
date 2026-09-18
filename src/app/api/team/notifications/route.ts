import { prisma } from "@/lib/prisma";
import { teamRoute, jsonBody, TeamError } from "@/lib/team";
export const GET = teamRoute(async (u, req) => {
  const page = Math.max(
    1,
    Math.min(
      10000,
      Math.floor(Number(req.nextUrl.searchParams.get("page")) || 1),
    ),
  );
  const [items, total, unread, chatUnread] = await prisma.$transaction([
    prisma.notification.findMany({
      where: { userId: u.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 30,
      take: 30,
    }),
    prisma.notification.count({ where: { userId: u.id } }),
    prisma.notification.count({
      where: {
        userId: u.id,
        readAt: null,
        ...(u.muteChat ? { kind: { not: "CHAT" } } : {}),
      },
    }),
    prisma.teamMessage.count({
      where: {
        deletedAt: null,
        authorId: { not: u.id },
        ...(u.chatReadAt ? { createdAt: { gt: u.chatReadAt } } : {}),
      },
    }),
  ]);
  return { items, total, unread, chatUnread };
});
export const PATCH = teamRoute(async (u, req) => {
  const b = await jsonBody(req);
  if (b.all !== true && typeof b.id !== "string")
    throw new TeamError("Choose a notification.");
  await prisma.notification.updateMany({
    where: {
      userId: u.id,
      readAt: null,
      ...(b.all === true ? {} : { id: String(b.id) }),
    },
    data: { readAt: new Date() },
  });
  return { ok: true };
});
