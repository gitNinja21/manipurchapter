"""Isolated SQLite migration check; never reads or writes application databases."""
import json
import sqlite3
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="mc-jit-payroll-") as tmp:
    db = sqlite3.connect(str(Path(tmp) / "test.db"))
    migrations = sorted((root / "prisma/migrations").glob("*/migration.sql"))
    target = "20261109000000_jit_salary_correction"
    for migration in migrations:
        if migration.parent.name >= target:
            break
        db.executescript(migration.read_text())
    for uid, code in [("jit", "JIT SINGH"), ("other", "OTHER")]:
        db.execute('INSERT INTO User (id,employeeCode,name,passwordHash,hourlyRateRs,updatedAt) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)',
                   (uid, code, uid, "test-only", 74.07))
        for week in ["2026-10-26", "2099-01-05"]:
            db.execute('INSERT INTO EmployeeWeekSchedule (id,userId,weekStart,daysJson,updatedAt) VALUES (?,?,?,?,CURRENT_TIMESTAMP)',
                       (uid+week,uid,week,json.dumps({"example": {"start":"10:00","end":"19:00"}})))
    # Genuine eleven-hour attendance with an incorrect nine-hour regular target.
    start=1791779400000
    for uid in ["jit", "other"]:
        db.execute('INSERT INTO AttendanceRecord (id,userId,workDate,clockInAt,clockOutAt,scheduledStartAt,scheduledEndAt,policyVersion,shiftDurationMinutes,unpaidBreakMinutes,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)',
                   (uid+"-shift",uid,"2026-10-12",start,start+11*3600000,start,start+9*3600000,3,540,60))
    db.executescript((root / "prisma/migrations" / target / "migration.sql").read_text())
    rate, hours = db.execute("SELECT hourlyRateRs,standardShiftHours FROM User WHERE id='jit'").fetchone()
    assert rate == 16000*12/365/10 and hours == 10
    assert db.execute("SELECT hourlyRateRs,standardShiftHours FROM User WHERE id='other'").fetchone() == (74.07,9)
    assert db.execute("SELECT weekStart FROM EmployeeWeekSchedule WHERE userId='jit'").fetchall() == [("2026-10-26",)]
    assert db.execute("SELECT count(*) FROM EmployeeWeekSchedule WHERE userId='other'").fetchone()[0] == 2
    audit=json.loads(db.execute("SELECT beforeJson FROM PolicyAudit WHERE action='RETROSPECTIVE_SALARY_CORRECTION'").fetchone()[0])
    assert audit["hourlyRateRs"] == 74.07
    assert db.execute("SELECT count(*) FROM PolicyAudit WHERE action='WEEK_SCHEDULE_RECONFIRM_REQUIRED'").fetchone()[0] == 1
    db.executescript((root / "prisma/migrations/20261109010000_jit_historical_ten_hour_shifts/migration.sql").read_text())
    row=db.execute("SELECT clockInAt,clockOutAt,scheduledStartAt,scheduledEndAt,shiftDurationMinutes,paidBreakMinutes,unpaidBreakMinutes FROM AttendanceRecord WHERE id='jit-shift'").fetchone()
    assert row == (start,start+11*3600000,start,start+10*3600000,600,60,0)
    assert db.execute("SELECT shiftDurationMinutes,unpaidBreakMinutes FROM AttendanceRecord WHERE id='other-shift'").fetchone()==(540,60)
    audit=json.loads(db.execute("SELECT beforeJson FROM AttendanceAudit WHERE recordId='jit-shift'").fetchone()[0])
    assert audit["shiftDurationMinutes"]==540 and audit["unpaidBreakMinutes"]==60
    print("PASS: exact Jit rate, other employees unchanged, prior weeks preserved, future schedules archived for resubmission.")
