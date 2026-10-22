# Action Centre 2.0 implementation

## Goal and approval gate

Implement the approved Action Centre 2.0 plan in the existing ApplyFlow
architecture. This prompt is the implementation specification. Do not deploy,
push, commit, or change unrelated features.

## Repository findings and constraints

- The dashboard already computes recommendations in
  `client/my-app/lib/action-centre.ts` and renders them in
  `client/my-app/app/dashboard/page.tsx`.
- Applications store interview date/time; `server/interview-reminder-schedule.js`
  already interprets them in `Africa/Johannesburg`.
- The authenticated application list is user-scoped in `server/server.js`.
- Gmail processing and review already exist in `server/gmail-routes.js` and
  `client/my-app/lib/gmail-api.ts`. Reuse them. Do not add an email parser,
  processor, review queue, or duplicate review lifecycle.
- Notification delivery state belongs to `notification_jobs`; do not store
  dashboard action state there.
- `applications.updated_at` is updated by broad application edits, user status
  or interview changes, and Gmail status/interview updates. It does not
  distinguish meaningful recruitment activity from unrelated edits. Do not use
  it as the follow-up clock.
- Preserve unauthenticated guest/demo dashboard behavior and existing application
  statistics, recent applications, progress chart, Gmail workflow, and reminder
  scheduling.

## Implementation stages

Implement in these stages, keeping each stage small and testable.

### Stage 1: recommendation logic and Johannesburg date/time

1. Refine `client/my-app/lib/action-centre.ts`:
   - Evaluate interviews using the actual interview date and time as a
     Johannesburg wall-clock time. Do not show an interview that has already
     passed as upcoming, including an earlier time on the current day.
   - Exclude missing or malformed date/time from upcoming interviews; retain a
     clearly labelled confirm-details recommendation when appropriate.
   - Keep past interviews as a separate status-review action, never as upcoming.
   - Keep follow-up candidates limited to `Applied`, `Assessment`, and
     `Shortlisted`; exclude `Offer`, `Rejected`, and `Withdrawn`.
   - Deduplicate candidates by stable action identity and use transparent,
     deterministic priority ordering for urgent interviews, aged follow-ups,
     and other pending actions.
   - Do not imply that ordinary saved opportunities are urgent tasks.
2. Use the same Johannesburg clock/date semantics for dashboard comparisons and
   display. Avoid parsing date-only strings as browser-local or UTC instants.
3. Extend `client/my-app/lib/action-centre.test.mjs` for time boundaries, invalid
   values, past/today/future interviews, deterministic prioritization, and
   existing follow-up boundaries/status exclusions.

### Stage 2: recruitment activity timestamp and follow-up eligibility

1. Add an idempotently initialized `recruitment_activity_at TIMESTAMPTZ` to
   `applications` in `server/server.js`. Backfill existing rows from
   `created_at` where the new column is null. Initialize it on new application
   inserts.
2. Advance this timestamp only for meaningful recruitment activity:
   - A status transition.
   - A material interview schedule/detail change (date, time, type, location,
     or meeting URL).
   - A successfully applied Gmail status/interview update.
   Do not advance it for edits limited to notes, company/position text,
   application link, arrangement, type, contact email, or notification
   preferences. Preserve normal `updated_at` semantics.
3. In user application updates, compare the stored status and interview fields
   with the requested values within the existing transaction before deciding
   whether recruitment activity changed. Keep owner checks and existing reminder
   rescheduling behavior.
4. In automatic Gmail updates and manual Gmail review application, advance the
   timestamp only when a status or material interview detail is actually
   applied. Do not advance it for ignored, dismissed, already-up-to-date, stale,
   or otherwise unapplied messages. Preserve existing message transactionality,
   matching confidence/uniqueness, and status-transition policy.
5. Expose `recruitment_activity_at` in the authenticated application-list
   response and frontend `Application` type. For existing records, use the
   backfilled `created_at` baseline. Use this timestamp—not generic `updated_at`
   or application submission date—for follow-up age.
6. Follow-up eligibility begins seven Johannesburg calendar days after the last
   recruitment activity, and becomes urgent at fourteen days. No suggestion for
   a future/invalid activity timestamp or a terminal status.
7. Add targeted tests for meaningful versus unrelated edits and Gmail activity
   changes without weakening existing Gmail safety/idempotency behavior.

### Stage 3: Gmail review integration and dashboard presentation

1. Load pending Gmail reviews through the existing `getGmailReviewQueue` helper
   for authenticated users only. Do not load it in guest/demo mode. Provide
   independent loading/error handling so a review request failure does not hide
   application-derived actions.
2. Display pending review count and actionable links to the existing Gmail
   review page. Do not classify mail in the dashboard or reproduce the review
   controls.
3. Keep the responsive ApplyFlow styling, current dashboard features, sensible
   empty states, and accessible status/error feedback. Do not add decorative
   metrics or claim that the whole dashboard is current if its review queue
   could not be loaded.
4. Add focused dashboard/integration coverage where supported by existing
   patterns; retain the Gmail page as the review action destination.

### Stage 4: persistent completion and snoozing

1. Implement only if the existing PostgreSQL/auth setup supports it safely.
   Create a dedicated dashboard action-state table, not a notification table,
   with authenticated user ownership, application ownership, stable action
   identity, cycle identity, state, optional snooze-until, and timestamps. Add a
   uniqueness constraint to prevent duplicate state records. Ensure application
   or user deletion cannot leave unsafe orphan state.
2. Use a follow-up cycle identity based on the application ID and
   `recruitment_activity_at`. Use an interview cycle based on the exact
   Johannesburg interview instant. A later meaningful update or rescheduled
   interview must create a fresh action identity rather than inheriting
   completion/snooze from an older cycle.
3. Implement small authenticated, owner-scoped endpoints for loading/applying
   action state. Derive user ID only from verified authentication; never trust
   client-supplied user IDs. Verify the linked application belongs to that user
   on every mutation. Validate action identity, allowed states, and snooze
   presets server-side.
4. Support only the approved presets: **Tomorrow** and **In one week**. Compute
   their expiry using Johannesburg calendar dates, not a fixed 24-hour
   millisecond offset. A completed action stays suppressed for that cycle; a
   snoozed action is suppressed until its deadline and becomes visible again
   afterward.
5. Derive actions from current eligible application/Gmail data; persist only
   user overrides. Do not persist generated recommendations on every read.
   Expired interview actions and actions no longer eligible are absent from the
   active list; stale state must not suppress a new cycle. Do not add a generic
   workflow engine or repurpose Gmail review outcomes.
6. Add tests for authentication, cross-user rejection, idempotency/uniqueness,
   completion, snooze deadlines, cycle changes, and changed status eligibility.

## Security and regression requirements

- Preserve bearer JWT authentication and bind every application/action/Gmail
  operation to the authenticated user.
- Use parameterized SQL and transactions consistent with existing route code.
- Never expose OAuth credentials, tokens, or message contents beyond the
  existing review queue shape.
- Preserve guest mode; it may show derived recommendations but must not call
  authenticated action-state APIs without a token.
- Preserve existing Gmail classification, message retries, reviews, notification
  delivery, interview scheduling, and application ownership behavior.
- Do not modify unrelated features or add dependencies.

## Validation

Run focused tests first, then relevant regressions:

- Frontend `client/my-app/lib/action-centre.test.mjs`.
- Frontend lint and production build from `client/my-app`.
- Server tests for application update queries/routes, Gmail matching/sync/routes,
  interview reminder scheduling, notification routes, and new action-state
  routes/state behavior.
- Report exact commands and results, all changed files, schema/API changes, and
  any remaining limitations. Do not deploy or push.
