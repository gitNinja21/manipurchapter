"""Test salary correction on isolated SQLite; never accesses production data."""
import sqlite3,tempfile,json,math
from pathlib import Path
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="mc-gokul-rate-") as tmp:
 db=sqlite3.connect(str(Path(tmp)/"test.db"))
 target="20261110010000_gokul_daily_salary_correction"
 for m in sorted((root/"prisma/migrations").glob("*/migration.sql")):
  if m.parent.name>=target: break
  db.executescript(m.read_text())
 for code in ["GOKUL","KONG GOKUL","HINGNAM 700","OTHER"]:
  db.execute('INSERT INTO User (id,employeeCode,name,passwordHash,hourlyRateRs,flexibleNineHours,updatedAt) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)',(code,code,code,"unused",69,1))
  db.execute('INSERT INTO AttendanceRecord (id,userId,workDate,clockInAt,clockOutAt,policyVersion,updatedAt) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)',(code,code,"2026-10-13",1791864000000,1791910800000,5))
 before=db.execute("SELECT * FROM AttendanceRecord ORDER BY id").fetchall()
 db.executescript((root/"prisma/migrations"/target/"migration.sql").read_text())
 for code in ["GOKUL","KONG GOKUL"]:
  rate,hours,flex=db.execute("SELECT hourlyRateRs,standardShiftHours,flexibleNineHours FROM User WHERE id=?",(code,)).fetchone()
  assert math.isclose(rate,657.5/9) and math.isclose(rate*hours,657.5) and flex==1
  old=json.loads(db.execute("SELECT beforeJson FROM PolicyAudit WHERE userId=?",(code,)).fetchone()[0])
  assert old["hourlyRateRs"]==69
 for code in ["HINGNAM 700","OTHER"]:
  assert db.execute("SELECT hourlyRateRs FROM User WHERE id=?",(code,)).fetchone()[0]==69
 assert db.execute("SELECT * FROM AttendanceRecord ORDER BY id").fetchall()==before
 print("PASS: both Gokul aliases updated at full precision; audit retains old rate; other employees and all attendance unchanged.")
