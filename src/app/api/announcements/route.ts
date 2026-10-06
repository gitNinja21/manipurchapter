import { announcementWhere, announcementRecipients } from "@/lib/announcementAudience";
import { announcementSmsConfig, queueAnnouncementSms } from "@/lib/announcementSms";
import { queueAnnouncementCalls, voiceConfig } from "@/lib/announcementVoice";
import { prisma } from "@/lib/prisma";
import {
  TeamError,
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
      where: announcementWhere(u),
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
    prisma.announcement.count({where:announcementWhere(u)}),
  ]);
  return { announcements, total, ...(u.role === "ADMIN" ? {voiceConfigured:!!voiceConfig(),smsConfigured:!!announcementSmsConfig()} : {}) };
});
export const POST = teamRoute(async (u, req) => {
  adminOnly(u);
  const b = await jsonBody(req),
    title = textField(b.title, "Title", 150),
    body = textField(b.body, "Message", 10000);
  if (typeof b.sendSms !== "boolean" || typeof b.sendCall !== "boolean") throw new TeamError("Choose your delivery channels.");
  if (b.sendSms && title.length + body.length > 1500) throw new TeamError("For SMS, keep the title and message within 1,500 characters combined.");
  const announcement = await prisma.$transaction(async (tx) => {
    const recipients = await announcementRecipients(tx,b.audience,b.recipientIds);
    const a = await tx.announcement.create({
      data: { title, body, authorId: u.id, audience: String(b.audience), sendSms: b.sendSms as boolean, sendCall: b.sendCall as boolean, recipients: {create:recipients.map(r=>({userId:r.id}))} },
      include: { author: { select: { name: true } } },
    });
    const members = await tx.user.findMany({
      where: {AND:[memberWhere,{OR:[{role:"ADMIN"},{id:{in:recipients.map(r=>r.id)}}]}]},
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
    if (b.sendCall) await queueAnnouncementCalls(tx,a.id,recipients);
    if (b.sendSms) await queueAnnouncementSms(tx,a.id,recipients);
    return a;
  });
  await sendAnnouncementPush(announcement.id).catch(() =>
    console.warn("Push delivery unavailable; in-app notifications saved."),
  );
  return { announcement };
});
