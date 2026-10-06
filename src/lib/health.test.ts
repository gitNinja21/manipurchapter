import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./prisma";
import { GET } from "../app/api/health/route";

test("readiness checks the database on every request and hides failure details", async t => {
  const original = prisma.user.findFirst;
  t.after(() => { prisma.user.findFirst = original; });
  prisma.user.findFirst = (async () => null) as typeof original;
  const ready = await GET();
  assert.equal(ready.status, 200);
  assert.equal(ready.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await ready.json(), { status: "ok" });
  prisma.user.findFirst = (async () => { throw new Error("private database details"); }) as unknown as typeof original;
  const unavailable = await GET();
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await unavailable.json(), { status: "unavailable" });
  prisma.user.findFirst = (async () => null) as typeof original;
  assert.equal((await GET()).status, 200);
});
