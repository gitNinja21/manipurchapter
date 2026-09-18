import webpush from "web-push";
import { prisma } from "./prisma";
import { memberWhere } from "./team";
export function pushConfigured() {
  return !!(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  );
}
export function allowedPushEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === "443") &&
      (u.hostname === "fcm.googleapis.com" ||
        u.hostname === "updates.push.services.mozilla.com" ||
        u.hostname.endsWith(".notify.windows.com") ||
        u.hostname === "web.push.apple.com" ||
        u.hostname.endsWith(".push.apple.com"))
    );
  } catch {
    return false;
  }
}
export async function sendAnnouncementPush(id: string) {
  if (!pushConfigured()) return;
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { user: memberWhere },
  });
  await Promise.allSettled(
    subscriptions.map(async (s) => {
      if (!allowedPushEndpoint(s.endpoint)) return;
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { auth: s.auth, p256dh: s.p256dh } },
          JSON.stringify({
            title: "Manipur Chapter",
            body: "A new team announcement is available. Sign in to read it.",
            url: "/",
            tag: `announcement-${id}`,
          }),
          {
            TTL: 3600,
            timeout: 5000,
            vapidDetails: {
              subject: process.env.VAPID_SUBJECT!,
              publicKey: process.env.VAPID_PUBLIC_KEY!,
              privateKey: process.env.VAPID_PRIVATE_KEY!,
            },
          },
        );
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410)
          await prisma.pushSubscription.deleteMany({ where: { id: s.id } });
        else console.warn("Announcement push unavailable", status ?? "network");
      }
    }),
  );
}
