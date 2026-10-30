# Employee payroll PDFs

Admin > Payroll > choose the date range > Download PDF beside an employee.
The download is an admin-only, non-cacheable server response. It contains one
salary-summary page plus daily attendance pages (18 dates per page). It does
not send messages, mark salary paid, or change payroll rules.

The summary uses computeStatsForRange; daily details are generated from the same
employee, saved policy snapshots and day modes. It distinguishes approved leave,
pending leave, missed shifts, incomplete records, rejected records and paid off
days. Today's missing attendance is not labelled a missed shift. Dates before
go-live or joining and future dates do not contribute. Date ranges are limited
to one year per PDF.

Break deductions use saved policy calculations. Paid-break allowances are
labelled as allowances, not evidence of actual breaks taken. Payroll can change
when attendance is subsequently corrected; PDFs are generated snapshots, not
payment confirmations. Standard PDF fonts support Latin names; unsupported
characters are displayed as question marks.

No database migration or environment variables are required.

Validation: npm test; npm run build; npx tsx scripts/test-payroll-pdf.ts.
The integration script uses a disposable migrated SQLite database and verifies
reconciliation, flexible hours, breaks, absence classifications and pagination.
Set PAYROLL_PREVIEW_PATH to save its fictional report for visual review.
