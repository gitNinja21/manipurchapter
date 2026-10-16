# Customer analytics

Open **Analytics · Captain login** on the public landing page. Analytics now has its own dashboard at `/analytics`, outside both employee and admin layouts.

The admin creates separate credentials under **Admin → Captain logins**. Captain accounts live in a separate table and use a scoped 12-hour cookie, never the staff session. Signing in as captain clears any existing staff/admin cookie on that browser. Captain credentials cannot access payroll, employees, attendance or admin APIs. Admins can still open Analytics using their admin session. Disabling a captain or resetting their password immediately invalidates existing sessions. Five failed login attempts lock a captain account for 15 minutes. Account creation and resets are admin-only.

If a laptop previously used the admin password, sign out and use the new captain credentials. Creating a captain account does not change existing admin credentials or revoke admin sessions on other browsers.

## Daily workflow

1. Choose New visit, select Tab 1–Tab 13 and enter group counts, and save on arrival. The server records the current IST date/time and fetches current weather for the configured restaurant coordinates.
2. Reopen from Daily records to add menu items and quantities, unavailable item names, favourite dishes and optional feedback/discovery details. Mark complete when finished.
3. Use Daily records for another date, Insights for up to 93 days, or export CSV. Values are menu value, not actual bill revenue: taxes, discounts and service charges are not collected. Open visits are explicitly counted. An empty day means no records, not proof of zero business.
4. Holiday calendar permits labels and full-holiday flags for any date, including local festivals and calendar corrections. Changes apply to existing records for that date through the shared date calendar. They never close the restaurant or change employee attendance.

## Weather setup

Create a WeatherAPI.com account and add **WEATHERAPI_KEY** to Railway, then redeploy. Their published free tier supports commercial use and current weather: https://www.weatherapi.com/pricing.aspx . Never prefix the secret with NEXT_PUBLIC_. The key is only used on the server.

The coordinates use RESTAURANT_LAT and RESTAURANT_LNG, defaulting to the restaurant's supplied Guwahati coordinates (26.158283, 91.782532). Each new visit makes a current-weather request; there is no daily weather cache. The provider updates current conditions periodically, not continuously. Both the request time and provider observation time are stored. Readings older than 45 minutes or more than five minutes in the future are treated as unavailable. Visits save if the key is missing, requests fail or time out after five seconds; weather is explicitly marked missing, never invented or treated as dry. Later visit edits keep the original weather and timestamp. Adding a key does not backfill previous missing readings.

## Menu and history

The catalog in src/lib/analytics/menu.ts was transcribed and visually checked against the owner's 12-page menu mc.pdf supplied 16 October 2026. Rice and water have separate size variants; Singju allows veg/non-veg. Prices are always calculated on the server. Each saved line retains its name, category, diet and price. Editing its quantity preserves that original price. New lines use the current catalog.

Visits store an idempotency key to avoid duplicate creates after a lost response, and a revision to reject concurrent stale edits/deletes. Delete is a soft delete; removed visits are excluded from daily records and exports. All visits remain in the existing persistent SQLite database and should be included in regular database backups. No customer names, phone numbers or photographs are collected.

## Calendar coverage

Saturday/Sunday are weekend flags, independent of the restaurant's Monday closure. Month periods are 1–10, 11–20 and 21–end. The base holiday calendar is the Assam government's 17 November 2025 notification for 2026: https://diphumch.assam.gov.in/sites/default/files/public_utility/Assam-Government-Holiday-List-2026-PDF_0.pdf . This is a published baseline, not a live exhaustive list of all festivals or later government notices. Lakshmi Puja is labelled as a half holiday rather than a full holiday. Add local festivals and later corrections via the calendar. Other years show calendar-not-configured until explicitly entered. There is no claim of predictive accuracy: current Insights are descriptive, and the structured exports support future forecasting once sufficient data exists.

## Validation

`npm test` includes catalog/price validation, group counts, snapshots, weather failures and time matching, IST boundaries and aggregation checks. `node --import tsx scripts/test-customer-analytics.ts` tests real HTTP routes using an isolated SQLite database after a production build. It never sends live messages or uses production attendance.

## Visible visit details

Daily records now shows the saved date, weekday, IST time, table, temperature, conditions, rain, humidity and provider observation time. Insights includes a Saved visit details table, in addition to broad context summaries. The saved-entry confirmation includes date/time and temperature when available. Reading, reopening or editing a visit preserves its original timestamp and weather. The original schema already stored these fields; no existing records are overwritten. Missing historical readings are not invented. Provider failures now retain a safe explanation (invalid key, quota, disabled account, stale reading or connection/data failure).

## Table workspaces and retention

Each of the 13 table buttons now opens an independent workspace instead of changing the label of the current visit. Switching tables keeps unsaved inputs, quantities, item selections and the saved visit ID separate. Workspaces persist in this browser's localStorage under the authenticated account's ID and have no timer-based expiry. Reloading or signing in again as the same account on the same browser restores them. Clearing browser/site storage, private browsing cleanup or a different device can remove or hide local drafts. Use Save to persist visits to the server; local drafts alone are not server backups.

Saved visits do not expire when the 12-hour captain login expires. They remain in the database until explicitly deleted. Daily records filters by the displayed IST date, refreshes when opened, on window focus and every 30 seconds while visible, and has Today/Refresh controls. New visit creates a fresh group for the selected table; after completion, reselecting a table starts a new workspace. The API rejects changing the table label of an already saved visit, preventing an outdated browser from overwriting another table's entry. Existing records already overwritten in earlier versions cannot be reconstructed without a prior database backup.

Recurring shift editing now defaults to today. Past effective dates remain blocked, and existing attendance, arrival attempts or pending GPS clock-in requests prevent changes from affecting recorded arrivals. Future dates remain available.
