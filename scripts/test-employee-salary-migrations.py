"""Test the pending salary corrections on isolated SQLite."""
import sqlite3,tempfile,json,math
from pathlib import Path
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="mc-salary-rates-") as tmp:
 db=sqlite3.connect(str(Path(tmp)/"test.db"))
 first="20261110020000_hingnam_daily_salary_correction"
 migrations=sorted((root/"prisma/migrations").glob("*/migration.sql"))
 for m in migrations:
  if m.parent.name>=first: break
  db.executescript(m.read_text())
 rates={"HINGNAM 700":394.5,"RCHETAN":394.5,"NIJULI":460.27,"SUSHMA SINGHA":394.52}
 for code in [*rates,"OTHER"]:
  db.execute('INSERT INTO User (id,employeeCode,name,passwordHash,hourlyRateRs,updatedAt) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)',(code,code,code,"unused",40))
  db.execute('INSERT INTO AttendanceRecord (id,userId,workDate,clockInAt,clockOutAt,policyVersion,updatedAt) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)',(code,code,"2026-10-23",1792729800000,1792762200000,3))
 before=db.execute("SELECT * FROM AttendanceRecord ORDER BY id").fetchall()
 for m in migrations:
  if m.parent.name>=first: db.executescript(m.read_text())
 for code,daily in rates.items():
  rate,hours=db.execute("SELECT hourlyRateRs,standardShiftHours FROM User WHERE id=?",(code,)).fetchone()
  assert math.isclose(rate,daily/9) and math.isclose(rate*hours,daily) and hours==9
  old=json.loads(db.execute("SELECT beforeJson FROM PolicyAudit WHERE userId=?",(code,)).fetchone()[0])
  assert old["hourlyRateRs"]==40
 assert db.execute("SELECT hourlyRateRs FROM User WHERE id='OTHER'").fetchone()[0]==40
 assert db.execute("SELECT * FROM AttendanceRecord ORDER BY id").fetchall()==before
 print("PASS: pending employee rate migrations, exact daily values, full-precision hourly rates, audit and unchanged attendance.")
