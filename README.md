# Manipur Chapter Attendance System

A staff attendance app for Manipur Chapter: employees log in, clock in/out
with a selfie that's automatically checked against their own enrolled photo
(so a stolen or recycled photo can't be used), and see team announcements.
Admins get a private dashboard with hours, missed days, and a monthly
payroll calculation (see "How salary is calculated" below) at ₹100/hour
(editable per employee), plus employee management and an announcement
composer.

## What's inside

- **Next.js 15** (App Router) + **TypeScript**, single deployable app (no separate backend).
- **SQLite via Prisma** for data — no external database to set up. (See "Going to
  production" below for why you'll want a persistent volume.)
- **Login-based auth** with signed, httpOnly session cookies (`jose`, no third-party auth service).
- **Self-signup + admin approval.** Employees create their own account at
  `/signup`: they pick a login ID and password, fill in their phone number,
  address, and (optionally) hobbies and an alternate number, and take a
  reference photo of their face — which becomes both their face-match
  reference and their profile photo. The account is created right away, but
  is blocked from clocking in until an admin reviews and approves it from the
  **Employees** tab; in the meantime the employee can log in and see a
  "pending approval" screen, which moves on by itself the moment they're
  approved (no re-login needed). Admins can also add someone manually (the
  old flow: a shared starting password + forced onboarding on first sign-in)
  as a fallback for someone who can't sign up themselves — that path skips
  the approval step since the admin is creating the account directly.
- **In-browser face verification** using `face-api.js`, running entirely
  client-side via WebAssembly/TensorFlow.js — no video is ever sent to a
  server as raw video, only a still selfie plus a small numeric "face
  descriptor". Every clock-in/out selfie's descriptor is compared against the
  one from the employee's enrollment photo (Euclidean distance, computed on
  the server in plain JS). A mismatch **blocks the clock-in/out outright** —
  this is what stops one employee's account from being used to punch someone
  else in or out. A genuine false rejection (bad lighting, a mask, a big
  haircut change) just means retaking the photo; if it keeps happening, an
  admin can reset that employee's onboarding from the **Employees** tab so
  they re-enroll their face.
- **Optional GPS location gate.** If `RESTAURANT_LAT`/`RESTAURANT_LNG` are
  set (see `.env.example`), clock-in/out also requires the employee's
  device to report a location within `RESTAURANT_RADIUS_METERS` (default
  200m) of that point — blocking remote punches from off-site. Off by
  default until those are configured.
- Attendance selfies and profile photos are stored on disk and only ever
  served back to the employee who took them, or to an admin — never publicly.

## Roles

- **Employee**: clocks in/out (with the face check), sees their own attendance
  history, and reads announcements. They never see pay figures.
- **Admin**: sees everything above the employee level — hours, missed
  clock-ins, incomplete shifts, computed salary, and flagged face mismatches —
  plus reviews and approves/rejects new signups, can add/deactivate
  employees, reset passwords, send someone back through onboarding, change
  hourly rates, review attendance photos, and post/delete announcements.

Employees sign up themselves at `/signup` (see above) and set their own
hourly rate to the ₹100 default — an admin adjusts it, typically at the same
time they approve the account. Manually adding someone from the
**Employees** tab is still there as a fallback and works like the old flow:
the app hands back a shared starting password, and they set their own
password and finish their profile the first time they sign in.

## How salary is calculated

The admin **Payroll** page runs payroll for whatever date range you pick
(pick a full calendar month for it to line up with pay periods). For each
employee, over that range:

- **A complete day is 9 hours.** Working a full day (9+ hours, approved)
  pays that employee's full daily rate (hourly rate × 9). Working less than
  9 hours pays for the actual hours worked, pro-rated — not zero. A working
  day with no approved attendance at all pays nothing.
- **Every Monday in the range is a paid off-day**, regardless of
  attendance — no clock-in is expected or required on a Monday, and it's
  paid at the full daily rate automatically. (This is why "Missed
  clock-ins" only counts non-Monday days.)
- **Overtime** is any hours worked beyond 9 on a working day. It's tracked
  per employee from their join date, across reporting periods. Each completed
  8-hour block earns one extra day's pay: 4 hours earns no bonus yet, 8 earns
  one day, 12 earns one day with 4 hours carried forward, and 16 earns two.
  A report includes only bonus days whose threshold is reached within its
  dates. Remaining hours carry forward across months; changing the report's
  start date does not reset them.
- **Total salary** = (off-day pay) + (regular working-day pay) + (overtime
  bonus-day pay).
- **Nothing before an employee joined counts.** If you run payroll for a
  range that starts before someone's account was created (self-signup or
  admin add, whichever happened), the days before they joined aren't
  treated as missed, and Mondays before they joined aren't paid — their
  numbers only start from their actual join date, even if the rest of the
  team's numbers cover the full range.

Only clock-ins/outs an admin has **approved** in the Attendance Log count
toward hours or salary — a completed day sits unpaid (but visible) until
reviewed. The exact math lives in `src/lib/stats.ts`
(`computeStatsForRange`), and each expandable Payroll row breaks out off days, OT
hours, and bonus days per employee so you can sanity-check the total.

## Admin workspace

- **Overview** focuses on today's active, approved team, outstanding attendance
  approvals across dates, previous days' missing clock-outs, pending signups,
  and month-to-date salary. Monday clock-ins are optional. Each attention item
  links to its employee or filtered attendance records.
- **Attendance** supports employee search, status filters, IST date shortcuts,
  and 50-row pagination. Before an approval, rejection, or reset, the admin
  sees that employee's month-to-date salary before and after the decision.
  The preview does not save anything. Confirming records the decision and its
  audit snapshot atomically; a changed shift requires a fresh review.
- **Payroll** has a compact employee table, expandable salary breakdowns,
  account-creation cutoffs, and progress toward the next 8-hour overtime bonus.
  Paid-day equivalents include prorated approved work plus paid Mondays;
  overtime bonus days are shown separately. Search and status filters also
  apply to summary cards and the CSV export. Choose a calendar month to export
  monthly earnings. Exports are calculations, not payment confirmations.
- **Audit history** records administrator attendance decisions and deletions,
  including attendance removed with an employee account. Snapshots retain the
  employee, administrator, work date, original and resulting status/times, and
  change timestamp. They survive deletion of the original record. History
  starts when this migration is applied; it cannot reconstruct earlier changes.
  Date filters use the shift's work date, not the audit timestamp. This history
  covers admin decisions, not ordinary employee clock-in/out events.
- **Employees** supports name/ID search and pending, active, and inactive filters.

Apply migrations with `npm run db:deploy` before starting the updated app.
The normal `npm start` command already does this. The audit migration adds a
new table without changing existing payroll rules. Run `npm test` for payroll
and reporting regression checks, and `npm run build` for production validation.

## Running it locally

You'll need Node.js 20+ installed.

```bash
npm install
cp .env.example .env
```

Open `.env` and set a real `JWT_SECRET` (a long random string — you can
generate one with `openssl rand -hex 32`). You can leave `DATABASE_URL` as-is
for local use; it just points at a SQLite file in the project folder.

```bash
npm run db:migrate   # creates the SQLite database + tables
npm run dev          # starts the app at http://localhost:3000
```

The migrate step also runs the seed script, which creates one admin login
using the `ADMIN_EMPLOYEE_CODE` / `ADMIN_NAME` / `ADMIN_PASSWORD` values from
your `.env` (defaults: `ADMIN` / `Admin` / `ChangeMe123!`). Log in with that,
go to **Employees**, and add your real staff — each one starts on the
password in `DEFAULT_EMPLOYEE_PASSWORD` (default `Welcome123!`) and sets
their own on first login.

**Change the admin password** (or set a stronger `ADMIN_PASSWORD` in `.env`
*before* the first run) before giving anyone else access to this app. Same
goes for `DEFAULT_EMPLOYEE_PASSWORD` — anyone who knows it can start an
employee's onboarding before that employee does, so treat it as a real
secret, not a placeholder.

### A note on the camera

Both onboarding (enrollment photo) and clock-in/out need real camera access,
which browsers only allow over `https://` or on `localhost`. Local dev at
`http://localhost:3000` is fine; once deployed, Railway gives you an
`https://` URL automatically so this keeps working.

### Face model files

`face-api.js`'s model weights (a few MB) load from a public CDN
(`cdn.jsdelivr.net`) the first time someone opens the onboarding or
clock-in/out page in a given browser, then are cached by the browser. This
needs outbound internet access from the *employee's* browser (not your
server) — fine for any normal deployment, just worth knowing if you ever
lock down network access somewhere unusual.

## Deploying to Railway

1. Push this project to a GitHub repo (Railway deploys from a repo, or you
   can use the Railway CLI to deploy the folder directly with `railway up`).
2. In Railway, create a new project from that repo. Railway will detect the
   Next.js app automatically (via Nixpacks) — you don't need a Dockerfile.
3. **Add a Volume** to the service (Railway dashboard → your service →
   Volumes → "New Volume"). Mount it at `/data`. This is the important part:
   without it, the SQLite database and every attendance selfie get wiped
   every time you redeploy, since container filesystems are otherwise
   ephemeral.
4. Set these environment variables on the service:
   - `DATABASE_URL` = `file:/data/prod.db`
   - `UPLOADS_DIR` = `/data/uploads`
   - `JWT_SECRET` = a long random string (`openssl rand -hex 32`) — use a
     **different** value than your local `.env`.
   - `ADMIN_EMPLOYEE_CODE`, `ADMIN_NAME`, `ADMIN_PASSWORD` — used once, the
     very first time the app starts, to create the admin login. Pick a real
     password here (not the default) since this account can see everyone's
     pay data.
   - `DEFAULT_EMPLOYEE_PASSWORD` — the shared starting password every new
     employee login gets. Pick a real value (not the default) since anyone
     who knows it could start an employee's onboarding before they do.
   - `RESTAURANT_LAT` / `RESTAURANT_LNG` / `RESTAURANT_RADIUS_METERS` —
     optional, only needed if you want the GPS location gate (see "Things
     worth knowing" above). Leave unset to skip it.
   - `NODE_ENV` = `production` (Railway usually sets this automatically).
5. Deploy. On first boot, `npm start` runs `prisma migrate deploy` (creates
   the tables on the volume), then the seed script (creates the admin login
   if it doesn't already exist — safe to leave in place for every future
   deploy, it just no-ops after the first time), then starts the server.
6. Once it's live, log in as admin at your Railway URL and open **Account**
   (top right) to set your own password — do this right away if you left
   `ADMIN_PASSWORD` at its default.

### Sizing the volume

Selfies are saved as JPEGs around 100–300KB each. Two photos per employee
per shift, 20 employees, 6 days a week comes to roughly 15,000 photos and
under 5GB a year — Railway's smallest volume tier is comfortably enough for
a long time. If you ever want to move to a much larger team or keep photos
indefinitely, swap `saveDataUrlPhoto` / `readPhotoByKey` in
`src/lib/photoStorage.ts` for an S3-compatible bucket instead of local disk —
everything else in the app is unaffected either way.

### Using Postgres instead of SQLite (optional)

SQLite on a volume is genuinely fine for a 20-person single-location team.
If you outgrow it later, add a Postgres database in Railway, point
`DATABASE_URL` at it, change `provider = "sqlite"` to `provider =
"postgresql"` in `prisma/schema.prisma`, change the `role` field back to a
real enum if you like (SQLite can't do enums, Postgres can), and run `npx
prisma migrate dev` once locally against the new database before deploying.

## Project structure

```
prisma/schema.prisma       Data model (User, AttendanceRecord, Announcement)
prisma/seed.ts             Creates the first admin login
src/lib/                   Auth, time/salary math, face descriptor matching, photo storage
src/middleware.ts          Redirects based on login/role/onboarding status (Edge-safe, via `jose`)
src/app/page.tsx           Landing + login page
src/app/onboarding/        Forced first-login flow (password, profile, enrollment photo)
src/app/employee/          Clock in/out, my attendance, announcements (employee view)
src/app/admin/             Overview, payroll, employees, attendance, audit history, announcements (admin view)
src/app/api/               All backend routes (auth, onboarding, attendance, admin, announcements, photos)
```

## Things worth knowing before you rely on this

- **Anyone can reach `/signup`.** There's no invite code or admin gate before
  it — that's the point (employees self-serve) — but it does mean someone
  could sign up with a made-up name. The approval step is the actual
  checkpoint: nothing they do (attendance, pay) counts until an admin looks
  at the submitted name/phone/address/photo and approves them. Reject
  deletes the signup outright (nothing to undo — no history exists yet).
- **The pending-approval page polls, it doesn't push.** A logged-in but
  unapproved employee's browser checks `/api/auth/me` every few seconds and,
  once it sees `approved: true`, calls `/api/auth/refresh-session` to reissue
  its cookie before moving on — the cookie itself doesn't know it's been
  approved until then. Server-side blocking (e.g. the clock-in/out routes)
  checks the live database either way, so a stale cookie is a UI delay of a
  few seconds at most, never a security gap.
- **The face descriptor is computed entirely in the employee's browser**
  (via `face-api.js`, WebAssembly/TensorFlow.js) — no raw video ever leaves
  their device. The *comparison* against their enrolled photo happens on the
  server, using plain-JS math on the two descriptors, so it can't be
  tampered with client-side the way a pass/fail flag could be.
- **A face mismatch blocks the clock-in/out** (HTTP 422, nothing is saved) —
  this is a hard gate specifically to stop buddy-punching (one employee
  clocking another in or out on their behalf). What can still be spoofed by
  someone determined and technical is the descriptor computation itself
  (e.g. holding up a printed photo or a photo on another screen) — the same
  limitation any 2D face-recognition check has; there's no liveness check
  (blink/gesture) here. If that turns out to be a real problem, adding one
  back is possible (ask). For genuine false rejections (lighting, a mask, a
  big haircut change), an admin can reset onboarding from the **Employees**
  tab so the employee re-enrolls their face.
- **Optional location gate.** Set `RESTAURANT_LAT` / `RESTAURANT_LNG` /
  `RESTAURANT_RADIUS_METERS` in `.env` to require employees to be physically
  near the restaurant to clock in/out (see `.env.example` for how to get
  coordinates). Desktops/laptops without GPS hardware fall back to
  Wi-Fi/IP-based location, which can be far less accurate than a phone's GPS
  — if employees clock in from a desk, consider a larger radius or leave
  this off.
- **One shift per day per employee.** Clocking in again the same day isn't
  possible until the record resets at midnight (Asia/Kolkata). If your team
  ever needs split shifts in a single day, that's a schema change away
  (ask, and I can add it).
- **"Missed" days** in payroll statistics count every non-Monday calendar
  day in the selected range (up to today) where an employee has no clock-in
  at all — Mondays are excluded since they're paid off-days with no
  attendance expected. It doesn't know about other planned days off, so
  treat it as a starting point for a conversation, not an automatic
  penalty.


## Team workspace

The **Team** tab is available to approved, onboarded employees and admins.

- **Birthdays:** save optional month/day in Account. Sharing with colleagues is
  opt-in; admins can see saved birthdays. Upcoming birthdays and today's greeting
  appear on the home page. No birth year is collected. February 29 is observed on
  February 28 in non-leap years. Birthday greetings are in-app, not scheduled push.
- **Chat:** one shared text channel with replies, emoji reactions, older-message
  pagination, unread counts, and personal mute. Authors can remove their messages;
  admins can moderate any message. Removed content becomes a tombstone. Chat
  refreshes every five seconds while visible. Attachments and private DMs are not included.
- **Announcements:** posting creates an in-app notification for current members.
  Opening a notification and pressing **I've read this** are separate actions;
  admins can track acknowledgements. The bell refreshes every 20 seconds.
- **Requests:** employees submit leave or attendance corrections; admins approve
  or reject with a note. Corrected attendance returns to pending attendance
  approval and creates an audit entry. It does not immediately change payroll.
- **Schedule:** admins assign one shift per employee per date, including overnight
  shifts. Employees see their own schedule and approved leave. Conflicting shifts
  must be cancelled or reassigned before leave approval. Leave and scheduled hours
  do not automatically alter payroll or missing-day calculations.
- **Employee home:** personal approved hours, overtime, bonus-day progress, next
  shift and request/notification shortcuts. Salary amounts remain admin-only.

Break tracking and existing payroll rules are unchanged.

### Optional device push for announcements

In-app notifications need no extra setup. To enable device push, generate a VAPID
key pair with `npx web-push generate-vapid-keys --json`. Set `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (a contact mailto address or HTTPS URL) in
hosting environment variables, then restart the app. Keep the private key secret
and preserve the pair across deployments. Users enable each device from Account
or Notifications and grant browser permission. Production requires HTTPS and a
browser supporting Web Push; iPhone users may need to install to the Home Screen.
Logout removes the device subscription. Push contains a generic announcement
alert; users sign in to read content. Delivery depends on browser/device settings.
Chat and request updates currently use in-app notifications only.

### Updating an existing installation

Back up the SQLite database, install dependencies, run `npm run db:deploy`, then
`npm run build`. The team migration adds tables and optional/defaulted profile
fields; it preserves existing attendance and employee records. Normal `npm start`
also applies pending migrations. Do not copy a local development database over
production data.

Run `npm test`, `npm run lint`, and `npm run build` for checks. The integration
script `scripts/test-team.mjs` requires a disposable, separately migrated database
whose filename is `team-workspace-test.sqlite`, and a local app server pointing
to that same database. Set `TEAM_TEST_DATABASE_URL` and `TEAM_TEST_BASE_URL` before
running it. It creates test accounts and records; use a fresh database per run.
