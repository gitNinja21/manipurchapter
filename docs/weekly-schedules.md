# Weekly employee schedules and missing punches

Effective IST work date: 4 November 2026. Earlier records and salary calculations
retain their previous policy. The first submission covers the remaining dates
of the week beginning Monday 2 November.

Employees use **Today > My weekly schedule**. Tuesday-Sunday are required, Monday
is off, every shift is nine elapsed hours including a one-hour paid break and
no unpaid break. Existing start times prefill the form (bounded to a same-day
nine-hour shift). Submission is required on the server for normal and GPS
fallback clock-in. Current and next week are available. After submission, only
future calendar dates can be edited. Past/current attendance is corrected by
admin. Old shift-change requests cannot override this new weekly schedule.

A saved change is audited, notifies admins in-app and queues an SMS containing
old/new times to the two existing admin-copy phone contacts. This reuses the
existing announcement SMS configuration and delivery reporting; no calls are
made. SMS failure does not erase a saved schedule. The UI warns if unconfigured.

Normal selfie, pose and location verification still apply. **Forgot clock-in?
Clock out now** captures a genuine leaving punch, uses the submitted shift start
as an assumed boundary, and records one missing-clock-in incident. The presumed
arrival has no face/photo verification. Fixed scheduled shifts only: a flexible
opened Monday has no fixed start to infer and needs admin correction.

A worker checks every minute and also runs on relevant attendance/payroll reads.
After the IST work date has ended (and the saved end has passed), an unfinished
shift receives its saved scheduled end as an assumed clock-out. Actual arrival
is retained: 11:00 to a 19:00 scheduled finish pays eight hours, without adding
arrival grace to this inferred record. Before reconciliation, today's open
shift remains incomplete. Each assumption is labelled and audited. A delayed
approved GPS punch can replace the corresponding system-assumed boundary.

Both missing: no working-day salary. PDF status is **Approved leave** when an
approved request covers the date; otherwise **Didn't show up** after the day
ends. Today's unrecorded day is not labelled absent yet. Paid-off dates retain
their existing eligibility rules and are not missing-punch incidents.

Each second unwaived missing-punch incident in a calendar month deducts one
current daily rate (hourly rate x 9); counters reset monthly. For partial reports,
the deduction belongs to the date of that second incident, considering earlier
incidents in that month. This can make a narrow reporting period's net subtotal
negative. No extra penalty is applied to a both-missing day. Net salary, CSV and
PDF list the deduction separately from regular, off-day and bonus earnings.

**Attendance Management > Correct Employee Attendance** includes a waiver
checkbox on inferred records. Saving verified actual times can waive the incident
(default checked), or keep it. Monthly deductions recalculate from the retained
incident records, including past months. Original assumptions remain in audit.
Payroll calculation functions remain read-only; reconciliation is a separate
worker/service and does not run inside salary preview calculations.

Deployment: migration `20261104000000_weekly_schedules` runs through the existing
`prisma migrate deploy` startup. No new environment variables. Existing Twilio
announcement SMS variables must remain configured for admin texts.

Validation:
- `npm test`
- `npm run build`
- `npx tsx scripts/test-weekly-attendance.ts` (isolated migrated SQLite DB;
  synthetic selfies; SMS sending and AI disabled)
- `npx tsx scripts/test-payroll-pdf.ts`

## No-show SMS
The attendance SMS worker checks the previous IST date after midnight and sends
one employee-only SMS when both punches are missing. Approved leave, paid closures,
normal Mondays, inactive/unapproved accounts and pending GPS verification requests
are excluded. Open Mondays follow the working-day rule. Not submitting a weekly
schedule does not exempt a Tuesday–Sunday absence. The SMS identifies the date,
the unpaid “Didn't show up” status and asks the employee to contact admin if wrong.
Only yesterday is checked; historical absence messages are not backfilled.

Uses existing ATTENDANCE_SMS_ENABLED=true, ATTENDANCE_SMS_BASE_URL and Twilio SMS
configuration. ARRIVAL and NO_SHOW have separate unique daily claims. Eligibility
is checked again after claiming. Provider failures/timeouts are recorded without
automatic resending, avoiding duplicate paid texts. Claims are not handset delivery
confirmation. No-show messages do not change payroll or add missing-punch penalties.
