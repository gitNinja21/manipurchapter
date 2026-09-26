# Customer reviews

Staff open **Reviews → Generate QR code** and show it to a customer. Scanning opens `/review` with the code filled in; the customer taps Start review. Copy review link and manual four-digit entry remain available. The QR is generated locally, expires with the five-minute invitation, and is hidden once claimed. Its URL fragment binds the code to the original invitation so a reused code cannot direct an old QR to another employee. The fragment is removed on opening to preserve the fresh-visit reset. A public link also appears below staff sign-in. Customers enter the code, see their server's name, select 1–5 stars for each of five questions, and the review saves automatically when the last unanswered question is rated. There is no Submit button. Ratings can be changed before all five are filled; while saving, controls are disabled. A failed save keeps the ratings and offers Retry saving. The Google review invitation appears only after a successful save. There are no text feedback fields or customer accounts.

The questions cover friendliness, attentiveness, order accuracy, speed and overall service. Each review earns `total stars / 25` points: 25 stars = 1 point, 20 = 0.8 and 5 = 0.2. The server calculates and stores the award; client-supplied employee IDs and points are ignored. Reviews appear in monthly performance, staff review history and **Admin → Reviews**, with month and employee filters. Review points do not change recorded hours or salary calculations.

## Code and session rules

- Codes are cryptographically random, four digits (1000–9999), with database-enforced uniqueness across all active codes and one active invite per employee. Concurrent generation reuses that employee's existing invite and never shares codes between employees.
- A code expires exactly five minutes after generation. Generating again while active does not extend it. After expiry, a new code can be generated. Rapid repeated generation is limited.
- The first customer to enter the code consumes its login opportunity. A separate random HttpOnly customer cookie gives that browser 15 minutes to complete the review. The code's subsequent expiry does not interrupt a started review.
- Customer sessions stay bound to the invitation and employee, not the reusable four digits. Duplicate submissions award points only once, protected by a transaction and unique invitation constraint. Every new visit or refresh starts at code entry; leaving and returning (including browser Back/Forward restoration) clears the previous server and unfinished ratings. The page does not automatically restore the customer cookie. Claimed codes remain single-use, so customers need a fresh code to restart.
- Customer cookies grant no staff access. Logged-in staff accounts cannot claim or submit reviews. Deactivated, unapproved and incomplete-onboarding employees cannot issue codes or receive submissions.
- Code-entry attempts are limited to 30 per five-minute window per hashed IP address, stored in the database. No raw IP address is stored. The deployment reverse proxy must sanitize/replace forwarded IP headers; otherwise an attacker can spoof the limiter's key. A shared restaurant connection shares the limit.

## Limits

Code-only access does not verify a real customer or purchase. An employee can still use another browser/device to submit fabricated reviews. These points should not be treated as independently verified customer feedback. Purchase-linked review eligibility or customer verification would be separate features. The system does not revoke existing points or impose a daily review cap.

## Deployment and checks

The migration `20260920180000_customer_reviews` creates invitation, review and rate-limit tables. Run `prisma migrate deploy` before starting the updated app (the existing production start script already does this). No existing attendance or payroll rows are modified.

Run `npm test`, `npm run lint`, `npm run build`, `node scripts/test-customer-reviews.mjs`, and `node scripts/test-performance.mjs`. Integration scripts use disposable SQLite databases and disable reminder/push delivery. To retain the review test server for local browser checks, set `KEEP_TEST_SERVER=1`; its generated code is printed in the test log.

## Optional Google restaurant review

The default link is the verified Manipur Chapter review link: `https://g.page/r/CX-VFZVmOSebEAE/review`. No environment setup is needed. To override it, set `GOOGLE_REVIEW_URL` to another HTTPS review link; set it to an empty value to hide the invitation. Invalid overrides also hide the button. Restart/redeploy after changing the environment.

After the employee review is successfully saved, every customer sees the same optional **Review us on Google** invitation, regardless of their ratings. The five questions and selected stars remain on the same page after saving, with **Review us on Google** directly below them. There is no separate thank-you page, saved message, Submit or Done button. The Google button is disabled until saving succeeds and opens in a new tab. Saved ratings are read-only and are restored on refresh while the customer session is valid. Employee points are saved before this step and do not depend on opening Google or posting there. Google submission happens on Google and is not tracked or claimed as verified by this app. No database migration is required for this optional step.

The public review page uses a local copy of the opening food photograph from `https://manipurchapter.com/img/hero3.jpeg`, with a dark overlay and light rating cards. This background is scoped to the customer review page.
