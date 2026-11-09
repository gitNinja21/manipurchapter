# Jit salary correction — 9 November 2026

The authorized monthly basis is INR 16,000, annualized over 365 days and ten paid
hours per day: 16000 × 12 / 365 / 10 = 52.602739726… INR/hour. The database stores
the unrounded result. Displayed full-day value is INR 526.03. A ten-hour shift
includes one paid break hour; it does not require eleven elapsed hours.

Migration 20261109000000_jit_salary_correction targets only the EMPLOYEE account
whose normalized employee code is JIT SINGH (the code in the supplied payroll).
It records the prior and corrected rate in PolicyAudit. Other employees retain
nine standard hours and their existing rates. No live database is changed until
deployment runs the migration.

The user-level rate is used for all report dates, so historical reports, CSVs
and newly downloaded PDFs recalculate. Paid off days, full-day equivalents,
bonus-day amounts and missing-punch day deductions use the employee's standard
paid hours. The bonus earning threshold is seven accumulated eligible hours for everyone, applied retrospectively. Bonus-day performance points use the same threshold.

A follow-up migration standardizes Jit's historical attendance payroll snapshots
from go-live to ten hours including one paid break hour and no unpaid break.
The existing scheduled start is retained; when a manual/flexible record has no
scheduled start, actual clock-in is used. Scheduled end becomes start plus ten hours.
Genuine punches and verification evidence are preserved. A system-inferred,
unwaived clock-out without a photo is revised to the corrected scheduled end.
AttendanceAudit preserves before/after snapshots. Historical manual/flexible records
are included in this explicitly authorized correction. Rejected attendance remains
excluded and explicit overtime/late-night restrictions remain effective.

The new regular/bonus split recalculates historical bonuses and carried balances.
Previously downloaded exports remain unchanged. Actual pay varies with days in
the month, attendance and bonuses; annualization does not guarantee exactly 16,000
each month.

Jit's current and future submitted weeks are archived in PolicyAudit and removed
at migration time so he must reconfirm ten-hour shifts before his next clock-in.
The schedule form, API validation, SMS description and attendance snapshot support
the employee-specific duration. Historical weeks remain viewable.

Verification:
- python3 scripts/test-jit-salary-migration.py
- npm test
- npm run build

Bonus duration correction: late arrivals must complete the full actual shift duration before bonus accrues. Paid arrival grace remains regular-pay credit only. This recalculates historical regular/bonus splits, carry-forward and bonus-day points without changing punches.
