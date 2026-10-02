# Attendance SMS reminders

One English SMS per eligible employee per IST workday, starting 15 minutes after their effective scheduled start. The persistent server checks every minute. Temporary shift overrides and weekly schedules are respected; Monday is off unless an explicit shift overrides it. There are no SMS clock-out reminders.

Skip inactive/unapproved/onboarding accounts, days off, a recorded clock-in or verified arrival, and pending/approved leave, late-arrival or GPS clock-in requests for that day. The message contains separate full HTTPS links to the late-arrival and leave forms. Sign-in retains the intended form. No salary or attendance status is changed by a reminder.

On restart, an unsent reminder for today can be sent after its deadline but before the shift ends. Past days are not backfilled. The database unique employee/workday claim prevents duplicate sends across restarts and multiple instances. A send failure or timeout is not automatically retried because Twilio may already have accepted it. A process crash after claiming can leave a CLAIMED record; do not delete/retry it without checking Twilio logs first.

## Railway setup

Keep existing `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`. Add:

```
ATTENDANCE_SMS_ENABLED=true
ATTENDANCE_SMS_BASE_URL=https://www.mcattendance.in
TWILIO_SMS_FROM=<your SMS-enabled Twilio number in +countrycode format>
```

Alternatively use `TWILIO_MESSAGING_SERVICE_SID=MG...` with a configured sender pool instead of `TWILIO_SMS_FROM`. If both are present, the Messaging Service is used. The `VA...` Verify service is for password-recovery OTPs and cannot be used here. Do not assume a voice-enabled number is ready for SMS. Enable destination messaging permissions for India and confirm the sender can deliver there. Follow Twilio's current India requirements: https://www.twilio.com/en-us/guidelines/in/sms . Full first-party URLs are used rather than shortened links.

The feature is disabled by default. Production startup runs the normal Prisma deployment migrations, including `AttendanceSms`, before Next starts. The server must remain running for timely delivery. These reminders are independent of browser push and announcement calls.

`AttendanceSms` stores one attempt per employee/date, its status, Twilio Message SID when accepted, and a numeric provider error code when available. ACCEPTED is not a delivery receipt; use the Message SID in Twilio Messaging logs to inspect actual delivery. Missing sender configuration and failed sends are logged in Railway without phone numbers, message bodies or credentials. Missing/invalid employee numbers are recorded as INVALID_NUMBER. Texts with two URLs can span multiple billable SMS segments.

## Validation

`npm test` covers grace boundaries, shift-end suppression, days off, shift overrides, arrival/request suppression, concurrent deduplication, post-claim clock-in, invalid numbers, disabled/missing configuration, provider uncertainty and safe login redirects using a fake sender. No live SMS is sent by tests.

## Automatic departure limitation

The existing 10:45 pm automatic clock-out is a fallback time, not evidence of physical departure. Early departures require a correction using the actual leaving time. SMS reminders do not establish presence, and this change does not alter payroll or automatic clock-out.
