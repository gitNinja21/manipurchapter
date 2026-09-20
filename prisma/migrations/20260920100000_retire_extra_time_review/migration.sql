-- Preserve attendance timestamps, rejected decisions, and historical request records.
-- Pending extra time now counts through payroll automatically, without mutating its audit snapshot.
UPDATE "Notification"
SET "readAt" = COALESCE("readAt", CAST(strftime('%s','now') AS INTEGER) * 1000)
WHERE "kind" = 'REQUEST' AND "entityKey" IN (
  SELECT "id" FROM "StaffRequest" WHERE "kind" = 'EXTRA_TIME' AND "status" = 'PENDING'
);
UPDATE "StaffRequest"
SET "status" = 'CANCELLED',
    "reviewNote" = 'Extra-time review retired; eligible hours count automatically.',
    "reviewedBy" = 'SYSTEM',
    "reviewedAt" = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE "kind" = 'EXTRA_TIME' AND "status" = 'PENDING';
