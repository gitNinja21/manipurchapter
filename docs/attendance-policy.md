# Attendance, salary credit and monthly points

New clock-ins use policy version 1. Existing attendance keeps version 0 and its
previous payroll rules. New attendance snapshots the approved schedule, unpaid
break and whether a manager meeting activates late/early deductions. Changing a
future schedule never rewrites an existing snapshot.

## Work versus pay

- Actual work is elapsed in/out time less the assigned break (60 minutes for
  recurring or dated scheduled shifts). Unapproved extra time is capped at the
  review threshold. Photos and actual timestamps remain unchanged by that cap.
- Completing a scheduled shift earns nine regular salary hours even if net work
  is shorter. Before counselling, up to 15 minutes of lateness is a pay grace;
  incomplete shifts outside that grace are paid for actual net time, capped at 9.
- After the relevant manager meeting, late or early minutes reduce the nine-hour
  credit for the rest of that IST calendar month. A shorter shift already paid
  for actual hours is never charged an additional deduction for the same time.
- Actual work above nine hours enters the bonus bank; salary top-ups never do.
  Eight accumulated bonus hours earn a nine-hour day, with remainder carried
  across months. Only approved complete attendance counts.
- Extra work needs a reason after the earlier of scheduled finish and 10.5 actual
  hours (break added to elapsed time). Admin decides extra time first, then
  attendance. Unscheduled employees also have the 10.5-hour review threshold.
- Monday remains the existing paid off-day: no attendance pay/bonus/points or
  disciplinary incident for that day.

## Temporary shifts and exceptions

Employees request a date, start/end times in IST and reason under Team → Requests.
Only admin approval changes the dated schedule. Both the old and proposed start
must still be in the future, with no recorded arrival, approved leave or overlap.
A dated shift overrides recurring rules for that day; recurring rules resume on
the next day. Admin schedule edits use the same safeguards and are audited.

Approved late-arrival and early-departure exceptions remove the corresponding
incident. Corrections retain schedule snapshots, reset attendance approval and
reopen extra-time review when needed. Historical corrections therefore update
final points rather than adding a duplicate award.

Recurring finish times: Nijuli 19:00 and Robinson 20:00 (the beginning of their
stated usual departure windows); Gokul and Hignam 22:30. The other six keep their
previously assigned finish times. Employees without recurring rules need an
assigned dated shift for schedule-based salary credit and points.

## Manager clearance

Three consecutive scheduled working days over 15 minutes late, or three early
departures, create separate meeting cases. Off-days and approved leave are
skipped; an ordinary missed/compliant day breaks the streak. Pending attendance
can flag incidents immediately; rejected attendance cannot. Pending cases are
recomputed after corrections/reviews and on clock-in/performance load.

The next clock-in verifies face and location, then saves the first arrival attempt
instead of opening attendance while a meeting remains pending. The employee can
propose an earlier same-day arrival with an explanation; only the manager can
approve it. Manager clearance requires a recorded arrival and a meeting note.
All pending cases must be cleared; the employee retries clock-in, which uses the
approved arrival. Meeting-day time spent waiting is protected. Penalties begin
on subsequent days in the same month; pending meetings survive month rollover.

## Points and referrals

Final points are derived from approved attendance and referral records, not
incremented counters, so repeated requests/reapprovals cannot duplicate awards:

- +0.5 for an on-time arrival and completed scheduled finish.
- +1 once/day for approved actual work exceeding 10.5 hours.
- −1.5 once/day for late/early arrival after the relevant meeting, even when both
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
