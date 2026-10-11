# Stop retrying unavailable Gmail messages

## Goal

Stop repeated processing warnings when Gmail message IDs returned by Gmail API list/history calls return a genuine `messages.get` 404. Preserve valid message processing, the existing database schema, OAuth scopes, account ownership, status safeguards, and retry behavior for other recoverable outcomes.

## Confirmed code path

- `server/gmail-sync.js` obtains IDs from `users.messages.list` during initial sync and `users.history.list` during history sync.
- The list response IDs are passed directly to `processMessagesIndividually()` and then to `processMessage()`/`fetchMessage()`. Fetch uses `users.messages.get({ userId: 'me', id: messageId, format: 'raw' })` with the OAuth client constructed from the current connection's tokens.
- `fetchMessage()` wraps a fetch 404 as `GMAIL_MESSAGE_NOT_FOUND`.
- `processMessagesIndividually()` treats that typed error as an isolated per-message condition, currently records it as a generic `review`, returns `warning`, and continues with other IDs.
- Any processed `review` row is retryable according to `isRetryableProcessedMessage()`. If a list/history response surfaces the same ID again, that review row does not suppress another fetch, so a permanently unavailable ID can create repeated 404 warnings.
- Gmail processed-message schema allows `ignored` as a terminal outcome; using it with a specific non-sensitive reason avoids schema changes and does not imply that email content was successfully parsed or applied.

## Implementation

- Keep message IDs unchanged from list/history through the `messages.get` request.
- Keep `userId: 'me'` and the current OAuth client/account scoping.
- Handle only `GMAIL_MESSAGE_NOT_FOUND` as terminal unavailability. Record a minimal processed row as `ignored`, with no email body/headers fabricated, and a safe reason stating that the Gmail message was unavailable at fetch time.
- Return a distinct transient result outcome such as `unavailable` for the manual-sync summary; do not call it `review`, `updated`, or a processing warning. Make the Gmail UI summary identify the unavailable-message count accurately.
- Ensure an existing row from an earlier failed fetch is transitioned to this terminal state safely and idempotently, without overwriting data from a successfully fetched/processed email.
- Emit a safe diagnostic for this event without logging message IDs, OAuth data, or message contents.
- Do not convert authentication, permission, quota, network, parser, matcher, or database errors into missing-message outcomes. Preserve their existing handling.
- Keep the existing review queue, explicit review retry, Gmail read-only scope, application matching, status-transition safeguards, interview parsing, and manually entered interview fields intact.
- No production database connection, migration execution, environment change, OAuth setting change, deployment, push, or unrelated refactor.

## Tests

- Add a focused test proving a Gmail ID from a list/history response is passed unchanged to `messages.get`, and an unavailable-ID 404 results in terminal non-review handling.
- Assert that a subsequent sync/reappearance does not fetch the same terminal missing message again.
- In a mixed batch, assert a missing ID does not prevent a valid application/interview email from being processed and persisted.
- Assert that authentication/permission and non-404 failures are still propagated through their existing error paths.
- Run focused Gmail sync tests, full server tests if feasible, frontend lint/build if the UI summary changes, and `git diff --check`.
