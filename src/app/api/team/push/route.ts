import { prisma } from "@/lib/prisma";
import { teamRoute, jsonBody, TeamError } from "@/lib/team";
import { allowedPushEndpoint, pushConfigured } from "@/lib/push";
export const GET = teamRoute(async () => ({
  configured: pushConfigured(),
  publicKey: pushConfigured() ? process.env.VAPID_PUBLIC_KEY : null,
}));
export const POST = teamRoute(async (u, req) => {
  if (!pushConfigured())
    throw new TeamError(
      "Push notifications have not been configured by the administrator.",
      503,
    );
  const b = await jsonBody(req),
    endpoint = typeof b.endpoint === "string" ? b.endpoint : "",
    keys = b.keys as { p256dh?: unknown; auth?: unknown } | undefined;
  if (
    endpoint.length > 2048 ||
    !allowedPushEndpoint(endpoint) ||
    typeof keys?.p256dh !== "string" ||
    typeof keys.auth !== "string" ||
    !/^[-_A-Za-z0-9]{87}=?$/.test(keys.p256dh) ||
    !/^[-_A-Za-z0-9]{22}={0,2}$/.test(keys.auth)
  )
    throw new TeamError("Invalid or unsupported push subscription.");
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint },
  });
  if (existing && existing.userId !== u.id)
    throw new TeamError(
      "This device has another account’s subscription. Disable notifications on that account first.",
      409,
    );
  if (
    (await prisma.pushSubscription.count({ where: { userId: u.id } })) >= 10 &&
    !existing
  )
    throw new TeamError("Too many subscribed devices.", 409);
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: u.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { p256dh: keys.p256dh, auth: keys.auth },
  });
  return { ok: true };
});
export const DELETE = teamRoute(async (u, req) => {
  const b = await jsonBody(req);
  if (typeof b.endpoint !== "string")
    throw new TeamError("Subscription required.");
  await prisma.pushSubscription.deleteMany({
    where: { userId: u.id, endpoint: b.endpoint },
  });
  return { ok: true };
});
