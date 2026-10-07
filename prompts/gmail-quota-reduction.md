# Gmail API Quota Reduction and Safe Sync

Implement the Gmail quota fix in ApplyFlow's existing Node.js/Express backend and
Next.js Gmail integration. The user explicitly authorized this backend work despite
the earlier frontend-only phase boundary.

## Diagnosis

The current Gmail sync service already has a bounded initial search (`newer_than:30d
-in:sent` by default), persistent initial-page progress, Gmail history-based incremental
sync, and a unique `(connection_id, gmail_message_id)` constraint. The quota issue is
not caused by a full-mailbox scan on every poll.

The repeated high-cost calls come from the rest of the flow:

- Every `syncConnection` calls `users.getProfile`, including ordinary history syncs
  where a stored history cursor already exists.
- Before checking new messages, each sync calls `reprocessPendingReviews`, which
  selects up to 50 already-recorded review messages and runs `messages.get(format:
  raw)` for each. Those messages remain in `review`, so this happens on every
  scheduled, manual, and OAuth-triggered sync.
- `recordMessage` checks the database uniqueness constraint only after `fetchMessage`
  has fetched and parsed the complete message. Replayed history entries, interrupted
  initial-sync pages, and concurrent syncs can therefore spend Gmail quota before
  discovering a duplicate.
- Sync starts from the OAuth callback, the manual `/sync` endpoint, and the scheduled
  worker. The worker's `isRunning` flag only serializes that worker in one process;
  it does not coordinate these other entry points, other worker instances, or
  multiple Render instances.
- There is no retry/backoff or persistent quota cooldown. On a Gmail quota error,
  the worker tries again at its normal interval and a manual request can immediately
  repeat the failing calls.

## Implementation requirements

1. In `server/gmail-sync.js`, retain the existing initial filtered/paginated scan,
   Gmail history cursor behavior, message classification/matching, application
   status transitions, audit rows, and review queue. Stop fetching review-queue
   messages during routine syncs: their saved metadata supports the existing review
   UI and review decision flow, and they must not be re-downloaded on every poll.
2. Check whether each Gmail message ID is already stored for the connection before
   calling `messages.get`. Continue to rely on the database uniqueness constraint as
   the final integrity guard. Keep initial sync bounded and continue using Gmail
   history for subsequent syncs.
3. Avoid `users.getProfile` during ordinary incremental-history sync. Fetch the
   profile only when an initial sync needs a starting history cursor, including
   recovery after an expired Gmail history cursor.
4. Serialize syncs per Gmail connection across worker, OAuth callback, manual requests,
   and Render processes using a PostgreSQL advisory lock (or an equally robust
   database-backed mechanism). Release locks on every success/error path. Return a
   clear non-error “already in progress” result to a duplicate manual invocation;
   do not issue Gmail API calls from the duplicate.
5. Add bounded exponential backoff with jitter for transient 429 and Gmail quota
   errors (including quota-related 403 responses); honor a valid `Retry-After` value.
   Avoid retrying unrelated authorization/permission failures. After the bounded
   retries, persist a per-connection cooldown and consecutive quota-failure count so
   scheduled syncs and immediate manual requests do not continuously retry. Reset
   the count/cooldown after a successful sync. Expose a safe, user-readable quota
   message and retry timing without returning raw Google error payloads.
6. Add only the schema fields needed for durable cooldown state to the existing
   startup schema initialization using its existing `ADD COLUMN IF NOT EXISTS`
   pattern. Do not change OAuth client configuration, encryption keys, or token
   encryption. Never log or return OAuth credentials, tokens, message bodies, or
   encryption keys.
7. Preserve the current response/review flow and avoid unrelated changes. Update the
   Gmail page/API helper only as needed to display the safe in-progress or quota
   retry response.

## Tests and validation

- Add focused `node:test` coverage for pre-fetch duplicate suppression, per-connection
  exclusion, history sync avoiding unnecessary profile calls, quota retry/backoff and
  cooldown behavior, and the existing manual-sync response semantics.
- Keep existing OAuth, parser, matcher, route-review, and interview behavior intact.
- Run the server tests (`npm --prefix server test`), verify server startup syntax via
  existing scripts/configuration, and run the client checks available in
  `client/my-app/package.json` if client files change.
- Do not print or inspect `.env` values. Do not modify OAuth credentials or
  `GMAIL_TOKEN_ENCRYPTION_KEY`.
