# ApplyFlow Complete Audit and Root-Cause Repair

## Goal

Complete the requested audit and repair in the existing ApplyFlow repository. Preserve the current project and all user data. Do not deploy, push, change production settings, access production records, or request secret values.

## Repository state and constraints

- Production commit reported by the user, `e5e1151`, is present as `origin/main`. The local `dev` branch and worktree contain later and uncommitted work; inspect and preserve it rather than resetting or replacing it.
- The worktree already contains the approved Gmail sync/retry implementation work from the preceding task, plus earlier reliability/audit changes. Integrate and correct that work; do not redo or overwrite unrelated changes.
- Root and client `AGENTS.md` were read. Before editing Next.js code, consult the relevant installed Next.js documentation.
- The user explicitly scopes this task to the existing backend, PostgreSQL, Gmail, and production architecture. Use only additive, backward-compatible database changes. Do not run migrations against production.

## Root causes and evidence confirmed so far

1. **The deployed code does not contain the local Nova classifier fix.**
   - `git show e5e1151:server/gmail-parser.js` shows Assessment patterns for “assessment test/task/invitation/exercise/link,” “complete … assessment,” “online assessment,” “coding challenge,” and “technical assessment”; it does not match “invited for an assessment/assesment.”
   - The shared classifier therefore returns no status for the supplied Nova body. The processing flow stores the message as `ignored` with a null detected status before application matching or an application update can occur. The UI displays null status as “Not available.”

2. **Production’s automated retry is one-shot and cannot recover a message after a failed reclassification.**
   - The deployed implementation uses `IGNORED_MESSAGE_REPROCESS_VERSION = 1`, and only selects ignored rows with the exact “No supported application status rule matched.” reason.
   - A prior retry using the still-defective deployed classifier increments that message’s version and leaves it unclassified; subsequent automatic syncs skip it. No production database access was used, so the exact Nova row’s current outcome/reason/version remain unverified.
   - Local work has since added a higher retry bound, classification patterns, and an authenticated per-message retry endpoint/UI. These changes are uncommitted and have not been deployed. Review for legacy-row eligibility, safe retry semantics, correct status reporting, and idempotency rather than assuming they solve production.

3. **The current classifier uses combined subject and body text for status detection.**
   - This can classify a status from a subject phrase without confirming relevant body content, contrary to the requirement. Add tests for subject-only false positives and preserve legitimate transactional cases.

4. **Gmail sync ownership uses a shared expiring lease, but live lease state is unavailable here.**
   - Do not claim an active or stale production lock without evidence. Keep database owner-token coordination and recovery; test worker/manual contention, lease expiry/renewal/release, and failure paths.

5. **The repository’s production-service settings cannot be independently confirmed from local files.**
   - Vercel, Render, Google Cloud, and Neon configuration are not available through the checked-out source. Do not print or request secrets. Report these as post-approval verification items.

## Execution scope

### A. Gmail classification, parsing, matching, and recovery

- Trace Gmail retrieval through MIME parsing, classification, matching, status transition checks, transactional persistence, notifications, and UI refresh.
- Make shared, content-grounded rules recognize supported recruitment outcomes and wording variations, including the supplied Nova typo. Prevent subject-only status outcomes unless body content provides relevant corroboration.
- Preserve multipart/plain-text/HTML support; avoid changing matching rules without tests showing a defect.
- Keep ambiguous matches in review and irrelevant alerts/newsletters ignored.
- Make previously processed failures safely eligible for reprocessing using explicit criteria that can distinguish obsolete/unclassified outcomes from known irrelevant messages. Preserve Gmail message IDs and existing rows; bound user-triggered retries and ensure repeated processing cannot duplicate application changes or notifications.
- Keep stale-email/manual-status protection and supported status validation. A retry must produce a clear updated/review/ignored/error result and must not claim a status update unless the database transaction succeeded.
- Add end-to-end mocked regression coverage for the exact Nova message, a legacy `Not available`/null-detection row already at its old retry limit, successful and repeated retries, ambiguous matches, known irrelevant email exclusion, and newer manual application state.

### B. Synchronization and frontend behavior

- Review manual, OAuth-triggered, and scheduled sync entry points; database leases; owner checks; expiry; timeout; release; worker overlap; and per-account Gmail request serialization.
- Preserve shared cross-instance coordination. Do not remove locks or loosen ownership/expiry without a proven reason.
- Return truthful checked/processed/updated/skipped/review outcomes where the current API can support them without miscounting pages or retries.
- Confirm repeated clicks are suppressed in the UI, all loading states reset in `finally`, and data refreshes after completed operations.
- Test manual/background and cross-instance contention, crash/expiry recovery, lease-renewal or release failure, Gmail auth/quota failures, and duplicate message delivery.

### C. Bounded whole-application audit

Inspect authentication/session handling, application CRUD and validation, dashboard source/counts, interview dates and Africa/Johannesburg conversion, reminders, notification persistence/read state/idempotency, frontend API contracts and error/loading states, CORS, database pool/schema initialization, and repository deployment configuration.

Fix confirmed, in-scope defects only. Do not redesign working screens, add unrelated dependencies, or broaden the task into feature work. If a live deployment/configuration assertion cannot be supported from local evidence, document it as unverified rather than changing configuration.

### D. Regression and validation

- Add focused automated tests for confirmed defects and critical Gmail paths using mocked Gmail/PostgreSQL services where live credentials are unavailable.
- Run `npm --prefix server test`, `npm --prefix client\\my-app run lint`, `npm --prefix client\\my-app run build`, backend syntax checks, and `git diff --check`.
- Review all changed files and preserve unrelated dirty worktree changes. Report exact test results and explicitly distinguish mocked/local verification from live Gmail, production PostgreSQL, and hosted deployment behavior.

## Out of scope

- No deployment, push, production database query/mutation, credential rotation, or OAuth reconnection.
- No database reset, deletion of email history, application records, or notifications.
- No changes to secret environment values; document only variable names and where they belong if a verified configuration change is actually necessary.
