# Customer analytics

Open **Analytics** on the public landing page and use an existing active ADMIN login. Ordinary employee logins cannot read or change visits. The captain uses admin access as requested. Admin navigation also contains Analytics.

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
