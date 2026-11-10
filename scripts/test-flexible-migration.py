"""Verify retrospective policy changes on a temporary DB, never production."""
import sqlite3,tempfile,json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="mc-flex-migration-") as tmp:
 db=sqlite3.connect(str(Path(tmp)/"test.db"))
 target="20261110000000_flexible_staff_admin_clock_out"
 for m in sorted((root/"prisma/migrations").glob("*/migration.sql")):
  if m.parent.name>=target: break
  db.executescript(m.read_text())
 start=1791864000000
 for code in ["KONG GOKUL","HINGNAM 700","OTHER"]:
  db.execute('INSERT INTO User (id,employeeCode,name,passwordHash,hourlyRateRs,updatedAt) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)',(code,code,code,"unused",50))
  db.execute('INSERT INTO AttendanceRecord (id,userId,workDate,clockInAt,clockOutAt,policyVersion,unpaidBreakMinutes,updatedAt) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)',(code,code,"2026-10-13",start,start+13*3600000,3,150))
 db.executescript((root/"prisma/migrations"/target/"migration.sql").read_text())
 for code in ["KONG GOKUL","HINGNAM 700"]:
  assert db.execute('SELECT flexibleNineHours,standardShiftHours,hourlyRateRs FROM User WHERE id=?',(code,)).fetchone()==(1,9,50)
  assert db.execute('SELECT policyVersion,clockInAt,clockOutAt,unpaidBreakMinutes FROM AttendanceRecord WHERE id=?',(code,)).fetchone()==(5,start,start+13*3600000,0)
  old=json.loads(db.execute('SELECT beforeJson FROM AttendanceAudit WHERE recordId=?',(code,)).fetchone()[0])
  assert old["policyVersion"]==3 and old["unpaidBreakMinutes"]==150
 assert db.execute("SELECT flexibleNineHours FROM User WHERE id='OTHER'").fetchone()==(0,)
 assert db.execute("SELECT policyVersion,unpaidBreakMinutes FROM AttendanceRecord WHERE id='OTHER'").fetchone()==(3,150)
 print("PASS: known employee aliases corrected retrospectively, real punches and rates preserved, audit saved, others unchanged.")
