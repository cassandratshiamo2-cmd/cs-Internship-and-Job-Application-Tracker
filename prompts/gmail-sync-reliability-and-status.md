# Gmail Sync Reliability and Email Status Updates

## Goal

Fix the existing ApplyFlow Gmail integration in place. Make manual and automatic sync coordination reliable across backend processes sharing PostgreSQL, return accurate sync outcomes to the Gmail page, and preserve correct email-based application status, interview details, notifications, and manual review behavior.

Do not rebuild the application, remove concurrency protection, reset or delete database data, expose secrets, or change unrelated authentication, application CRUD, interview, notification, OAuth, or deployment behavior.

## Findings from Repository Inspection

- `server/server.js` starts `startGmailSyncWorker` after database initialization.
- `startGmailSyncWorker` invokes its first full poll immediately, then polls on `GMAIL_SYNC_INTERVAL_MS` (120 seconds by default, clamped to at least 30 seconds). It also uses an in-memory `isRunning` flag, which only coordinates one process.
- The OAuth callback separately starts an initial sync without awaiting it, so a user can reach the Gmail page and request a manual sync while that initial sync is still running.
- `server/gmail-sync.js` uses a PostgreSQL session advisory lock per Gmail connection. It retains the lock-owning client during sync and releases/unlocks in `finally`; failed unlocks or uncertain acquisition cause the client to be discarded. The lock correctly prevents duplicate processing and is not a stale in-memory-only status.
- `syncUser` reports lock contention as `inProgress`. `/api/gmail/sync` currently returns that as HTTP 200, and the frontend displays a retryable notice, clears its spinner in `finally`, and refreshes Gmail data. The UI’s current wording is a presentation of real lock contention, not proof of stale state.
- The database advisory lock is already cross-process when instances share the same PostgreSQL database. No tracked Render/worker deployment manifest was found, and production process/database/API URL configuration cannot be inspected from this repository.
- Existing server tests cover advisory-lock contention, unlock failure, acquisition failure, failed-sync recovery, quota handling, message deduplication, matching, status updates, interview detail extraction, notifications, and stale email protection. Add focused coverage for worker scheduling/cross-instance coordination and manual-sync response behavior rather than duplicating existing tests.

## Implementation Scope

1. **Automatic worker coordination**
   - Stop launching a Gmail-wide worker sweep immediately on every backend start; begin after the configured polling interval.
   - Preserve the configurable interval and sensible minimum, and validate invalid interval values safely.
   - Add PostgreSQL-backed coordination for worker sweeps so multiple backend instances sharing a database do not run duplicate sweeps. Keep the per-connection advisory lock as the final guard shared by worker and manual sync.
   - Ensure a skipped worker sweep does not block a later poll, overlapping local runs remain prevented, database clients are always released/discarded correctly, and worker failures are logged safely without crashing the server.
   - Keep OAuth’s initial sync behavior unless evidence shows it is unsafe; it must use the same per-connection lock and must not create duplicate processing.

2. **Manual sync contract and frontend**
   - Keep `/api/gmail/sync` wired to the authenticated, user-scoped sync operation. Return a clear, retryable response when another operation truly holds the connection lock; do not claim completion or hide contention.
   - Report completion only after that invocation’s work completes, with the actual number of messages examined and outcome counts. Preserve quota retry metadata and safe authorization/error messages.
   - On the Gmail page, prevent duplicate clicks while a request is active, show the actual server response for completed/in-progress/failed work, always clear loading state, and refresh status, history, and review data only as appropriate. Do not swallow the sync failure as success.
   - Preserve the existing backend API base URL contract (`NEXT_PUBLIC_API_URL`) and ensure Gmail API calls continue to send the application bearer token.

3. **Email processing and status updates**
   - Preserve the existing deterministic classification and high-confidence matching rules unless a test demonstrates a specific defect.
   - Preserve message-level idempotency, review queuing for ambiguous/unmatched messages, user-scoped database writes, and status-change notifications.
   - Keep the existing received-time versus application `updated_at` protection so an old email cannot overwrite a newer application edit. Test this behavior explicitly and make no broader transition-policy change without evidence.
   - Verify and preserve supported status outcomes, interview date/time/type extraction and persistence, and reminder scheduling behavior.
   - Ensure errors and expired authorization are persisted/reported safely without logging OAuth tokens or message bodies.

4. **Documentation/deployment**
   - Update the existing root README with the actual interval behavior and worker coordination mechanism.
   - Since no deployment manifest is tracked, document the exact Render backend settings needed only if a configuration change is introduced. Do not change Neon data or blindly add secrets/environment values. Preserve Vercel’s `NEXT_PUBLIC_API_URL` guidance and Google Cloud’s exact OAuth callback requirements.

## Tests

Extend current tests, preferably in the existing Gmail test files, to cover:

- Manual sync completion, true lock contention, safe failure/expired authorization, and route response status/body.
- Worker first-run timing (no startup burst), configured interval behavior, failure recovery, and no overlapping local ticks.
- Database-backed coordination preventing multiple worker instances sharing a database from running simultaneous sweeps.
- Manual and worker sync targeting one connection safely under the existing advisory lock.
- Success/failure lock cleanup and all existing lock recovery behavior.
- Duplicate message processing, correct unique matching/status update, ambiguous manual review, interview fields/reminder behavior, notification creation, and stale-email protection.

Use fakes/stubs for worker timing and PostgreSQL/Gmail interactions. Do not claim a live Gmail/Neon/Render/Vercel end-to-end test unless those services are actually configured and exercised.

## Validation

Run:

- `npm --prefix server test`
- `npm --prefix client/my-app run lint`
- `npm --prefix client/my-app run build`
- `git diff --check`

Report the actual results, exact changed files, root cause confirmed from code, local run commands, and any production setup still required. Preserve existing worktree changes and do not deploy.
