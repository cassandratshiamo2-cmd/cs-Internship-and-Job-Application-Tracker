# Retry Wrapper-Generated Gmail Request Timeouts

## Objective

Fix the remaining Gmail reliability blocker on the current uncommitted branch:
the bounded request retry classifier does not recognize the error code emitted
by `withGmailRequestTimeout`.

## Scope and constraints

- In `server/gmail-sync.js`, classify `GMAIL_REQUEST_TIMEOUT` as retryable using
  the existing bounded retry mechanism.
- Add a regression test that causes the actual timeout wrapper to reject with
  `GMAIL_REQUEST_TIMEOUT`, verifies the expected bounded retry behavior, and
  proves a later successful request completes its sync normally.
- Update any existing timeout test whose assumptions change because timeout
  attempts now receive retries.
- Verify permanent errors, unavailable Gmail messages, and non-retryable
  authentication errors are not retried indefinitely. Preserve the existing
  retry limit and terminal unavailable-message behavior.
- Do not change matching, notification behavior, database schema, OAuth
  settings, deployment configuration, or unrelated features.
- Do not inspect `.env`, use production data, contact real Gmail accounts, or
  commit, push, merge, or deploy.

## Validation

Run the focused Gmail sync tests, full backend test suite, frontend lint and
production build, notification-state test, and `git diff --check`. Inspect and
report the final diff and exact results. State the remaining staging checks:
database compatibility, two-instance lease behavior, and Render sleep/wake.
