# Fix the Two ApplyFlow Code Review Findings

## Goal

Make the two targeted corrections identified in the final ApplyFlow code review. Preserve all other worktree changes and existing Gmail, application, and notification behavior. Do not access or modify production data, change environment variables, or commit, push, or deploy.

## Finding 1: Gmail retry and refresh errors are conflated

In `client/my-app/app/gmail/page.tsx`, `handleRetry` currently wraps the retry API request and the subsequent `refreshData()` in one `try/catch`. A successful retry followed by a refresh error is therefore presented as a retry failure.

- Handle the retry request result independently from refreshing page data.
- Report the actual retry outcome as successful when the retry API succeeded.
- If refreshing data fails after that success, display a clear refresh warning, not a retry-failed error.
- Keep refresh-after-retry behavior, existing retry outcome messages, and the `finally` cleanup that resets `isWorking`.
- If the retry request itself fails, continue to show its error and attempt a refresh; report a refresh warning alongside the retry error only if that refresh also fails.
- Add a focused regression test using the existing frontend test conventions, if present, that distinguishes retry success plus refresh failure from retry failure. Do not add a test framework or dependencies solely for this change; if no applicable frontend test harness exists, explain the limitation and perform the strongest available checks.

## Finding 2: stale same-status interview email can overwrite newer details

In `server/gmail-matcher.js` and `server/gmail-sync.js`, ensure the email timestamp safeguard applies to same-status interview-detail changes as well as status transitions.

- Apply the same `updatedAt` versus email `receivedAt` stale decision before allowing a same-status `Interview` email to update date, time, or type.
- A stale email must remain available for manual review and must not modify the application's interview details.
- A newer non-stale interview email may still update eligible interview details without changing the `Interview` status.
- Preserve all existing status-transition protections, application row locking/conditional update safety, notifications, and interview reminder scheduling behavior.
- Add regression coverage proving stale same-status interview details go to review and do not update the application, and that a newer same-status interview message can still update details. Use existing backend test patterns.

## Validation and reporting

Run the following commands and report their actual results:

- `npm --prefix server test`
- `npm --prefix client\my-app run lint`
- `npm --prefix client\my-app run build`
- `git diff --check`

Report exactly which source and test files changed. Do not include this prompt file in the source/test change list. Do not claim live Gmail or production database verification.
