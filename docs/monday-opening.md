# Working dates and paid closures

Admin → All employees → Working dates & paid closures replaces the old Monday schedule-copying flow. The same controls are available inside Admin → Attendance → Add / correct attendance & hourly pay.

Choose a date, choose an action, and confirm the date-wide payroll change. Merely viewing a date never changes salary. Changes apply to every employee, including inactive employees in historical payroll and employees added later. Other dates retain existing rules.

- Open Monday: select a past, current or future Monday. Clock-in/out has no scheduled start or finish. Normal location/selfie verification remains required.
- Close date: any date becomes a paid off day under the existing Monday daily-credit and eligibility rules. Attendance remains saved, but does not add regular pay, overtime or late incidents while the date is closed. New clock-ins are blocked; existing open shifts can still clock out.
- Correction mode: today or any past date becomes flexible hourly pay. Automatic off-day credit is removed for everyone. Completed eligible attendance counts immediately; no completed attendance means zero salary for that date. Existing times and photos are retained. Existing scheduled records are converted with an audit; old scheduled break deductions are reset to zero for admin entry. Reapplying hourly mode preserves manually entered breaks.

For hourly dates, pay is (clock-out minus clock-in minus actual unpaid break) × hourly rate. The one-hour paid break is included within elapsed time, not added on top and not deducted. Admin enters unpaid break hours (stored as whole minutes). There is no proportional deduction, fixed shift cap, paid arrival grace, lateness penalty, or overtime-to-bonus conversion. Time after 22:45 counts without a separate late-clock-out approval. No fixed-shift completion points are awarded on these unscheduled dates. Unpaid break cannot exceed completed clocked time.

To correct attendance, enable correction mode, load an employee/date, enter actual timestamps and unpaid break hours, then save. Rejected attendance remains excluded until explicitly corrected. Existing attendance overlap, joining-date and approved-leave checks still apply. Normal dates and existing historical rules stay unchanged unless explicitly switched.

The date rule is stored in WorkDayOverride (migration 20261021000000_work_day_controls); hourly attendance uses policy version 4. Date and attendance changes are transactional, audited, and reject stale revisions. Payroll respects the existing October go-live and joining dates. No calls or announcement SMS are sent by these controls; fixed-arrival reminders are suppressed on closed/flexible dates. Legacy one-day Monday schedules remain unchanged until an admin chooses a new date rule.
