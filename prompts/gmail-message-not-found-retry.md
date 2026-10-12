# Handle unavailable Gmail messages during manual retry

## Objective

Fix the `GMAIL_MESSAGE_NOT_FOUND` handling gap during authenticated manual retry while preserving existing sync and Gmail behavior.

## Investigation findings

- `fetchMessage` translates Gmail API 404 errors with the `notFound` reason to `GMAIL_MESSAGE_NOT_FOUND`.
- Regular sync calls `processMessagesIndividually`, which catches that code, uses `recordUnavailableMessage` to persist an unavailable outcome/reason, and continues with the remaining message IDs.
- Manual retry enters a separate `retryMessageId` branch in `syncConnection` and invokes `processMessage` directly. The same missing-message error escapes to `gmail-routes.js`, whose retry endpoint reports a generic 500, and the eligible history row is not marked unavailable.
- The existing schema and retry rules already support recording unavailable messages without schema changes. The `GMAIL_MESSAGE_NOT_FOUND` reason prevents retry eligibility while preserving already-extracted details.
- Current tests already cover individual 404 handling in normal sync and continuation to an unrelated valid message, but do not exercise missing-message manual retry or its user-facing API response.

## Implementation scope

1. Catch `GMAIL_MESSAGE_NOT_FOUND` only in the manual retry path; call the existing `recordUnavailableMessage` helper and return an unavailable result instead of throwing a generic sync failure.
2. Keep the message user/connection scoped and use existing retryability conventions. Do not alter applications, statuses, OAuth, token encryption, leases, quotas, notification behavior, or schema.
3. Return a clear user-facing retry response when the result is unavailable in Gmail; keep existing responses for ordinary success, concurrent sync, quota, authorization, and non-retryable cases.
4. Add regression coverage proving manual retry records unavailable state and cannot be retried again, the API explains that the message is no longer available, and a separate valid message still processes in the same normal sync batch.
5. Preserve existing 404 distinctions; do not convert other Gmail API 404 errors or history cursor errors into message-unavailable outcomes.

## Validation

- Run focused Gmail sync and route tests.
- Run the full backend test suite.
- Do not modify the database schema or credentials.
- Do not commit, push, merge, or deploy.
