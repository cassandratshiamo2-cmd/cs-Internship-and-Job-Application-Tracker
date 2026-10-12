# Port Gmail message 404 handling to current main

## Goal

Port only the Gmail message-fetch 404 fix from commit `d1b436a` into the current `fix/gmail-404-on-main` branch without cherry-picking or replacing files. Preserve the current `main` code and its existing behavior outside this narrow fix.

## Current-branch findings

- `server/gmail-sync.js` calls `users.messages.list` in `listInitialPage()` and `users.history.list` in `syncHistory()`. The returned message IDs are passed unchanged into `processMessagesIndividually()` / `processMessage()` and then `fetchMessage()`.
- `fetchMessage()` requests `users.messages.get({ userId: 'me', id: messageId, format: 'raw' })`, but currently wraps every HTTP 404 as `GMAIL_MESSAGE_NOT_FOUND`, without requiring Gmail's `notFound` reason.
- `processMessagesIndividually()` records `GMAIL_MESSAGE_NOT_FOUND` through the generic warning-review path. Because review records remain retryable, permanently unavailable message IDs can be fetched repeatedly.
- `syncConnection()` currently treats any 404 thrown during `syncHistory()` as an expired history cursor. A 404 from a per-message fetch can therefore be mistaken for cursor expiration.
- Current schema supports the existing `ignored` outcome; do not add a schema migration.
- Current routes calculate history retryability centrally but use a raw retry-attempt count for review queue entries.
- Current Gmail UI labels warning outcomes and does not clearly label unavailable messages in processed history.
- Current branch is clean at `a4ef1c1`, with no cherry-pick in progress. Do not switch branches or attempt cherry-pick.

## Implementation scope

- Classify an individual `messages.get` 404 as permanently unavailable only when the error's status is 404 and Gmail's structured reason includes `notFound` (case-insensitive normalization already exists).
- Preserve unchanged message IDs, `userId: 'me'`, per-connection OAuth client behavior, read-only OAuth, parser, matching, status safeguards, interview extraction, and manually entered fields.
- Record newly unavailable messages as terminal `ignored` history with a clear, safe reason explicitly stating contents were not retrieved. Do not fabricate parsed email details or mark the message updated/reviewed.
- If the unavailable ID already has a generic warning-created review row with no extracted email data, terminalize it safely. If it already has substantive review details, preserve the review outcome and extracted fields, change only its reason to unavailable, and suppress further retries.
- Make retryability consistently reject records explicitly marked unavailable. Use the existing retry helper for review-route response shaping; preserve ordinary ambiguous review retry behavior.
- Isolate expired history-cursor fallback to 404 errors thrown by `users.history.list` only, with a typed cursor-expired error; do not reset the cursor for a 404 thrown by `messages.get`.
- Return a distinct `unavailable` sync outcome and render it accurately in the summary. In processing history, describe unavailable records as unavailable/not retrieved rather than successfully processed.
- Do not modify schema, credentials, OAuth settings, environment variables, or unrelated parser/matcher behavior.

## Regression tests

- Gmail message list IDs reach `messages.get` unchanged and requests use `userId: 'me'`.
- A `messages.get` 404 with Gmail `notFound` is terminalized and not fetched again on a subsequent sync.
- A missing message does not prevent a later valid application/interview email in the same batch from being persisted.
- A 404 without Gmail `notFound` remains a failure and does not create an unavailable/review record or advance the history cursor.
- Only an expired-history `users.history.list` 404 invokes cursor reset and initial-sync fallback.
- Existing review details remain preserved and unavailable review rows are not exposed as retryable; normal ambiguous reviews retain their existing retry behavior.

## Verification

- Run focused Gmail sync and route tests, then the full server suite if feasible.
- Run frontend lint and production build after UI changes.
- Run `git diff --check`.
- Do not commit, push, merge, deploy, switch branches, alter production settings, or run database migrations.
