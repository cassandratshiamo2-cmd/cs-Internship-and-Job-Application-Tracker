# Permanent Gmail Sync and Interview Email Reliability

## Objective

Fix the underlying causes of incorrectly attributed Gmail status notifications and
make interview-email processing reliable across future Gmail connections, varied
email formats, process restarts, and hosting downtime. Preserve the existing ApplyFlow
authentication, application management, interview reminders, notification UX, and
Gmail OAuth testing configuration.

Do not modify user data manually, delete application records, manually change
application statuses, commit, merge, or deploy without explicit user approval.

## Findings from current implementation

1. A definitive historical cause for the Nova notification cannot be established by
   source inspection alone. The prior database diagnostic failed with PostgreSQL
   `28P01`, so the notification, application, processed-message, and Gmail connection
   owners have not been inspected together.
2. Gmail is currently represented by one `gmail_connections` row per ApplyFlow user
   (`UNIQUE (user_id)`). OAuth callback upserts by ApplyFlow `user_id`, replacing the
   stored Gmail address and resetting its history cursor. Gmail messages are matched
   against all applications owned by that ApplyFlow user. Thus another Gmail mailbox
   linked to the same ApplyFlow account is treated as an authorized source for all of
   that user's applications; that is different from a cross-ApplyFlow-user leak.
3. The Gmail matcher and status classifier use heuristics/regular expressions. The
   existing regression fixture intentionally treats an email saying “You are invited
   for an assesment” as a Nova assessment and expects a status update. This confirms
   the matching path can produce a Nova update, but does not prove which historical
   mailbox or owner caused the production notification.
4. Interview-email parsing extracts status, date, time, and type, but not a location.
   `applications.interview_location` is already persisted and exposed by the API/UI;
   Gmail updates do not populate it. The parser relies on text-based rules and can
   return ambiguous/missing details without a provider-independent review record.
5. The Gmail worker is an in-process interval started after the HTTP server listens.
   It waits a full interval before the first poll and runs only while that process is
   alive. Database cursors, unique `(connection_id, gmail_message_id)` rows,
   per-message transactions, and expiring owner-token leases provide good restart
   and duplicate protection once the service runs again, but a sleeping or stopped
   host cannot poll. The initial backfill is limited to a recent-message window;
   Gmail history expiration triggers a recent-window rescan, which cannot promise
   recovery of arbitrarily old messages.
6. Sync failures are logged and a single sanitized `last_sync_error` is stored.
   Quota backoff is persisted, but general failures do not have durable retry
   scheduling, consecutive-failure state, or an operational threshold/alert. The
   worker catches per-connection failures and proceeds, so health endpoints do not
   currently expose worker lag or repeated mailbox failures.

## Proposed architecture

- Keep the current Gmail read-only OAuth flow and existing secret values unchanged.
  Continue enforcing authenticated ApplyFlow owner checks at every connection,
  candidate-application, processed-message, retry, notification, and write boundary.
- Make source attribution explicit. Preserve one Gmail connection per ApplyFlow user
  unless product requirements explicitly approve multi-account support; on account
  replacement, retain immutable connection/message attribution or establish a safe
  connection generation so old processed messages cannot be mistaken for the newly
  linked Gmail mailbox. Store provider account identity and verify it on every worker
  operation. Do not silently associate a message with another ApplyFlow user.
- Keep automatic status updates conservative: require a confident, unique application
  match and clear transactional email evidence; uncertain company/role/status matches
  must go to review, not update applications or create status notifications. Continue
  guarding status transitions against stale email dates and concurrent manual edits.
- Extend interview extraction with optional location parsing only for explicit,
  interview-associated address labels/context. Preserve an existing user-entered
  address if a message contains none or is ambiguous. Persist confirmed parsed values
  through the existing authenticated application row and return them through the
  existing API; never fabricate an address.
- Use a separately runnable, always-on background worker process for Gmail polling,
  sharing PostgreSQL with the API and coordinating through the existing database
  lease mechanism. Run an immediate startup sweep, then a configurable interval.
  Retain lease ownership tokens, renewal, bounded API timeouts/retries, and message
  uniqueness. A transient failure must leave the durable Gmail cursor unadvanced
  until all enumerated messages are safely persisted, so the next sweep can replay
  without duplicate status changes or notifications.
- Add additive, idempotent PostgreSQL schema updates for durable attempt/failure
  state and retry eligibility (and only any parsing/provenance fields demonstrated
  necessary by the inspected code). Use bounded exponential backoff with jitter for
  recoverable failures, distinguish permanent OAuth/permission errors from transient
  failures, and expose safe retry status to operators. Never log tokens, raw email
  bodies, or sensitive contents.
- Provide structured operational events/metrics for sync start/end, duration,
  message outcome counts, lag/cursor age, lease contention/loss, and repeated
  failures. Logs must identify a connection using a non-secret internal ID and
  sanitized error category only. Add a health/readiness signal that distinguishes API
  database health from background-worker freshness/failure without exposing mailbox
  contents or OAuth credentials.
- Document deployment honestly. A continuously polling worker requires a Render
  Background Worker (or equivalent always-on worker) on a plan that does not sleep,
  with the same PostgreSQL URL and the minimum required Gmail encryption/OAuth
  environment configuration. If the current Render plan sleeps or stops workers,
  synchronization is best-effort and resumes only when service execution resumes;
  do not claim guaranteed continuous operation. Do not alter OAuth client, scopes,
  redirect URI, or Google test-user settings.

## Scope boundaries

- This work remains Gmail-provider-only. Do not add Microsoft/Outlook OAuth or change
  Gmail scopes/settings unless the user separately approves that provider expansion.
- Do not manually inspect, delete, or rewrite the Nova notification/application data
  while implementing. A later read-only audit requires working, authorized database
  access and separate confirmation of any data repair.
- Do not introduce status corrections from seed fixtures or migration scripts.
- Do not replace current UI/API contracts unnecessarily; extend them compatibly.

## Required implementation and regression coverage

Inspect and modify only the implementation surfaces shown necessary by the codebase.
Add tests covering:

- Gmail account replacement/reconnection and durable source attribution.
- Cross-ApplyFlow-user isolation for candidate matching, message retries, notifications,
  and location writes.
- A confirmed strong match, a false/ambiguous company or role match, unrelated
  transactional language, malformed/unsupported MIME, and duplicate/replayed messages.
- Interview emails with explicit and absent/ambiguous date, time, type, and location;
  SAST conversion; manual location retention; and no invented address.
- Worker startup immediate run, normal polling, overlap prevention, lease contention,
  lease expiry/reacquisition after process crash, mid-batch failure/cursor recovery,
  idempotent replay, transient/permanent errors, backoff, and repeated-failure health
  visibility.
- Additive migration safety against the current deployed schema and existing rows.

Tests must use isolated fixtures/fake providers and must not connect to or mutate live
user data. Run focused server tests, the full server suite, client lint, and a
production Next.js build. Report actual exit statuses and failures.

## Delivery gate

Before code edits, confirm this prompt with the user. Before any commit, merge, or
deployment, obtain separate explicit approval. Provide the final changed-file list,
actual test/build results, required Render service/plan/environment changes, and the
exact deployment commit only after those steps are explicitly authorized.
