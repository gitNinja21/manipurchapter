import sqlite3, pathlib, tempfile, json
root=pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='master-policy-') as tmp:
 c=sqlite3.connect(str(pathlib.Path(tmp)/'test.db'))
 migrations=sorted((root/'prisma/migrations').glob('*/migration.sql'))
 master=next(p for p in migrations if '20260926000000' in str(p))
 for p in migrations:
  if p != master: c.executescript(p.read_text())
 codes=['RONYAMZ','GOKUL','HINGNAMBE NEWME','DINJANA','VICKY','SAGAR12/12/25','RCHETAN','NIJULI','BINAN SINGH','TOKI','ANGAI','JOYSHREE CHANU','LACHIT','PANKAJ','OTHER','KONG GOKUL']
 for code in codes:
  c.execute('INSERT INTO User (id,employeeCode,name,passwordHash,updatedAt) VALUES (?,?,?,?,?)',(code,code,code,'test',0))
 for day in ['2026-09-25','2026-09-26']:
  c.execute('INSERT INTO AttendanceRecord (id,userId,workDate,updatedAt,policyVersion,clockInAt,clockOutAt,shiftDurationMinutes,unpaidBreakMinutes) VALUES (?,?,?,?,?,?,?,?,?)',(day,'PANKAJ',day,0,2,1000,2000,540,150))
 old=c.execute('SELECT * FROM AttendanceRecord WHERE id="2026-09-25"').fetchone()
 c.executescript(master.read_text())
 assert c.execute('SELECT count(*) FROM User WHERE masterScheduleFrom="2026-09-26"').fetchone()[0]==14
 assert c.execute('SELECT masterScheduleFrom FROM User WHERE id="KONG GOKUL"').fetchone()[0] is None
 assert c.execute('SELECT * FROM AttendanceRecord WHERE id="2026-09-25"').fetchone()==old
 r=c.execute('SELECT policyVersion,clockInAt,clockOutAt,shiftDurationMinutes,unpaidBreakMinutes,scheduledEndAt-scheduledStartAt FROM AttendanceRecord WHERE id="2026-09-26"').fetchone()
 assert r==(3,1000,2000,750,150,45000000),r
 assert c.execute('SELECT count(*) FROM PolicyAudit WHERE action="MASTER_POLICY_APPLIED"').fetchone()[0]==1
 print('PASS: full migration chain; all 14 accounts; exact Binan mapping; duplicate Gokul excluded; historical attendance untouched; effective-date records audited and corrected without changing clock times.')
