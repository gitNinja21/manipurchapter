# Team space: Attendance tracking

The admin-only **Attendance tracking** tab (`/admin/team?view=attendance`) shows
all approved employees by date, with date presets, a custom range (up to 93 days),
an employee selector, incident/pending-talk filters and pagination. Employees
cannot access the all-staff API, even by entering its URL directly.

Rows show clock-in and clock-out, expected arrival and required finish, actual
late/early minutes, excuses, separate consecutive late/early day counts and the
manager-talk stage. Existing manager clearance and attendance correction screens
are linked directly. Current pending talks appear above the historical table.
Inactive employees remain identifiable in the employee filter for historical use.

The report and automatic meeting creation share `attendanceStreaks.ts`:

- Lateness over 15 minutes is an incident; any unexcused early departure counts.
- Mondays, recurring off-days and approved leave skip rather than break streaks.
- Compliant or missed working days break streaks. Excluded attendance cannot
  contribute an incident. Approved late/early excuses do not contribute either.
- The report reads history before the selected range, so changing filters never
  resets a streak. Counts can cross month boundaries.
- Today's arrival is provisional until clock-in; departure until clock-out.
  A third incident today shows **Talk due after today**. Existing policy creates
  a pending meeting on the next day's recomputation, not during today's shift.
- Two incidents show **1 more incident → talk**. Pending, cleared-today and
  post-clearance follow-up stages are separate for late and early incidents.
- Consecutive attendance counts show actual continuity; the manager-talk cycle
  resets on clearance. Existing post-meeting penalty rules and month rollover
  remain unchanged. Pending meetings carry into later months.
- Recorded arrival attempts held by a meeting appear as **Awaiting manager
  clearance**, with the arrival time, rather than a missed clock-in.

The page refreshes every 30 seconds while visible. Loading the report synchronizes
pending meetings using the same function as Points & attendance and clock-in.
It does not clear talks or change attendance. Talk clearance continues to require
an arrival record and manager note in Points & attendance.

Checks include unit coverage of date lookback, off-days, leave, missed/compliant
resets, grace, excuses, exclusions, provisional shifts, clearance and month
boundaries. The disposable performance integration suite checks admin permissions,
report rows, pending cases, held arrivals and private-field exclusion.
