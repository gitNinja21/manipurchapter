# Team chat bell and notifications

Every signed-in header has **Enable notifications & sound** and a sound selector.
Employees tap the button on each device/tab to unlock Web Audio and request push
permission. Default sound is admin messages only. They can choose all messages or
muted. The existing “Mute chat alerts” switch suppresses all chat notifications,
including push. The sender does not receive their own message notification.

With the page visible, a lightweight feed checks every five seconds. Initial
history, deleted messages and old background messages do not chime. Sound claims
use Web Locks and a bounded per-account local-storage history to prevent duplicate
bells across tabs; older browsers use only the focused tab. A visible new-message
link is also shown. Browser audio may need another tap after a reload/suspension.

Chat push is sent after saving the message and in-app notifications. Push failure
does not undo or fail chat. Push payloads contain no message text or sender name;
tapping opens team chat after normal authentication. Expired subscriptions are
removed. The service worker always shows a notification; when the page is visible,
chat system sounds are silent so the page provides the custom bell. Background
sound is controlled by the phone/browser, including silent mode and Focus.

## Deployment

The migration adds `User.chatSoundMode` with ADMIN as default. Run normal database
migrations at deployment. Background delivery also needs these existing server
environment settings:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY` (server only; never commit)
- `VAPID_SUBJECT` (a `mailto:` contact or HTTPS URL)

If push is already configured, keep the existing key pair. Otherwise generate a
pair on a trusted machine using `npx web-push generate-vapid-keys` and save it in
the hosting provider's environment settings. Restart/redeploy, then employees tap
Enable notifications & sound. On iPhone, add the site to the Home Screen and open
it there for background push. No custom sound can override device silent mode.

The local project did not contain configured VAPID settings during implementation.
Production delivery must be verified on a subscribed physical device after setup;
automated tests mock delivery and never send notifications to real employees.

## Checks

Run `npm test`, `npm run build`, and `node scripts/test-chat-alerts.mjs`. Unit tests
cover sound eligibility, cross-tab deduplication, worker visibility/routing and
mocked push sound preferences/expiry cleanup. The integration test creates a
disposable database and verifies feed cursors, read-status races, deletion,
permissions and muted/sender recipient exclusions.
