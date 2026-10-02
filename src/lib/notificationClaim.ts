import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

type NotificationClaim = { userId: string; kind: string; entityKey: string; title: string; href: string };

/** Atomically claim a reminder slot without logging expected duplicates as errors. */
export async function claimNotification(db: Pick<PrismaClient, "$executeRaw">, data: NotificationClaim) {
  // SQLite: ignore only this deduplication conflict, not unrelated database failures.
  // The affected-row count identifies the sole process allowed to send the push.
  const inserted = await db.$executeRaw`
    INSERT INTO "Notification" ("id", "userId", "kind", "entityKey", "title", "href")
    VALUES (${randomUUID()}, ${data.userId}, ${data.kind}, ${data.entityKey}, ${data.title}, ${data.href})
    ON CONFLICT ("userId", "kind", "entityKey") DO NOTHING
  `;
  return inserted === 1;
}
