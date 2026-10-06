# Automatic announcement voice calls

Every newly posted announcement snapshots a call job for each active, approved employee using their existing phone number. Ten-digit Indian mobile numbers are normalized to +91; international numbers require +country-code format. Invalid/missing numbers appear in the admin report. Older announcements are never backfilled.

The persistent production server checks the durable queue every 15 seconds, independently of push notifications. Calls read the title and full body in English (en-IN), then ask for 1. A signed Twilio keypad callback updates the existing announcement acknowledgement and notification. Answering alone is not acknowledgement. Busy/no-answer/failed/cancelled calls retry once, five minutes after the result. Answered calls without 1 are reported without another call. Acknowledgement on the website suppresses queued/retry calls.

## Production setup

Create/fund a Twilio Programmable Voice account, provision a voice-capable caller number, and enable geographic voice permissions for employee destinations. Trial accounts can only call verified destinations. Twilio calls to India require a non-Indian caller number: https://www.twilio.com/en-us/guidelines/in/voice . Confirm the employee-notification use case and applicable account requirements with the provider before activation. Calls have provider usage charges.

Set Railway server variables (never NEXT_PUBLIC):
- ANNOUNCEMENT_VOICE_ENABLED=true
- ANNOUNCEMENT_VOICE_BASE_URL=https://www.mcattendance.in (exact public HTTPS origin)
- TWILIO_ACCOUNT_SID=your account SID
- TWILIO_AUTH_TOKEN=your account auth token
- TWILIO_VOICE_FROM=your provisioned/verified E.164 caller number

Redeploy. The normal start command applies the migration. The app supplies per-attempt callback URLs automatically; no static TwiML application is needed. The public /api/voice/announcements/[key] endpoint must be reachable without a login/proxy challenge. It verifies Twilio signatures against the configured public origin, checks the account, destination and call SID, and binds each callback to one attempt. Never paste secrets into source control.

When disabled or credentials are missing, announcements still work and call rows explicitly show Not configured. Those rows are not replayed on activation, avoiding surprise calls about old announcements. Posting new announcements after activation starts calls automatically.

## Admin report and operational behaviour

Use Announcements → Calls & acknowledgements for each employee's status, attempts, retry time, acknowledgement and error. Employee accounts cannot access the report. No call recording is made. Phone numbers and message content are sent to Twilio to place the call. Calls already accepted by the carrier may continue after announcement deletion; deletion removes queued jobs and further retries via cascade.

Conditional database claims prevent concurrent workers from dialing the same job. Unknown API responses and interrupted sends are not blindly retried: after 30 minutes the status becomes Unknown, and the admin must inspect the provider call log. Late signed callbacks can resolve Unknown. Old attempt callbacks cannot affect a newer attempt. Each job makes at most two automatic attempts. The call is capped at 20 minutes. Worker failures retry their queue check, not uncertain phone deliveries.

## Verification

Run npm test, npm run build, and node --import tsx scripts/test-announcement-voice.ts. Tests use a disposable SQLite database and fake delivery; they never call an employee. A real phone/carrier test remains necessary after provisioning the provider.

## Targeted announcements and SMS (6 October 2026)

The same admin form now selects All employees or Selected employees, with independent SMS and Call checkboxes. Website access and notifications are always included. New announcements save a snapshot of active, approved recipients when posted. Only these recipients and admins can list, open, or acknowledge the announcement. Browser push uses the same scoped notification recipients. Older announcements retain their previous all-team visibility. Deleting an announcement removes pending delivery records; it cannot retract texts or calls already submitted to Twilio.

SMS requires `ANNOUNCEMENT_SMS_ENABLED=true`, an HTTPS `ANNOUNCEMENT_SMS_BASE_URL` (falls back to the voice base URL), existing Twilio account credentials, and either `TWILIO_SMS_FROM` or an `MG...` `TWILIO_MESSAGING_SERVICE_SID`. This is independent of `ATTENDANCE_SMS_ENABLED` and the `VA...` Verify service. The sender and destination must support SMS; voice setup alone is insufficient. If configuration is missing at posting time the admin is warned and delivery rows show NOT_CONFIGURED. Enabling later does not send old messages.

SMS includes the title and full message, limited to 1,500 combined characters plus restaurant identification. Long/Unicode texts may incur multiple SMS-segment charges. Calls remain in English with the existing acknowledgement/retry behavior. Checking neither channel posts on the website only. SMS delivery does not count as acknowledgement; recipients acknowledge on the website or press 1 during the call.

Delivery reports show only the recipient snapshot, along with calls, SMS and acknowledgements. SMS provider callbacks use signed requests and bind the message ID/phone to the queued recipient. Queues are claimed atomically before submission; uncertain submissions are not automatically retried. ACCEPTED/SENT are not proof of delivery; DELIVERED reflects the provider delivery receipt.

Run `npm test`, `npm run build`, `npx tsx scripts/test-targeted-announcements.ts` and `npx tsx scripts/test-announcement-voice.ts`. Integration tests use disposable databases and fake transports; they never contact recipients.
