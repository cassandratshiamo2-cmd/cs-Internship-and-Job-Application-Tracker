# ApplyFlow Gmail integration — Phase 1 message context

## Objective

Improve the current Gmail processing context so status classification and
interview-detail extraction use trustworthy current-message evidence, while
preserving existing work and matching safeguards.

## Scope

- Re-check the worktree before editing and preserve all existing modifications,
  especially `server/gmail-parser.js` and the untracked
  `server/gmail-parser.js.backup`.
- In `server/gmail-sync.js`, construct a normalized transient message context
  from Gmail message/thread IDs, message labels, From, To/Cc, relevant delivery
  headers, subject, parsed body, and direction.
- Treat Gmail `SENT` labels and a sender matching the connected primary address
  as outgoing and never apply those messages as incoming recruitment updates.
- Use recipient/delivery headers and Gmail labels to identify incoming messages
  where possible. If direction cannot be established, do not automatically
  update an application.
- Do not widen Gmail OAuth scopes. Configured send-as aliases cannot be
  enumerated reliably under the existing `gmail.readonly` grant. Treat `SENT`
  as reliable alias-aware direction evidence; do not infer an alias from a
  sender display name or domain.
- In `server/gmail-parser.js`, isolate current authored text only at clear
  quoted-reply, forwarded-message, or standard signature boundaries. Preserve
  content when a boundary is uncertain. Ensure both classification and
  interview-detail extraction use the same current-message content.
- Do not let contradictory generic/newsletter/security body context or
  historical quoted content turn subject text into an application outcome.
  Preserve legitimate subject-based interview detection where body content is
  neutral and existing behavior requires it.
- Preserve generic alert filtering, application matching confidence and
  uniqueness thresholds, status-transition/stale-email handling, transaction
  behavior, notifications, and existing migration/schema.
- Add synthetic tests in `server/test/gmail-parser.test.js` and
  `server/test/gmail-sync.test.js` for incoming/outgoing/alias evidence,
  quoted replies, forwarded content, signatures, and conflicting evidence.

## Out of scope

- No Gmail API calls to live accounts, production database access, schema or
  OAuth scope changes, company-specific exceptions, unrelated refactors,
  commits, pushes, or deployment.
- Do not replace the parser from its backup or rewrite the existing parser.

## Validation

- Run focused parser and sync tests.
- Run the complete backend suite.
- Inspect the final diff and ensure only the intended files changed; preserve
  all pre-existing work in the parser and backup.
- Report exact test results and state that production behavior was not tested.
