# UFree account test backend

This backend and the connected frontend are for **hui3412/Ufree only**. The frontend remains at https://hui3412.github.io/Ufree/. The API is https://youfreetest.huien3412.workers.dev. Do not deploy this configuration to spacedivee, youfree.ca, or a production Cloudflare account.

## Apply and deploy in the test Cloudflare account

From the repository root after `npm ci`, using an authenticated Cloudflare CLI:

```sh
npx wrangler d1 migrations apply ufree-test-db --remote
npx wrangler deploy
```

The migration creates account tables alongside existing D1 infrastructure. It does not access, migrate, delete, or rename the browser's existing Local database. Confirm the Wrangler account and `DB` binding match `dff58bbe-1cc3-4850-8a58-4532fc9aed4b` before running. No browser/API token should be committed. Wrangler will use its normal authenticated deployment credentials. There are no application secrets to distribute to the browser.

The supplied Git integration deploy command `npx wrangler deploy` bundles the backend but **does not apply D1 migrations**. Run the migration once manually before testing account flows. Keep preview builds off. The same `DB` binding is declared in Wrangler. Cloudflare deployment logs and dashboard settings require access to the test Cloudflare account; repository checks cannot establish those settings.

`GET /health` should return `features: accounts-test-v1` after migration and deployment. Before migration it reports `migration-required`. The pre-implementation live health check returned status ok, database connected, and features not-installed. Do not treat a healthy database as proof authentication routes deployed.

## CPU and monetary considerations

Password hashing uses the OWASP scrypt profile N=32768, r=8, p=3 with random salts. This is deliberately costly. Verify the test Worker's CPU allowance before enabling signup. The ordinary free Worker CPU allowance may be insufficient; a paid Workers plan and a sufficient per-request CPU limit can be necessary. Do not reduce password hashing strength to fit a plan. No paid plan or billing settings were changed by this commit. Charges are for Worker requests/CPU and D1 storage/operations, not a per-account licence. This repository does not promise a zero-cost deployment.

## Persistence and synchronization

- Guest Local collections use the **unchanged** IndexedDB `whos-free-local` / `app` / `schedules` and localStorage fallback `whos-free-local-schedules`.
- Account records, base revisions, pending edits and conflicts live separately under `ufree-test-account-v1:<user id>` in localStorage. Collection preferences have a separate per-account prefix. Browser quota failures are surfaced; they never clear Local storage. Account copies currently have the browser's localStorage quota and a 10 MB server test quota. Cloud snapshot payloads are limited to 2 MB, 2,000 schedules and 500 classes per schedule. Very large stress datasets should continue using Local view.
- Signup explicitly copies the current Local schedules and collection preferences, requires a selected personal schedule and school, and queues the initial cloud upload. It never moves/removes Local data.
- Login on a new context downloads Account data once. Returning contexts render their own local copy immediately. Safari and Home Screen contexts each sign in and maintain their own local copy.
- Account changes save locally before network access. Server revisions and per-name tombstones reconcile concurrent changes. Conflicting edits are separate schedules. In delete/edit conflicts the original stays deleted and the concurrent edit becomes a conflict copy. Names act as record keys with a `p:` namespace separate from account metadata; even a schedule named `@preferences` remains a schedule. Renames are deletion plus addition.
- Opening/foregrounding checks at most once per minute; manual refresh and reconnect can check immediately. Continuous foreground use adds at most one activity-triggered check per hour so an already signed-in person remains active. No cloud request runs on every UI click. An unchanged revision with no pending edits transfers no schedules. Each check is still a request.
- A write sends at most 50 changed records in one optimistic revision batch, retries version conflicts three times, and keeps remaining edits queued after errors. A lost acknowledgement is reconciled on the next check. There is no claim that two offline contexts are immediately identical.
- Sessions are opaque random 256-bit bearer tokens; only token hashes are stored in D1. Browser session credentials stay in that context's localStorage. Requests omit cookies, which avoids assuming Safari supports third-party cookies between GitHub Pages and workers.dev. CORS allows exactly `https://hui3412.github.io`; authorization is independently checked on every private endpoint. Sessions expire after 30 days. Re-signing in restores access to retained pending account edits.
- Sign-out retains both Local and Account cached data. When the API is reachable it invalidates the current session; when offline, sign-out clears this context's session credentials, but the server token may remain valid until expiry. Password changes can revoke other sessions. Shared/device access to cached data must be considered during a later product review; local cached copies are not encrypted.

## Sharing and abuse controls

Cloud snapshots use random 256-bit identifiers, expire exactly 48 hours after the server creates them, and have no early revoke endpoint. Anyone with a valid code/link can retrieve the fixed snapshot without authentication. Imports preserve independent copies after expiry. The account prompt for guests is dismissible and does not prevent receiving. Username lookup returns only the matched username. Sending requires selected schedules, recipient verification and a final details confirmation. Inbox items are never automatically inserted into a collection. Accept imports a copy; Decline does not. Blocking declines pending incoming deliveries and prevents further deliveries in either direction. Limits: 5 signup attempts/IP/hour, 30 snapshots/account/day, 20 deliveries/sender/day, 100 incoming deliveries/recipient/day, 60 lookups/account/hour and 120 public snapshot requests/IP/hour. There is no followers/contacts model.

## Launch blockers

1. **Inactivity deletion is intentionally disabled.** The requirement says warning method and grace period must be decided before launch. No such decision or Google Doc URL was supplied. Authenticated requests update `last_active`, including activity in an existing session, with writes coalesced to once/hour. The daily cron cleans expired sessions, shares and old request counters only. It never deletes accounts. Implement and test the agreed warning/grace policy before enabling a 12-month account purge.
2. Real Cloudflare deployment/migration, CPU budget and log verification need authenticated test-account access. Local schema application, backend tests and bundling do not establish live readiness.
3. Real iOS Safari/Home Screen tests are still required. Automated DOM and cookie-independent request tests do not establish iOS behavior.
4. The requested Google Doc was not linked. Check its current contents before launch.

No password recovery or username changes exist. Cloud data is not end-to-end encrypted; do not claim that only the user can read server data. Account deletion, when implemented, must not remove recipients' imported copies or prematurely revoke their existing 48-hour snapshot links.

## Validation

`npm test` includes regression coverage, Local data preservation, separate Account writes/removal, guest cloud receive, conflict/deletion reconciliation, offline/restart, unchanged revision checks, simultaneous edits, private API access, password rotation/session revocation, login delay, 48-hour snapshots, explicit inbox acceptance and blocking. Backend tests run real SQLite through a D1-compatible adapter, not the deployed D1 database. `npx wrangler d1 migrations apply DB --local` and `npx wrangler deploy --dry-run` validate the local schema and bundle. The development server could not start in the current environment because network interface enumeration fails; no live-runtime claim is made.

To roll back the feature, revert the feature commit on hui3412/Ufree and redeploy the test Worker. Keep account database tables and browser account keys for recovery. Do not drop tables or remove the original Local keys. A source rollback does not roll back database state.
