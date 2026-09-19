import { sendChatPush } from "@/lib/push";
import { prisma } from "@/lib/prisma";
import {
  teamRoute,
  jsonBody,
  textField,
  TeamError,
  memberWhere,
  notify,
} from "@/lib/team";
export const GET = teamRoute(async (u, req) => {
  const before = req.nextUrl.searchParams.get("before");
  const cursor = before
    ? await prisma.teamMessage.findUnique({
        where: { id: before },
        select: { id: true, createdAt: true },
      })
    : null;
  if (before && !cursor) throw new TeamError("Message cursor not found.", 404);
  const rows = await prisma.teamMessage.findMany({
    where: cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {},
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 51,
    include: {
      replyTo: {
        select: { id: true, body: true, authorName: true, deletedAt: true },
      },
      reactions: { select: { emoji: true, userId: true } },
    },
  });
  const hasMore = rows.length > 50;
  const messages = rows
    .slice(0, 50)
    .reverse()
    .map((r) => ({
      ...r,
      body: r.deletedAt ? "Message removed" : r.body,
      reactions: r.deletedAt ? [] : r.reactions,
      replyTo: r.replyTo
        ? {
            ...r.replyTo,
            body: r.replyTo.deletedAt ? "Message removed" : r.replyTo.body,
          }
        : null,
    }));
  return {
    messages,
    hasMore,
    userId: u.id,
    admin: u.role === "ADMIN",
    muteChat: u.muteChat,
  };
});
export const POST = teamRoute(async (u, req) => {
  const b = await jsonBody(req),
    body = textField(b.body, "Message", 2000);
  const replyToId = typeof b.replyToId === "string" ? b.replyToId : null;
  if (
    replyToId &&
    !(await prisma.teamMessage.findFirst({
      where: { id: replyToId, deletedAt: null },
    }))
  )
    throw new TeamError("The message you are replying to is unavailable.");
  const message = await prisma.$transaction(async (tx) => {
    if (
      (await tx.teamMessage.count({
        where: {
          authorId: u.id,
          createdAt: { gte: new Date(Date.now() - 60000) },
        },
      })) >= 20
    )
      throw new TeamError(
        "Please wait a moment before sending more messages.",
        429,
      );
    const msg = await tx.teamMessage.create({
      data: { authorId: u.id, authorName: u.name, body, replyToId },
    });
    const users = await tx.user.findMany({
      where: { AND: [memberWhere, { id: { not: u.id }, muteChat: false }] },
      select: { id: true, role: true },
    });
    await notify(
      tx,
      users,
      "CHAT",
      msg.id,
      `${u.name} sent a team message`,
      "team?view=chat",
      msg.createdAt,
    );
    return msg;
  });
  await sendChatPush(message.id, u.id, u.role).catch(() => console.warn("Chat push unavailable; message saved."));
  return { message };
});
export const PATCH = teamRoute(async (u, req) => {
  const b = await jsonBody(req);
  if (typeof b.lastSeenId !== "string")
    throw new TeamError("Last visible message is required.");
  const last = await prisma.teamMessage.findUnique({
    where: { id: b.lastSeenId },
  });
  if (!last) throw new TeamError("Message not found.", 404);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: u.id },
      data: { chatReadAt: last.createdAt },
    }),
    prisma.notification.updateMany({
      where: {
        userId: u.id,
        kind: "CHAT",
        createdAt: { lte: last.createdAt },
        readAt: null,
      },
      data: { readAt: new Date() },
    }),
  ]);
  return { ok: true };
});
