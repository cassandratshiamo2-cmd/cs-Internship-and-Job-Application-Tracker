# ApplyFlow Live Gmail Sync and Nova Assessment Retry

## Goal

Fix the confirmed Gmail sync lifecycle and already-processed Nova assessment email failures in the existing ApplyFlow project. Preserve database records, Gmail OAuth data, unrelated local changes, existing classification/matching safeguards, and do not deploy or mutate production data.

## Findings confirmed from current code

- The `gmail_sync_leases` row is acquired atomically with a unique owner UUID and has a three-minute expiry. Release is conditional on the same owner token. Worker sweeps and per-connection syncs have separate leases; the worker and manual path still contend on the same per-connection lease. The in-memory worker guard only supplements the shared database lease.
- A crashed process should leave a lease that expires, not a permanent lock. However, the renewal timer runs for the full duration of the sync promise. If a non-Gmail operation or database operation stalls indefinitely, renewals can preserve the lease indefinitely. The code observes a renewal failure only after the whole sync operation returns, so it can continue work after ownership may have been lost.
- The manual endpoint returns “already running” immediately when another sync owns the connection lease. It does not join or wait for the active background operation. Scheduled worker contention can therefore be surfaced to the user as a retryable manual-sync result. Live database/deployment state is not observable from this workspace, so whether a particular production request currently coincides with worker activity must not be asserted without production evidence.
- `fetchMessage` extracts `parsed.text` from Gmail's raw MIME message. `classifyApplicationEmail` then applies deterministic status regexes. Its Assessment rules do not match “invited for an assessment” or the supplied typo “invited for an assesment”; therefore classification returns no status before application candidates are fetched/matched.
- `recordMessage` stores such a message as `ignored`, with null detected status and the default reason “No supported application status rule matched.” Existing message IDs are preserved by the unique key. The current automatic retry only selects that exact ignored reason, the newest 25 rows received in the last 30 days, and a limited reprocess version. The Gmail history API will not necessarily return old messages again, and the UI exposes no authenticated per-message retry action.
- The current application stale-email decision checks message received time against `applications.updated_at`; keep and test this safeguard during any reprocessing.

## Implementation plan

1. **Lease ownership and bounded lifecycle**
   - Keep shared database-backed leases, unique owner tokens, compare-and-release, expiry recovery, separate worker/account lock keys, and cross-instance exclusion.
   - Make the lease owner explicitly checked during long message processing, and stop processing as soon as renewal fails or lease ownership is lost. Do not allow an old owner to continue processing after another instance can acquire the expired lease.
   - Bound potentially stalled database/lease operations using repository-appropriate PostgreSQL/`pg` timeout configuration or another safely scoped mechanism; preserve Gmail request timeouts and safe error reporting.
   - Keep the manual response truthful and retryable if active work cannot safely be joined. Where safe and bounded, let the manual request await the currently-running per-account operation rather than starting duplicate work or immediately reporting contention.
   - Test normal release, failed release, expired/crashed owner recovery, renewal failure, long-running work, worker/manual overlap, and cross-instance behavior.

2. **Assessment classification and Nova matching**
   - Add narrow Assessment patterns for an invitation to complete/take/do an assessment, including both “assessment” and “assesment” spellings and equivalent “invited for an assessment” phrasing.
   - Do not classify the bare term “assessment” as an application outcome without invitation/action context; do not convert newsletters or job alerts to outcomes.
   - Test the supplied message verbatim: subject `Nova application`, sender `Tshiamo Malefo <tshiamomalefo0@gmail.com>`, body `Dear Cassandra / You are invited for an assesment / Kind regard / Nova recruitment team`; expect Assessment and a unique Nova match when that application's record is the sole relevant candidate.
   - Test ambiguous Nova/company candidates go to review, and preserve existing transition/staleness checks.

3. **Authenticated message retry**
   - Add a user-authenticated operation for retrying an eligible stored message by processed-message ID. Ensure ownership is enforced through the stored Gmail connection/message user ID.
   - Retry only eligible ignored/unclassified and retryable review rows. Never retry updated, reviewed, or dismissed outcomes through this action.
   - Fetch by the existing Gmail message ID, update the existing database row in place, and do not duplicate history rows.
   - On still-unclassified or ambiguous results, preserve a useful review reason and leave the application unchanged. On confident matches, use existing stale-status and transition logic; create status notifications only for an actual status change, with idempotency keyed to the Gmail message ID.
   - Expose a retry control in the Gmail history/review UI only for eligible records; show safe success/failure feedback and refresh relevant data. Avoid adding new dependencies or secrets.
   - Test authenticated ownership, expired/missing Gmail authorization, retry of the Nova-like previously ignored row, duplicate retry, updated/reviewed/dismissed denial, ambiguous results, and stale application protection.

## Validation

Run the backend test suite, frontend lint, frontend production build, JavaScript syntax checks as needed, and `git diff --check`. State actual results. These tests use mocked Gmail/PostgreSQL behavior; do not claim that production Gmail or its database has been verified.

## Out of scope

- No production deployment or live database writes.
- No database reset, Gmail-history deletion, OAuth reconnection, or full inbox rescan.
- No removal of concurrency controls or loosening of application matching/stale-message safeguards.
- No unrelated refactors.
