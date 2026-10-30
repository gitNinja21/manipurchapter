# Selfie themes

Admin → Attendance Management → Selfie theme of the day offers No theme, Mini Heart, Bunny, Power and Spread Love. Choose a date (IST) and clock-in, clock-out or both. Dates without an enabled record use the original face/location workflow. No theme explicitly disables a date's gesture requirement. Theme changes affect subsequent attempts, not existing attendance or previously submitted GPS requests.

Employees first see a large SVG pose demonstration with instructions. Heart themes include an enlarged finger diagram. They open the camera after viewing the example; it remains open when pose checking rejects a photo. Pose checks occur on capture, not continuously in the video. The submitted photo is checked by OpenAI, then reused unchanged for attendance. Browser face-descriptor comparison remains the existing identity mechanism; the vision service assesses pose and face visibility, not identity or liveness.

## Railway setup

- Set `OPENAI_API_KEY` to a funded OpenAI API project's secret key, in Railway only.
- Optional `SELFIE_POSE_MODEL` defaults to `gpt-4.1-mini`, with image input and strict structured output.
- Deploy the migration `20261031000000_selfie_themes`. Existing start command runs `prisma migrate deploy`.
- No themes are automatically enabled. Without an API key, admin can save No theme but cannot enable mandatory poses.

The employee screen discloses that themed selfies go to OpenAI. Requests use `store: false`; this disables response storage, not a promise of zero provider retention. No employee name, ID, GPS coordinates or face descriptor is sent to the vision service. Pose attempt logs contain photo hashes, verdicts and metadata, not another copy of the image. Normal attendance photo storage remains unchanged. Only active approved signed-in users can call verification.

## Enforcement and failure handling

Server verification returns a database receipt bound to employee, calendar date, clock action, theme revision and photo hash, expiring in three minutes. Attendance checks the receipt again inside its database transaction and consumes it once. Client-supplied success flags have no effect. Normal clock-in, clock-out and GPS fallback request creation all enforce the same rule. A theme change invalidates previous receipts. Provider timeout, refusal, malformed result or uncertainty cannot pass. Request timeout is 25 seconds, limited to eight checks in ten minutes and 40 per user/calendar day. Attempts are reserved transactionally before provider calls.

Admin exceptions apply to one employee/date/action and require a recorded reason. They bypass only the pose gate. Create/revoke actions and theme changes are recorded in PolicyAudit. Admins can inspect recent results and disable the day's theme during an outage. Existing manually corrected attendance remains an admin-only action with its existing audit trail.

## Validation

`npm test` covers scope, input validation, photo binding, provider request shape and rejection cases. `node --import tsx scripts/test-selfie-themes.ts` uses an isolated migrated SQLite database, synthetic images, mocked provider verdicts and a local Next production server. It verifies authorization, normal attendance, mandatory gates on all three routes, photo/employee binding, receipt consumption, theme revision invalidation, exceptions and auditing. It never sends real selfies or uses a paid API key.

Before using mandatory poses with staff, test each pose using the configured provider on real cameras, including incorrect near-matches, varied lighting and both mirrored orientations. Mini Heart must reject pinches/OK signs; Spread Love must reject circles. Synthetic integration tests do not establish real-world recognition accuracy. No funded key was available during implementation, so a live provider accuracy test remains outstanding.
