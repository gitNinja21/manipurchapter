"""Regression check for migrating existing zero-break attendance. No live DB used."""
import json
import sqlite3
from pathlib import Path

migrations = Path(__file__).resolve().parents[1] / 'prisma' / 'migrations'
connection = sqlite3.connect(':memory:')
target = '20260919180000_universal_break'
for migration in sorted(migrations.glob('*/migration.sql')):
    if migration.parent.name >= target:
        break
    connection.executescript(migration.read_text())
connection.execute('INSERT INTO "User" (id, employeeCode, name, passwordHash, updatedAt) VALUES (?, ?, ?, ?, ?)', ('test', 'BREAK-TEST', 'Test employee', 'test-only', 1789770600000))
for record_id, minutes in [('zero-break', 0), ('existing-break', 60)]:
    connection.execute('INSERT INTO "AttendanceRecord" (id, userId, workDate, clockInAt, clockOutAt, unpaidBreakMinutes, approvalStatus, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', (record_id, 'test', '2026-09-19' if minutes == 0 else '2026-09-20', 1789770600000, 1789806600000, minutes, 'APPROVED', 1789770600000))
connection.commit()
connection.executescript((migrations / target / 'migration.sql').read_text())
rows = connection.execute('SELECT unpaidBreakMinutes, clockInAt, clockOutAt, approvalStatus FROM "AttendanceRecord" ORDER BY id').fetchall()
assert all(r == (60, 1789770600000, 1789806600000, 'APPROVED') for r in rows)
assert all((r[2] - r[1]) / 3600000 - r[0] / 60 == 9 for r in rows)
audits = connection.execute('SELECT recordId, beforeJson, afterJson FROM "AttendanceAudit"').fetchall()
assert len(audits) == 1 and audits[0][0] == 'zero-break'
assert json.loads(audits[0][1])['unpaidBreakMinutes'] == 0
assert json.loads(audits[0][2])['unpaidBreakMinutes'] == 60
connection.execute('INSERT INTO "AttendanceRecord" (id, userId, workDate, updatedAt) VALUES (?, ?, ?, ?)', ('default-break', 'test', '2026-09-22', 1789770600000))
assert connection.execute('SELECT unpaidBreakMinutes FROM "AttendanceRecord" WHERE id = ?', ('default-break',)).fetchone()[0] == 60
assert not list(connection.execute('PRAGMA foreign_key_check'))
print('PASS: existing zero-break records corrected and audited; existing 60-minute records unchanged; timestamps/approval preserved; database default is 60; foreign keys valid.')
