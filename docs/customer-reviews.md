# Customer reviews

Staff open **Reviews → Generate 4-digit code** and share the `/review` page with a customer on the customer's own device. A public link also appears below staff sign-in. Customers enter the code, see their server's name, select 1–5 stars for each of five questions, and submit. There are no text feedback fields or customer accounts.

The questions cover friendliness, attentiveness, order accuracy, speed and overall service. Each review earns `total stars / 25` points: 25 stars = 1 point, 20 = 0.8 and 5 = 0.2. The server calculates and stores the award; client-supplied employee IDs and points are ignored. Reviews appear in monthly performance, staff review history and **Admin → Reviews**, with month and employee filters. Review points do not change recorded hours or salary calculations.

## Code and session rules

- Codes are cryptographically random, four digits (1000–9999), with database-enforced uniqueness across all active codes and one active invite per employee. Concurrent generation reuses that employee's existing invite and never shares codes between employees.
- A code expires exactly five minutes after generation. Generating again while active does not extend it. After expiry, a new code can be generated. Rapid repeated generation is limited.
- The first customer to enter the code consumes its login opportunity. A separate random HttpOnly customer cookie gives that browser 15 minutes to complete the review. The code's subsequent expiry does not interrupt a started review.
- Customer sessions stay bound to the invitation and employee, not the reusable four digits. Refreshes and duplicate submissions award points only once, protected by a transaction and unique invitation constraint.
- Customer cookies grant no staff access. Logged-in staff accounts cannot claim or submit reviews. Deactivated, unapproved and incomplete-onboarding employees cannot issue codes or receive submissions.
- Code-entry attempts are limited to 30 per five-minute window per hashed IP address, stored in the database. No raw IP address is stored. The deployment reverse proxy must sanitize/replace forwarded IP headers; otherwise an attacker can spoof the limiter's key. A shared restaurant connection shares the limit.

## Limits

Code-only access does not verify a real customer or purchase. An employee can still use another browser/device to submit fabricated reviews. These points should not be treated as independently verified customer feedback. Purchase-linked review eligibility or customer verification would be separate features. The system does not revoke existing points or impose a daily review cap.

## Deployment and checks

The migration `20260920180000_customer_reviews` creates invitation, review and rate-limit tables. Run `prisma migrate deploy` before starting the updated app (the existing production start script already does this). No existing attendance or payroll rows are modified.

Run `npm test`, `npm run lint`, `npm run build`, `node scripts/test-customer-reviews.mjs`, and `node scripts/test-performance.mjs`. Integration scripts use disposable SQLite databases and disable reminder/push delivery. To retain the review test server for local browser checks, set `KEEP_TEST_SERVER=1`; its generated code is printed in the test log.
