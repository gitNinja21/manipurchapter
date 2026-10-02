# Employee SMS recovery

Sign in → Forgot login ID or password → registered phone → SMS code → login ID and optional new password. Only active, approved EMPLOYEE accounts qualify. Recovery does not grant admin access or bypass onboarding. Existing passwords are never revealed. The primary saved phone number is used; alternate numbers are not recovery destinations. All accounts are considered when detecting shared numbers; ambiguous numbers require admin assistance.

Twilio Verify chooses the SMS sender. Neither purchased announcement phone number is required for OTP sending. In Twilio create a Verify Service with SMS enabled and India allowed in Verify geographic permissions. Use a separate Verify Service dedicated to account recovery. Keep Verify Fraud Guard enabled. Configure Railway server variables:

- SMS_RECOVERY_ENABLED=true
- TWILIO_VERIFY_SERVICE_SID=VA... (Verify Service SID)
- TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN (existing account credentials; use a rotated token if exposed)

Configure the Verify service for ten-minute code validity. Codes are checked by Twilio; the app never stores/logs plaintext OTPs. Recovery sessions are random HttpOnly SameSite=Strict cookies, hashed in the database, valid ten minutes before verification and five minutes afterward. Password reset consumes the grant once, invalidates other grants and increments the employee session version, revoking existing sessions. Existing versionless cookies remain valid only until the first SMS reset. Onboarding state and approval status are preserved.

Rate limits: one request per phone per one-minute bucket, five per hour, thirty recovery requests per IP per ten minutes, two hundred send requests globally per day, five code checks per challenge. Counters live in SQLite and survive restarts. Phone/IP rate-limit keys are HMAC hashed. The hosting reverse proxy must replace X-Forwarded-For. Request responses do not reveal account existence, eligibility, shared numbers or delivery success. Expired challenges/counters are cleaned on new send requests. Validity and phone uniqueness are rechecked before reset; a concurrent password or profile change invalidates recovery.

If no SMS arrives, check Twilio Verify logs, funding/destination permissions, and the employee's primary profile number. Trial accounts may require verified destinations. No automatic voice fallback. SMS delivery is billed by Twilio separately from announcements.

Deploy via normal migration/start. Run npm test, npm run build, node --import tsx scripts/test-account-recovery.ts. Tests use fake OTP delivery and a disposable database; a real SMS test is required after configuration. Never use production auth tokens in test scripts.
