# Gmail Processing Root-Cause Hardening

## Goal

Harden the existing Gmail integration against intermittent sync errors, invalid status transitions, weak application matching, generic job-alert false positives, repeated message handling, and one-message processing failures. Preserve the current OAuth, token encryption, quota/backoff, advisory lock, cooldown, history, and reminder implementations unless a test proves a narrowly scoped correction is required.

## Findings

- `server/gmail-sync.js` generates the automatic-transition review reason in `recordMessage()` after `getEmailUpdateDecision()` rejects the transition or stale-email check.
- The same file generates `Gmail sync failed. Please try again later.` in the sync catch after classifying quota and authentication errors. It now logs sanitized error details, but the production exception itself still requires deployed logs to identify.
- `syncInitialPage()` and `syncHistory()` process message IDs in uncaught loops. A parse, fetch, match, or persistence exception can abort a page before its cursor is advanced, causing earlier IDs to be revisited on later syncs.
- `processMessage()` returns `duplicate` for every existing processed-message row. This prevents duplicate work, but also makes the `recordMessage()` branch that refreshes an existing `review` row unreachable.
- Automatic sync and manual review call separate transition functions (`getEmailUpdateDecision()` and `getReviewedEmailUpdateDecision()`), creating inconsistent status semantics.
- `classifyApplicationEmail()` applies supported-status keyword rules without first excluding newsletters, recommendation mail, Pnet alerts, or LinkedIn job alerts.
- `matchApplication()` uses substring/token-overlap heuristics and can accept a company-only match at the confidence threshold; ambiguous same-company roles and generic alerts need explicit confidence safeguards.
- The processed-message table already has a unique `(connection_id, gmail_message_id)` constraint. Interview reminder jobs already upsert on `(user_id, application_id, notification_type, channel)`. Avoid schema changes and keep these idempotency mechanisms.

## Implementation Scope

- Introduce one central backend email-to-application decision function, used by both automatic sync and manual review. It must report/apply the decision for status transition, same-status/already-up-to-date, backward transition, stale update, interview-detail-only update, or manual review. Preserve forward-only transitions, terminal status safety, and current stale-email safeguards except for legitimate same-Interview detail completion.
- Keep status and interview-detail decisions distinct. For an existing Interview application, allow newly extracted date/time/type to update while keeping status Interview. Do not overwrite interview type when extraction returns null. Treat a repeated email with no changed details as already up to date, not as a backward status transition or a new review item.
- Wrap each message’s fetch/parse/classify/match/persist operation in an isolated error boundary. Record a bounded warning for that message and continue with remaining IDs. Authentication/permission errors and quota limits must preserve the existing global failure/cooldown behavior. Do not let an ordinary malformed message terminate the batch.
- Preserve per-message idempotency using the existing Gmail message ID and processed-message uniqueness. A repeated successful, ignored, warning, or review message must not create extra rows or repeat application/reminder effects. Ensure failed per-message work has a deliberate retry/cursor behavior instead of silently losing the message or replaying the entire completed batch indefinitely.
- Add alert/newsletter suppression before application matching/status-review creation. Cover Pnet alerts, LinkedIn job alerts, multi-company recommendations, newsletters, and promotions. Store ignored mail as ignored/history where appropriate; do not queue it as a user application review.
- Strengthen matching using normalized exact company evidence, position/title evidence, subject/body context, and sender-domain evidence where appropriate. Require a unique confident winner; if multiple candidates remain plausible or no candidate is confident, require manual selection. Keep existing nested-company and Pnet safeguards.
- Preserve Gmail OAuth, token encryption, Gmail API request shape, quota retry/cooldown, advisory lock namespace/semantics, processed-history schema/API, and idempotent interview reminder upsert. Do not change unrelated application, dashboard, interview, notification, authentication, or deployment code.

## Required Scenario Tests

Document expected outcome alongside each test:

1. `Applied -> Interview`: apply status and extracted details.
2. `Applied -> Rejected`: apply status.
3. `Shortlisted -> Interview`: apply status and details.
4. `Interview -> Offer`: apply forward transition.
5. `Interview -> Interview`: keep status; apply changed details; otherwise return already up to date.
6. `Rejected -> Interview`: manual review; do not move status backward from terminal rejection.
7. `Offer -> Interview`: manual review; keep terminal offer.
8. Generic Pnet recommendation: ignored/history, no application review.
9. LinkedIn job alert: ignored/history, no application review.
10. Exact company match: auto-apply only when the application is unique/confident.
11. Multiple plausible company/application matches: manual review, no automatic update.
12. Same Gmail message twice: one processed record, stable application state, no duplicate reminder jobs/reviews.
13. Malformed email followed by valid email: record a warning for the first, process the second, and keep sync alive.
14. Interview date and time: persist `2026-10-09` and `08:30`, keep or explicitly detect interview type.
15. Interview date only: update date and preserve existing time/type.

Include additional focused tests for sender/title variants, status already up to date, stale/backward transitions, and authentication/quota errors retaining their global handling.

## Verification

- Run Gmail parser tests.
- Run Gmail matcher/status tests.
- Run Gmail sync tests.
- Run the complete backend suite.
- Run the frontend production build.
- Run `git diff --check` and confirm only scoped Gmail files changed.
- Do not commit, push, or deploy as part of implementation unless separately requested.
