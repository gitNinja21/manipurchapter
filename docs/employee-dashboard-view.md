# Employee dashboard view

Admins can open **Employee view** in the main navigation, or **Employees → View dashboard**. Select an employee to see their live clock status, attendance rules, schedule, monthly hours and bonus balance, announcements and unread counts. Attendance history and points/manager-talk links open the existing admin tools for that employee.

The dashboard reuses the employee UI and calculations. The preview refreshes every 30 seconds while visible. Clock controls are disabled, no employee session is created, and viewing does not acknowledge announcements or mark employee messages read. Links to shared team pages open the admin versions.

Only an active admin may use the preview endpoint. Inactive, unapproved and onboarding employees remain selectable; a banner explains that they cannot yet access their dashboard. No database migration is required.

Validation: `npm test`, `npm run lint`, `npm run build`, then `node scripts/test-performance.mjs` against its disposable database. The integration checks employee/admin data parity, authorization, target isolation, invalid targets, restricted response fields, GET-only behavior and unchanged employee records/session.
