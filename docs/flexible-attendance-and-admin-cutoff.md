# Flexible attendance and date-specific automatic clock-out

## Hingnam and Gokul
The migration identifies EMPLOYEE accounts by known codes: GOKUL / KONG GOKUL and
HINGNAMBE NEWME / HINGNAM 700. It sets flexibleNineHours and standardShiftHours=9.
Hourly rates remain unchanged.

Policy 5 uses actual recorded times, with a 09:30–22:30 IST reference window:
- regular paid time = min(9 hours, elapsed time inside the window);
- bonus = actual time before 09:30 plus actual time after 22:30;
- unpaid = inside-window time beyond nine hours.
Each minute belongs to exactly one category. A paid break is included, not added.
For example 12:30–22:30 pays nine regular hours, with one unpaid hour.
08:30–23:30 pays nine regular plus two bonus hours and four unpaid hours.
A short day pays its actual eligible duration, never a guaranteed nine hours.
Seven accumulated bonus hours earn one standard salary day.

No weekly submission or arrival deadline applies. Monday remains off unless
opened; closed dates retain paid-off rules. Selfie, pose and location checks
remain. Existing post-22:45 review and explicitly rejected time remain enforced.
No scheduled-start reminder or late-arrival penalties apply.

All attendance snapshots from October go-live are migrated to policy 5 with an
audit. Real punches, hourly rates, approval decisions and verification evidence
are preserved. Reports/PDFs/bonus balances and points recalculate from those
snapshots. Historical downloaded files must be regenerated.
Admin corrections retain this policy and automatically calculate unpaid time.

## Admin-selected clock-out
Attendance Management → Automatic clock-out for a date. Select today or a future
date, IST time, enable/disable, and save. The setting is admin-only, audited and
revision checked. Nothing is enabled by default.

The production worker checks every minute, with the exact selected cutoff saved
as the timestamp; attendance reads and clock actions also run the check. Restart
catch-up processes elapsed enabled cutoffs. Only still-open employee records
with an arrival at/before the cutoff are closed. Existing clock-outs, selfies,
attendance before the chosen date and later arrivals are never rewritten.
Saving a past time today immediately processes currently open eligible records.

An admin automatic clock-out creates no verified selfie and no missing-OUT
incident or -0.5 legacy penalty. An existing missing-IN incident still counts.
Salary uses the resulting interval and that employee's payroll policy.
Normal/GPS clock-in and clock-out paths reject attempts after the cutoff,
including transaction rechecks. Admin manual corrections remain available.
Disabling/changing a setting never reopens already closed records.

Checks:
- npm test
- python3 scripts/test-flexible-migration.py
- node --import tsx scripts/test-flexible-cutoff.ts
- npm run build
