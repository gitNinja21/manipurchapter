import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { claimNotification } from "./notificationClaim";

test("SQLite claims once without duplicate error logs, preserves existing notifications, and propagates real failures", async () => {
  const directory = await mkdtemp(join(tmpdir(), "notification-claim-"));
  const db = new PrismaClient({ datasources: { db: { url: `file:${join(directory, "test.db")}` } }, log: [{ emit: "event", level: "error" }] });
  const errors: string[] = [];
  db.$on("error", event => errors.push(event.message));
  try {
    await db.$executeRawUnsafe(`CREATE TABLE "Notification" (
      "id" TEXT PRIMARY KEY NOT NULL, "userId" TEXT NOT NULL, "kind" TEXT NOT NULL,
      "entityKey" TEXT NOT NULL, "title" TEXT NOT NULL, "href" TEXT NOT NULL,
      "readAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE ("userId", "kind", "entityKey"))`);
    const data = { userId: "employee", kind: "ATTENDANCE_IN", entityKey: "2026-10-02:0", title: "Clock in", href: "/employee" };
    const results = await Promise.all(Array.from({ length: 8 }, () => claimNotification(db, data)));
    assert.equal(results.filter(Boolean).length, 1);
    const original = await db.notification.findFirstOrThrow();
    await db.notification.update({ where: { id: original.id }, data: { readAt: new Date("2026-10-02T05:00:00Z") } });
    assert.equal(await claimNotification(db, { ...data, title: "Changed text" }), false);
    const after = await db.notification.findFirstOrThrow();
    assert.equal(after.id, original.id);
    assert.equal(after.title, original.title);
    assert.equal(+after.createdAt, +original.createdAt);
    assert.ok(after.readAt);
    assert.equal(await claimNotification(db, { ...data, entityKey: "2026-10-02:1" }), true);
    assert.equal(await claimNotification(db, { ...data, userId: "another" }), true);
    assert.equal(await db.notification.count(), 3);
    assert.deepEqual(errors, []);
    await db.$executeRawUnsafe('DROP TABLE "Notification"');
    await assert.rejects(claimNotification(db, data));
  } finally {
    await db.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});
