import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
test("retirement migration archives only pending extra-time requests and clears their unread alerts",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"extra-time-migration-"));
  const db=new PrismaClient({datasources:{db:{url:`file:${join(dir,"test.sqlite")}`}}});
  try {
    await db.$executeRawUnsafe('CREATE TABLE "StaffRequest" (id TEXT PRIMARY KEY, kind TEXT, status TEXT, reviewNote TEXT, reviewedBy TEXT, reviewedAt INTEGER)');
    await db.$executeRawUnsafe('CREATE TABLE "Notification" (id TEXT PRIMARY KEY, kind TEXT, entityKey TEXT, readAt INTEGER)');
    await db.$executeRawUnsafe("INSERT INTO StaffRequest (id,kind,status) VALUES ('pending','EXTRA_TIME','PENDING'),('rejected','EXTRA_TIME','REJECTED'),('approved','EXTRA_TIME','APPROVED'),('leave','LEAVE','PENDING')");
    await db.$executeRawUnsafe("INSERT INTO Notification VALUES ('one','REQUEST','pending',NULL),('two','REQUEST','leave',NULL),('three','CHAT','pending',NULL)");
    const sql=await readFile('prisma/migrations/20260920100000_retire_extra_time_review/migration.sql','utf8');
    for(const statement of sql.split(/;\s*\n/).filter(s=>s.trim())) await db.$executeRawUnsafe(statement);
    const rows=await db.$queryRawUnsafe<{id:string;status:string;reviewedBy:string|null;reviewNote:string|null}[]>('SELECT id,status,reviewedBy,reviewNote FROM StaffRequest ORDER BY id');
    assert.equal(rows.find(r=>r.id==='pending')?.status,'CANCELLED');
    assert.equal(rows.find(r=>r.id==='pending')?.reviewedBy,'SYSTEM');
    assert.match(rows.find(r=>r.id==='pending')?.reviewNote ?? '',/count automatically/);
    assert.equal(rows.find(r=>r.id==='leave')?.status,'PENDING');
    assert.equal(rows.find(r=>r.id==='rejected')?.status,'REJECTED');
    assert.equal(rows.find(r=>r.id==='approved')?.status,'APPROVED');
    const alerts=await db.$queryRawUnsafe<{id:string;readAt:string|null}[]>('SELECT id,CAST(readAt AS TEXT) AS readAt FROM Notification ORDER BY id');
    assert.ok(alerts[0].readAt);assert.equal(alerts[1].readAt,null);assert.equal(alerts[2].readAt,null);
  } finally {await db.$disconnect();await rm(dir,{recursive:true,force:true});}
});
