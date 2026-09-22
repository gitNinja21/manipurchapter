# Clock-duration attendance policy (version 2)

New clock-ins and newly created manual/corrected attendance use version 2 after
rollout. Existing records keep their version and payroll rules, including open
shifts. Version 2 snapshots shift duration, expected arrival, unpaid break and
manager-meeting status. Changing schedules does not rewrite existing records.

## Timings

| Employees | Expected entry IST | Required clock duration |
| --- | --- | --- |
| Gokul, Hignam, Nijuli, Robinson | 09:30–10:30 | 9 hours |
| Angai, Chetan, Sagar | 13:00 | 9 hours |
| Dinjana Tuesday–Friday | 11:30 | 9 hours |
| Dinjana Saturday/Sunday | 12:00 | 9 hours |
| Joyshree, Lachit, Pankaj | 10:00 | 9 hours |
| Vicky | 12:30 | 9 hours |
| Tokili Friday | 13:00 | 7 hours |
| Tokili Saturday/Sunday | 11:00 | 9 hours |

Required finish is actual (or manager-approved) clock-in plus duration. Old fixed
finish times do not apply to version 2. Lateness compares against expected entry
(or the end of an arrival window); early departure compares against the rolling
finish. A 10:30 arrival for a 10:00 start finishing at 19:00 is both 30 minutes
late and 30 minutes early. It pays 8.5 hours, with no second time deduction.

Tokili has no recurring shifts Monday–Thursday, no missed-day flags for those
days, and no automatic paid Monday. An admin can assign an extra dated shift.
Regular staff retain the existing paid-Monday rule.

## Work, regular pay and bonus

- Everyone takes a one-hour break. Actual work is elapsed time minus that hour.
- For standard shifts the break is paid: regular salary hours are elapsed time,
  capped at 9. There is no full-shift top-up and no second deduction after a meeting.
- Tokili Friday has an unpaid break: regular salary hours are elapsed time minus
  one hour, clamped to 0–6. Seven clock hours therefore pay six hours.
- Bonus starts beyond the required clock duration: 9 hours normally, 7 on Friday
  for Tokili. These hours are not also paid as regular salary.
- Every 8 eligible bonus hours earns a 9-hour day at the employee's hourly rate;
  remaining hours carry across months. Completed attendance pays automatically unless explicitly excluded.
- Eligible time after the rolling finish counts automatically after clock-out.
  A reason is optional and does not affect pay or points. Existing pending extra
  time also counts; historical rejected extra time stays capped at its saved cutoff
  unless an administrator corrects the attendance. No extra-time requests are created.
- Extra-shift points remain +1 for actual work exceeding 10.5 hours
  (excluding the break). Merely earning a bonus hour does not award this point.

## Temporary shifts and corrections

Employees request a date, start/end times and reason in Team → Requests. Only
admin approval changes the expected arrival. The requested interval must be the
required duration (9 hours normally, 7 for Tokili Friday); actual finish still
moves with actual clock-in. Old and proposed starts must be future, with no
recorded arrival, approved leave or overlap. Admin edits use the same safeguards.

Approved late/early exceptions excuse disciplinary incidents, not unworked pay.
Both employee corrections and manual admin edits recalculate payroll, bonus hours and points automatically. Corrections to version 2 recalculate finish and
cutoff from corrected clock-in while preserving the original duration and break.
Legacy records retain their old payroll/finish rules when corrected.

## Manager clearance

Three consecutive scheduled working days over 15 minutes late, or three early
departures, create separate meeting cases. Off-days and approved leave are
skipped; an ordinary missed/compliant day breaks the streak. Open attendance can flag incidents immediately; excluded attendance cannot. Pending cases are
recomputed after corrections/reviews and on clock-in/performance load.

The next clock-in verifies face and location, then saves the first arrival attempt
instead of opening attendance while a meeting remains pending. The employee can
propose an earlier same-day arrival with an explanation; only the manager can
approve it. Manager clearance requires a recorded arrival and a meeting note.
All pending cases must be cleared; the employee retries clock-in, which uses the
approved arrival. Meeting-day time spent waiting is protected. Negative points begin
on subsequent days in the same month; pending meetings survive month rollover.

## Points and referrals

Final points are derived from completed attendance and approved referral records, not
incremented counters, so repeated requests/reapprovals cannot duplicate awards:

- +0.5 for an on-time arrival and completed scheduled finish.
- +1 once/day for actual work exceeding 10.5 hours.
- −1.5 once/day for late arrival/early departure after the relevant meeting, even when both
  types occur together. Positive extra-work credit is independent.
- +3 for one manager-verified completed referral bill, one employee per bill.

Referrals require a bill number/date and a stable party reference. A unique bill
key prevents duplicate claims; a unique approved party key prevents split bills
and repeat-party awards. Admin must verify payment, first referral and matching
party references manually: there is no POS integration. Rejection/revocation is
audited; cancelled or fully refunded bills must have their award revoked.

Admin Employees and Overview show current-month points beside names. Team →
Points & attendance shows month totals, eligible shifts, points per shift,
incidents, meeting clearance, referrals and decision history. Both attendance
screens distinguish net work from salary-credit hours.

## Validation and rollout

Run `npm test`, `npm run lint`, `npm run build`, then
`node scripts/test-work-rules.mjs` and `node scripts/test-performance.mjs`.
The integration scripts create disposable databases, users and a test-only
process clock; they do not touch production data or introduce a production clock
override. `KEEP_TEST_SERVER=1` retains the performance test server for UI checks.

Back up the deployed database before applying migrations. The normal start script
runs `prisma migrate deploy`; migrations preserve existing attendance. This
implementation does not deploy or push to Git by itself.

## Administrator recovery from technical issues

Admin → Attendance → Add / correct attendance — system issue loads an employee
and arrival date before allowing an edit. Enter actual IST times and a required
reason. Clock-out may be empty for an open shift today; past dates require both
times. Saving creates or updates attendance as PENDING, keeps original photo
evidence, records before/after times and the reason in Attendance Audit, and
notifies the employee. No selfie verification is invented for manual entries.

The endpoint is admin-only and rejects future/pre-employment times, overlaps,
approved leave and stale edits. Existing duration/break snapshots are preserved; version 2 finish and overtime cutoff are recalculated from corrected clock-in;
eligible extra time counts automatically. Starting today's attendance while a manager
meeting is pending requires an explicit confirmation that the meeting occurred.
Completed attendance counts toward payroll automatically. No separate attendance
approval is required. Existing pending completed shifts are included; historically
rejected shifts remain excluded. Admins can explicitly exclude or restore a shift
with a salary preview, and the decision remains audited.


## Migration notes

The version 2 migration adds the duration snapshot and weekday-specific schedule
configuration, and assigns Lachit, Pankaj and Tokili using their exact account IDs.
It does not rewrite attendance or previously approved salaries. The earlier
universal-break migration remains part of history: it corrected legacy zero-break
records to 60 minutes with an audit entry. Version 2 explicitly stores zero unpaid
minutes for paid-break shifts and 60 for Tokili Friday; actual work still excludes
one hour in both cases.

## Selected historical recalculation

Admin → Attendance → Add / correct attendance has an explicit “Recalculate this
record using the current pay policy” checkbox for completed records. Leave the
correct times unchanged, provide a correction reason and save; payroll updates automatically. This updates only the selected record's policy,
break, schedule and duration, recalculates related incidents/points, and logs a
POLICY_RECALCULATED audit with before/after values. Existing timestamps retain
seconds when the form values have not been changed. Historical rows are otherwise
unchanged. Eight net working hours can correctly coexist with nine paid hours;
check salary hours/regular pay rather than changing times to inflate net hours.

Dinjana's weekend entry deadline is noon. Required finish remains nine hours from
actual clock-in (12:00 → 21:00). Weekdays retain 11:30 entry. Paid Monday status is
stored separately from weekday-specific schedules so her paid off-day remains.

## Early clock-in

Clock-in opens 15 minutes before the scheduled start (or the beginning of a recurring arrival window), never before midnight of the work date. This applies to recurring and dated shifts, regardless of the legacy `attendanceAllowEarly` flag. Earlier starts require an employee shift-change request approved before arrival and before the new start. Same-day requests are allowed without a 24-hour notice period. If no arrival has been recorded, a future shift can be approved even after the original scheduled start. Approval changes that day's scheduled start; the same 15-minute window applies to the approved schedule. Admins retain authority to assign shifts directly. Existing recorded times and rolling required finishes are unchanged.

## Closing time and employee visibility

New clock-outs strictly after 22:45:00 IST automatically create a late-clock-out review under Team → Requests. Actual clock-out is always saved. Only the portion after 22:45 is held from payroll, bonus accumulation and extra-shift points until approved. Rejection keeps that portion excluded; it does not exclude earlier time or erase the actual departure. The cutoff belongs to the original work date for overnight departures. Employees cannot approve or cancel these automatic reviews. Admin decisions are audited. An admin-approved correction or manual leaving-time entry also approves the late portion and retires superseded pending reviews. Restoring a whole excluded shift does not bypass a late-time rejection.

Historical completed records keep their previous treatment; the migration does not retroactively withhold time. Standard paid-break shifts display elapsed clocked time, regular time and bonus time in hours/minutes. Payroll counted hours include the paid break. Existing part-time schedules and historical unpaid breaks remain unchanged.

Employee pages show clocked duration, attendance status, requests and points only. Their home endpoint no longer calculates or exposes payroll summaries, bonus-day conversions or balances. Salary amounts, rates and payroll breakdowns remain in existing admin-only payroll tools; no new payroll-department role is introduced.
