# Gmail Sync Stuck Lifecycle Recovery

## Goal

Fix the existing Gmail sync lifecycle so a stalled upstream request cannot hold the PostgreSQL advisory lock indefinitely, every failure path releases/destroys the lock-owning connection, and the Gmail page does not leave an obsolete "already in progress" result displayed as current. Preserve the existing OAuth, message processing, status transitions, matcher/parser behavior, idempotency, quota cooldown, and single advisory-lock design. Do not rebuild the integration or add a competing lock/lease table.

## Local Findings

- `server/gmail-sync.js` acquires a session-level PostgreSQL advisory lock and correctly places release in `finally`. Ordinary thrown errors are persisted as sync error state, then rethrown; quota failures persist cooldown state and return a response.
- Gmail API methods and OAuth access-token refresh are awaited without an explicit request timeout. If one of these promises never settles, `finally` cannot run and the session advisory lock remains held for the life of the database connection. PostgreSQL releases the session lock when that session is destroyed, but the current lifecycle does not bound a stalled request.
- Unlock exceptions discard the pool client using `client.release(error)`, but a resolved `pg_advisory_unlock` result of `false` is not checked.
- The Gmail page renders the manual sync response in a notice and does not refresh/poll for completion. The "already in progress" notice therefore remains visible until another user action even if the original sync later completes.
- The local backend baseline passes 76 tests. Existing tests cover a normal failed-sync retry, thrown unlock failure, and Shoprite rejection with a shorter subject/body, but not a never-settling request, stale lock recovery, or the exact reported email.
- Production logs, running database sessions, deployment configuration, and deployed frontend/backend API URLs are unavailable in this workspace. Do not claim to have verified which production process/session currently owns the lock or whether the deployments share the same environment.

## Implementation Scope

1. Add a bounded timeout to the existing Gmail and OAuth network operations without racing an un-aborted operation. Ensure timeout/abort rejects the owning sync so its existing `finally` executes. Keep the current advisory lock as the only synchronization mechanism; do not introduce another lock system or simply remove locking.
2. Harden cleanup: check the boolean result of `pg_advisory_unlock`; if release cannot be confirmed, destroy the lock-owning pool client so PostgreSQL drops the session lock. Preserve the original sync failure when cleanup also fails, while logging safe diagnostics.
3. Make failure-state persistence best-effort but ensure persistence failure cannot bypass lock cleanup. Ensure every path after successful acquisition releases or destroys the lock client.
4. Update Gmail client sync feedback minimally so an `inProgress` response is represented as active/retryable rather than a terminal completion message, and subsequent refresh/retry can observe updated status/history. Do not add broad UI polling or unrelated UI redesign.
5. Preserve history cursor semantics and per-message isolation. A timed-out API request must not advance the cursor or mark unprocessed messages complete.
6. Add focused tests proving:
   - a stalled/timed-out Gmail request fails within the configured bound and releases/destroys its acquired lock;
   - a failed sync can be followed by a successful sync;
   - the lock is released after every covered failure path, including false unlock confirmation and OAuth/API failures;
   - a stale held lock is recoverable through the existing session-lock cleanup behavior, without a competing lock system;
   - subject `Shoprite Application Outcome – Cashier Position` and body stating the user attended the interview, was unsuccessful, and Shoprite selected another candidate uniquely match `Shoprite - Cashier`, transition `Interview` to `Rejected`, and appear as processed email history.
7. Update or extend existing tests where suitable; avoid excessive new files and unrelated feature changes.

## Verification

Run exactly:

- `npm --prefix server test`
- `npm --prefix client/my-app run build`

Also run `git diff --check` and report every changed file. If deployment/runtime evidence remains unavailable, clearly distinguish the code-level root cause and verified recovery behavior from unverified production state. Do not deploy or modify unrelated ApplyFlow features.
