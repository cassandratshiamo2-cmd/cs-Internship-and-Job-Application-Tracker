# ApplyFlow Gmail Synchronization and Notification Reliability

## Goal

Repair confirmed shared reliability gaps in the existing ApplyFlow Gmail and notification flow without replacing the current architecture, changing production data, or deploying. Preserve the current branch, OAuth integration, token encryption, PostgreSQL lease model, user ownership checks, status-transition safeguards, review flow, and working classification/parser behavior.

## Repository state and verification boundary

- Work on the current branch `fix/gmail-message-not-found-retry`; preserve the existing commit and keep changes uncommitted.
- The worktree was clean before this prompt was created.
- The Render service URL/configuration is unavailable in this workspace. Perform a local/source-only audit; do not claim live Render behavior was verified and do not change service settings or introduce paid infrastructure.
- Do not inspect or print `.env` values, use production credentials, contact real Gmail accounts, or modify production records.
- The project’s older Sprint 1–4 guidance is explicitly expanded by this request to include the existing backend and integrations. Keep the Next.js client / Express server split.

## Audit findings

### Existing protections to preserve

- `server/server.js` awaits `ensureDatabase()` before listening, and starts the notification and Gmail workers only after the listener starts.
- Gmail worker and per-connection synchronization use expiring PostgreSQL leases with owner tokens; message IDs are uniquely recorded.
- Plain-text/HTML MIME parsing, relevance filtering, status classification, matching, stale-status decisions, application updates, processed history, interview reminders, and status-change notifications already share tested implementations.
- Automatic Gmail updates, manual review apply, and application status edits use authenticated ownership scoping. Application/status-history/notification writes are transactional, and status-change notification rows have a database uniqueness key.
- Notification reads are authenticated and owner scoped. The client currently refreshes notification state on route changes, focus, visibility changes, and a 30-second interval.

### Confirmed gaps to repair

1. **Sender-only application match can update automatically.** `scoreApplicationMatch` can award 0.75 from sender-domain evidence alone, above the default 0.72 confidence threshold. `matchApplication` can then return `matched` even though the message contains no company or position evidence. Require independent message-content evidence before an automatic match; retain review candidate IDs and confidence information when evidence is insufficient. Do not weaken confident company/position matches.
2. **Scheduled Gmail sync is slower than requested and waits a full interval after startup.** The default `GMAIL_SYNC_INTERVAL_MS` is 120 seconds and `startGmailSyncWorker` only schedules the first sweep. Set the default to about 60 seconds and start a bounded initial sweep once the worker is started after database/server readiness. Preserve configured interval bounds, in-process overlap prevention, database leases, and per-account isolation.
3. **Transient Gmail failures only retry on a later polling cycle.** Existing exponential retries are limited to quota errors. Add a small, bounded retry policy for clearly transient network/timeout and retryable server failures, respecting `Retry-After` and existing quota cooldown behavior. Never retry authentication, invalid input, unrelated 404, or unrecoverable errors as transient.
4. **Sync history conflates attempt and success timestamps.** `last_sync_at` is written on both failures and successes, and there is no persisted last-success timestamp. Add nullable additive attempt/success timestamp columns, update them consistently for manual and worker sync (including quota and failure paths), expose them through `/api/gmail/status`, and display both in the Gmail page. Keep the existing `last_sync_at` compatibility field and do not erase success history on a failure.
5. **Notification refresh failures clear valid last-known data.** `getUserNotifications` returns an empty list on network/API errors and `refreshUserNotifications` overwrites the external store with that empty list. Retain the same-user last-known notifications on transient errors while displaying the error; clear data on logout/token change and handle unauthorized responses without exposing a previous user’s notifications. Disable HTTP caching for notification polling.
6. **New notifications have no accessible in-app toast/banner.** Add a concise accessible announcement/link when a genuinely new notification arrives after the initial notification snapshot. Avoid a toast for pre-existing notifications, read-state changes, errors, or repeated polling of the same notification. Keep the existing 30-second/focus/visibility refresh behavior and unread badge.
7. **Keep 404 categories distinct.** Preserve the existing special handling for a fetched message whose Gmail API error reason is `notFound`; it must mark only that message unavailable and let unrelated messages proceed. History-list 404 recovery should be restricted to evidence of an expired history cursor rather than treating every arbitrary 404 as cursor expiry. Keep current cursor recovery for confirmed expiry and add a non-expiry 404 regression.

## Implementation constraints

- Reuse the current shared processing service; do not add company-specific rules or separate manual/automatic business logic.
- Do not change Gmail OAuth scopes, Google credentials/configuration, encryption, leases, schema ownership, or deployment settings.
- Add schema fields only through safe additive/idempotent initialization in `ensureDatabase`; do not reset data or write a destructive migration. Update directly related README documentation for cadence, timestamps, and the additive schema change.
- Ensure a single failing message/account does not prevent other eligible messages/accounts from being processed.
- Preserve transaction boundaries, duplicate prevention, user scoping, review semantics, stale email handling, and status-transition rules.
- Do not log email bodies, tokens, credentials, or secrets.
- Keep changes focused on confirmed gaps. Do not perform unrelated application/auth/UI redesigns.

## Regression coverage

Add/extend deterministic tests for:

- sender-domain-only evidence staying in manual review; exact confident company/position matches still updating only the correct application;
- one startup worker sweep, approximately 60-second default cadence, custom interval behavior, and overlapping tick suppression;
- transient network/5xx retry success and exhaustion, delay bounds/`Retry-After`, and no retry for non-transient errors;
- attempt/success timestamps and preserved last-success time for failures/quota cooldowns;
- transient notification API errors preserving current data, token changes clearing prior-user data, new notification toast deduplication, and read-state changes not generating a toast;
- unavailable Gmail message handling remaining separate from expired history-cursor recovery and unrelated 404 failures;
- existing duplicate, stale-message, ownership, status-transition, reminder, review, and notification idempotency regressions.

## Validation and delivery

- Run focused Gmail matcher/sync/routes and notification tests.
- Run the full backend test suite: `npm --prefix server test`.
- Run frontend lint and production build: `npm --prefix client/my-app run lint` and `npm --prefix client/my-app run build`.
- Run `git diff --check` and review all changed files for unrelated changes or secrets.
- Report exact commands/results, changed files, additive database behavior, local test steps, and limitations. Clearly state that Render sleep/wake and live deployment configuration were not verified; an in-process timer cannot run while its service is asleep. Do not claim deployment/runtime checks that were not performed.
- Do not commit, push, merge, or deploy.
