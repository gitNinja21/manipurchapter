# Working dates and paid closures

Admin → Attendance Management provides three actions:

- **Open a Monday:** a selected Monday uses the Flexible Hourly Schedule. Employees can clock in/out at any time with the usual selfie/location verification. Off-day credit is replaced by actual hourly attendance pay.
- **Close a Date:** apply the existing Paid Off Day eligibility and salary rules. Attendance stays saved, but does not add attendance pay while closed.
- **Correct Employee Attendance:** open the attendance editor for today or a past date. This action does not change anyone’s schedule, convert existing records, or remove anyone’s off-day pay.

The default is the **Normal Hourly Schedule**: existing employee shifts, clock-in windows, lateness and payroll rules apply. Only explicitly opening a Monday enables flexible attendance. Paid closures are a separate off-day rule.

In the attendance editor, load an employee and date, enter actual timestamps, unpaid break hours and a reason, then save. Only that employee’s record changes. Manually corrected attendance is paid at the hourly rate for elapsed time minus the entered unpaid break; the one-hour paid break is included, not added. Off days must be opened before saving hourly attendance. Overlap, joining-date, leave and stale-record safeguards still apply.

Migration `20261023000000_restore_normal_schedules` removes legacy HOURLY overrides from 23 October 2026 onward and records the removed settings in PolicyAudit. Earlier dates, attendance records and explicit paid closures are preserved. After deployment, newly opened Mondays can still use flexible attendance. No calls or announcement SMS are sent by these controls.
