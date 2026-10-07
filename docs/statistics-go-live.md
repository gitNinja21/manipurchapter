# Statistics start: 1 October 2026 (IST)

`src/lib/statisticsStart.ts` defines the production reporting boundary. Records dated before 2026-10-01 remain stored for attendance/audit reference but do not count toward payroll, overtime balances, bonus days/pay, paid Mondays, missed/present/completed days, performance points, referrals, customer review totals, lateness or missed-clock-out statistics.

Employee billing begins at the latest of the requested report start, the account creation date in IST, and go-live. A report entirely before go-live returns zero payroll/statistics. Historical work-policy snapshots are unchanged.

Payroll and performance bonus calculations both discard overtime before go-live. This is a one-time launch reset, not a monthly overtime reset: eligible hours from October onward continue to carry into later reports/months, with each eight-hour bonus block awarded only when earned. Existing monthly lateness resets are unchanged.

After deployment, download the payroll CSV again; previously downloaded CSVs do not update themselves. The attachment supplied on 6 October is a historical export and has not been overwritten. Recalculation requires the app's underlying attendance records, not rounded CSV totals.

Validation: `npm test`, `node --import tsx scripts/test-statistics-start.ts`, and `npm run build`. The integration test uses a disposable migrated database and verifies historical data remains intact.
