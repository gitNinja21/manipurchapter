# Automatic attendance pay and reminders

Completed shifts now count toward salary and attendance points automatically.
This includes existing completed PENDING records. Short-hour pay, meeting rules,
penalties, breaks and bonus thresholds are unchanged. Eligible extra time counts
without review, including previously pending extra time. The clock-out reason is
optional. Historical rejected extra time remains excluded until attendance is corrected.
Previously rejected attendance remains excluded. Admins can correct records or
explicitly exclude/restore a shift with an audited salary preview. The extra-time retirement migration archives old
pending requests and marks their review notifications read, preserving rejected
and approved decisions and attendance timestamps. It runs through the normal
`prisma migrate deploy` deployment step. The legacy status columns remain for history.

## Reminder defaults (Asia/Kolkata)

- Missing clock-in: from 10:30 AM, or the scheduled arrival deadline if later,
  until the scheduled shift ends. Skip off-days, approved leave, employees who
  already clocked in, and employees whose arrival is recorded for manager clearance.
- Missing clock-out: from 10:30 PM, or the recorded rolling finish if later. An
  overnight shift retains its deadline across midnight. Shifts older than 24 hours
  receive an evening correction reminder because normal clock-out is unavailable.
- Repeat every five minutes while missing. Set `ATTENDANCE_REMINDER_REPEAT_MINUTES`
  to another positive interval, or `0` for one reminder per shift/day.
- Only active, approved employees who completed onboarding are eligible.

The visible employee app checks every 15 seconds using server time. A four-note
bell is louder than chat, at 0.8 gain versus 0.16. The user must enable sound in
this browser; use the header's Enable notifications & sound button, or the Enable
loud reminder sound button when a reminder appears. Attendance sound is independent
of the chat-mute preference. Browser storage and Web Locks prevent duplicate
chimes across tabs. Changing device volume, muting the browser, or locking the
phone can prevent a custom sound; the website cannot force device volume.

The persistent production Next server runs a one-minute background check via
`src/instrumentation.ts`. Unique notification keys prevent duplicate sends across
server processes and restarts. Dispatch rechecks attendance before push; a push
already delivered to a device cannot be recalled. Push payloads are generic and
expire after 60 seconds. Foreground system notifications are silent to avoid
playing over the custom bell. Delivery failures are logged; the next eligible
five-minute slot can retry. A failed push does not change attendance or payroll.

Background push uses existing VAPID environment settings and device subscriptions:
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Enable device notifications
on each device. System notifications obey phone/browser sound and Focus settings.
An iPhone needs the installed Home Screen web app. Actual physical-device delivery
and loudness need validation after deployment. This implementation does not deploy
or change server secrets.

`ATTENDANCE_REMINDERS_ENABLED=false` disables background dispatch. Development and
test servers do not dispatch unless explicitly enabled with `true`; the foreground
endpoint still returns reminder eligibility. An always-running Node server is
required for the timer; sleeping/serverless hosting needs an external scheduler.

Checks: `npm test`, `npm run lint`, `npm run build`, and the disposable-database
work-rules/performance scripts. Never run tests against the restaurant database.
