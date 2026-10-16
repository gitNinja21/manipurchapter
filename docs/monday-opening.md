# Selected Monday opening

Admin → All employees → Open a Monday previews each active, approved employee’s shift from the preceding Sunday. Saving opens only that date and copies start/latest arrival, duration, unpaid break and paid break. Existing Monday shift overrides retain priority; approved leave remains in force. Employees without a Sunday schedule must have one assigned before opening.

An opened Monday uses normal attendance, proportional breaks, regular pay, bonus hours, late hours and performance points. It does not also earn paid weekly-off credit. Other Mondays retain their existing weekly-off policy. The choice is retained in each employee’s schedule history as a one-day version, so later weekly edits do not erase it or change historical payroll. No database migration is required.

The admin action is atomic, audited and rejects stale previews, past dates, non-Mondays, and dates with attendance, arrival attempts or pending GPS clock-in requests. Newly added or reactivated staff are not silently added to an already-open date; reloading the preview can include them before attendance begins. No calls or SMS announcements are sent by this action. Existing attendance reminders apply on the opened date.

Verification: unit tests for one-day schedule isolation, regular versus weekly-off pay, overtime, missed attendance and completion points; isolated HTTP tests for permissions, preview conflicts, missing Sunday schedules, saved breaks, existing shift priority, idempotency, attendance protection and SMS eligibility.
