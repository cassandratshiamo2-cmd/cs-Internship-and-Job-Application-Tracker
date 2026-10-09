# ApplyFlow Complete Website Audit and Reliability Improvements

## Goal

Systematically audit and repair confirmed defects across the existing ApplyFlow frontend, Express API, PostgreSQL persistence, Gmail integration, authentication, application CRUD, interviews, reminders, notifications, and deployment configuration. Preserve the existing application and data; do not rebuild, redesign working pages, deploy, reset the database, expose secrets, or introduce unnecessary dependencies.

This request explicitly expands the older Sprint 1–4 frontend-only guidance to include auditing the backend and integrations already present in this repository. Keep the client/server split and existing product behavior.

## Worktree Safety

The worktree already contains Gmail reliability changes from the previous approved task in `README.md`, `client/my-app/app/gmail/page.tsx`, `client/my-app/lib/gmail-api.ts`, `server/gmail-routes.js`, `server/gmail-sync.js`, and their tests, plus its prompt. Preserve and integrate those changes. Do not discard or overwrite them.

## Confirmed Findings

1. **Neon pooled endpoint versus session advisory locks:** The local backend environment is configured with a Neon pooled hostname (only the fact that it is a pooler and `sslmode=require` were inspected; no hostname or credentials were printed). Gmail sync acquires session-level PostgreSQL advisory locks and then performs many separate queries while expecting that backend session to retain the lock. A transaction-pooling endpoint does not guarantee backend-session affinity between transactions. A lock may therefore fail to coordinate syncs correctly or remain held by a backend after the client believes it released it. The local URL’s pooler type is evidence; the Render URL/mode is not available from this workspace.
2. **Date-only timezone shift:** PostgreSQL `DATE` values are parsed by the installed `pg` types as JavaScript `Date` objects in the local timezone. In this `+02:00` environment, parsing `2026-10-09` then calling `toISOString().slice(0, 10)` yields `2026-10-08`. Application list/detail/create/update serialization uses this conversion in several paths, so an application date may display one day early locally. Keep dates date-only end to end; do not use UTC instant serialization to represent a SQL `DATE`.
3. **False-positive health checks / startup without a DB:** `/api/health` returns HTTP 200 with `status: UP` even when PostgreSQL is unavailable. Also, `ensureDatabase()` returns when `DATABASE_URL` is missing and the server still starts listening, despite core API routes requiring the database. Make health status suitable for platform health checks and avoid claiming DB-backed readiness when the database is absent.
4. **Application type contract mismatch:** The database allows a legacy `Job` type, the add form still offers it, but the client `ApplicationType` model and filter do not. Reconcile supported values without deleting or silently reinterpreting existing records; inspect legacy compatibility before tightening any database constraint.
5. **Failed create writes guest data after API failure:** The authenticated create form catches a failed `/api/applications` request, writes the unsaved payload into local mock storage, then shows an error. A failed database save must not create a second, success-shaped local copy.
6. **Login lockout counts server failures as bad credentials:** The login UI increments failed attempts for every non-2xx response. Database/server outages should not count as invalid credential attempts; distinguish authentication failures from service failures and preserve the configured five-attempt prototype behavior.
7. **Uneven status-update notifications:** Automatic Gmail status changes create a notification, but manually applying a queued Gmail review updates the application without creating the equivalent status-change notification. Make status-change audit/notification behavior consistent and idempotent where a status actually changes.
8. **Validation failures surface as server errors:** Application create/update primarily rely on PostgreSQL `CHECK` constraints for allowed enum values and date/time coercion, so invalid values can become HTTP 500 instead of useful client errors. Validate supported application types, statuses, arrangements, interview types, and date/time formats before issuing writes.
9. **Test coverage gap:** Existing server tests cover Gmail parsing/matching/sync, reminders, and notifications, but there is no focused route-level coverage for core application CRUD, registration/login, health/readiness, or client form behavior. There is no frontend test script currently.

Do not assume these findings are exhaustive. Continue tracing every existing route/page and fix further defects only when verified.

## Implementation Scope

### 1. Pooler-safe synchronization

- Replace long-lived session advisory locks in Gmail account/worker coordination with a PostgreSQL coordination design that remains correct through Neon transaction pooling. Prefer a short-query, atomically acquired expiring lease with a random owner token and compare-and-release semantics; renew it while work continues and ensure crashed processes eventually release via expiry.
- Apply coordination to automatic, OAuth-triggered, and manual sync. Preserve per-connection exclusion and database-level message idempotency; do not report lock acquisition as completion.
- Keep lease/schema changes additive and idempotent in `ensureDatabase`; do not drop/recreate tables or alter existing application records. Define behavior on lease-renewal/database failure: abort before advancing cursors, record a safe error where possible, release owned leases, and never return success-shaped fallback data.
- Keep worker cadence reasonable, avoid startup bursts and overlapping ticks, and prevent each instance from redundantly competing for the same connection when coordination is available. Preserve bounded Gmail request timeouts, quota retry/backoff, safe auth errors, and accurate `last_sync_at` / `last_sync_error`.
- Handle ownership loss, process shutdown where practical, and lock cleanup on success, failure, and cancellation. Add fake-database tests for multiple independent service instances, lease expiry/recovery, ownership checks, manual/worker contention, failure cleanup, and accurate sync responses.

### 2. Gmail processing correctness

- Trace Gmail retrieval through MIME parsing, text extraction, classification, application matching, status decision, transaction, notifications/reminders, processed history, and UI refresh.
- Preserve existing deterministic parser/matcher rules unless a regression test proves a defect. Test plain text and HTML-only/MIME variants, supported outcomes, newsletter/job-alert exclusion, ambiguous candidates, similar company/role names, duplicate IDs, retry behavior, expired authorization, API/database failures, interview field extraction, stale-email protection, and status-change notifications.
- Keep ambiguous/conflicting records in review with useful safe reasons. Ensure cursor advancement and processed outcomes happen only when persistence succeeds. Never store full email bodies or log credentials/tokens.
- Fix review-apply so its application update, processed-message transition, reminder scheduling, and status-change notification are atomic/idempotent and scoped to the current user.

### 3. Authentication, database, and API integrity

- Preserve registration/login/logout and current JWT flow. Require an explicitly configured JWT secret in production; retain any development fallback only for explicitly local development. Do not print secret environment values.
- Treat unavailable/missing database configuration as not-ready, not a healthy service. Bound database connection acquisition/query waits with repository-compatible `pg` configuration, release checked-out clients on every path, and surface safe diagnostics.
- Add explicit HTTP 400 validation for supported fields and input lengths/dates; keep database constraints as a final safeguard. Maintain per-user filtering for every read/update/delete and notification/review operation.
- Make application writes, interview-reminder rescheduling/cancellation, and notifications transactionally consistent. Do not silently ignore failed updates, return a success-shaped response, or change status without a matching record.
- Use an explicit date-only serializer (e.g. SQL `::text` for `DATE` columns or a string-safe serializer) across application list/detail/create/update and interview API responses. Ensure timestamps remain instants and interview wall-clock times remain Africa/Johannesburg local time.
- Preserve legacy application type data. Document compatibility choices if `Job` must remain readable or supported.

### 4. Frontend reliability

- Audit every page and shared API helper for backend URL consistency, auth headers/session expiration, response parsing, duplicate submits, stale state, loading cleanup, and errors. Keep guest/demo mode isolated from authenticated database flows.
- Remove guest/local mock writes on authenticated API failures. Add in-flight submit protection for application create/edit and any other verified duplicate-submit risk. Refresh or navigate using persisted server responses after successful writes.
- Only count actual invalid-credential responses toward the login lockout; show service errors without locking the user out. Keep the fifth failed login disabled for five seconds and clear lockout correctly.
- Fix confirmed date display shifts without converting date-only values to local timestamps. Preserve mobile/desktop design; make only necessary UX/accessibility changes.
- Avoid introducing a client testing framework unless needed. Add focused tests using existing tools or extract small pure helpers for unit testing.

### 5. Notifications and reminders

- Preserve the actual supported notification contract. The current UI and `normalizeNotificationChannels` support In-app only, despite dormant Email-provider code and DB channel values; do not silently enable email delivery. Verify truthful UI/API responses and document the current support level unless an explicitly existing supported workflow is proven broken.
- Verify due-job claiming (`FOR UPDATE SKIP LOCKED`), reclaim of expired work, multiple backend instances, bounded retries, idempotency, notification read/unread updates, and reminder cancellation/rescheduling. Keep status-change events unique per underlying change.
- Do not send test email or contact external services during local validation.

### 6. Deployment and database safety

- Inspect only non-secret configuration metadata locally. Never print/request full `DATABASE_URL`, OAuth credentials, passwords, JWT secrets, or encryption keys.
- Do not assume Render and local Neon use the same endpoint/pooling mode. There is no tracked Render/Vercel deployment manifest, and Render’s runtime environment cannot be read here. State exactly what must be checked in the provider dashboards without asking for secret values.
- Preserve existing environment files and PostgreSQL data. Make only additive, idempotent schema updates required by approved fixes.
- Update the root README with local commands, health endpoint behavior, date/time semantics, sync coordination compatible with transaction pooling, and exact non-secret Render/Vercel/Google Cloud/Neon steps if configuration changes are needed.

## Regression Tests

Add focused backend tests for:

- Health status with database ready, unavailable, and missing configuration.
- Application CRUD validation (valid values, invalid enum/date/time, missing/foreign record, database failure), safe auth/authorization, and exact date-only response values.
- Registration/login behavior, invalid credentials vs service outage, password hashing, and auth secret configuration where testable.
- Gmail manual success/in-progress/failure, pooler-safe distributed leases, worker/manual/OAuth overlap, lease renewal/expiry/recovery, API quota/expired OAuth/database failure, message deduplication, parser/classifier/matcher correctness, review queue, stale emails, atomic status updates, interview details, and notifications.
- Reminder scheduling across timezone boundaries, idempotency, duplicate workers, retries, and notification read state.
- Frontend behavior for authenticated API save failure (no guest write), duplicate submits, spinner cleanup, server-returned refresh data, and date-only display where testable.

Use mocked PostgreSQL/Gmail/Resend dependencies in automated tests. Do not claim live Gmail/Neon/Render/Vercel validation unless it was actually performed. Do not log test secrets.

## Validation and Final Report

Run:

- `npm --prefix server test`
- `npm --prefix client/my-app run lint`
- `npm --prefix client/my-app run build`
- Any focused API/integration tests added
- `git diff --check`

Report exact files changed, verified root causes/fixes, each command’s actual result, known limitations, exact local run commands, production dashboard steps, and which behavior still requires live-provider verification. Do not deploy or make live database changes.
