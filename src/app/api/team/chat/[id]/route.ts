import { prisma } from "@/lib/prisma";
import { teamRoute, jsonBody, TeamError } from "@/lib/team";
import { reactionEmoji } from "@/lib/teamValidation";
export const POST = teamRoute(async (u, req) => {
  const id = req.nextUrl.pathname.split("/").pop()!,
    b = await jsonBody(req);
  if (typeof b.emoji !== "string" || !reactionEmoji.includes(b.emoji))
    throw new TeamError("Choose a supported reaction.");
  const emoji = b.emoji;
  await prisma.$transaction(async (tx) => {
    if (!(await tx.teamMessage.findFirst({ where: { id, deletedAt: null } })))
      throw new TeamError("Message unavailable.", 404);
    const where = {
      messageId_userId_emoji: { messageId: id, userId: u.id, emoji },
    };
    const existing = await tx.messageReaction.findUnique({ where });
    if (existing) await tx.messageReaction.delete({ where });
    else
      await tx.messageReaction.create({
        data: { messageId: id, userId: u.id, emoji },
      });
  });
  return { ok: true };
});
export const DELETE = teamRoute(async (u, req) => {
  const id = req.nextUrl.pathname.split("/").pop()!;
  const message = await prisma.teamMessage.findUnique({ where: { id } });
  if (!message) throw new TeamError("Message unavailable.", 404);
  if (message.authorId !== u.id && u.role !== "ADMIN")
    throw new TeamError("You can only remove your own messages.", 403);
  await prisma.$transaction([
    prisma.teamMessage.update({
      where: { id },
      data: { body: "", deletedAt: new Date(), deletedBy: u.id },
    }),
    prisma.notification.deleteMany({ where: { kind: "CHAT", entityKey: id } }),
  ]);
  return { ok: true };
});
