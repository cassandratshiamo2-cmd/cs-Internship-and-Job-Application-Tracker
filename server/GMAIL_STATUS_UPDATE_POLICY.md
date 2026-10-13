# Gmail-driven application status policy

Gmail can update an application only after the message has passed the existing
incoming-direction and current-message checks, produced one supported status
classification, and matched one application with sufficient confidence and
uniqueness. Outgoing, direction-unknown, conflicting, quoted-only, generic, or
ambiguous messages do not automatically update an application.

## Status transitions

- Supported forward outcomes may advance an application according to the
  centralized transition table in `gmail-matcher.js`. Rejection is a supported
  outcome from active application states. Withdrawal is supported from an
  active application state, including an accepted offer.
- A clear, newer employer outcome may correct an existing status only when the
  caller has already established trusted incoming, current-message evidence and
  a unique application match. Such corrections also require a valid, strictly
  newer message timestamp. Unsupported transitions without that explicit
  trusted-email policy go to review.
- An email older than the application's `updated_at` cannot change its status
  or confirmed interview details. A newer clear employer message can be applied
  where the transition policy permits it.
- Manual review actions use the same transition table but do not opt into the
  narrow email correction rule.
- The current schema does not record whether the last application edit came
  from a user or Gmail. `updated_at` is therefore the available safeguard:
  edits newer than an email make that email stale. The policy does not claim
  provenance beyond that timestamp.

## Persistence, notifications, and recovery

The processed Gmail message, application update, and status notification are
written transactionally. Message IDs and notification event keys remain
idempotency keys; duplicate processing must not create another update or
notification.

Quota and authentication failures stop the sync because they affect the
connection or request budget globally. A per-message retrieval failure after
request retries is recorded as retryable review when possible, and later
independent messages in the fetched batch can still be processed. An
unclassified Gmail 404 is not treated as proof that a message no longer exists;
only a Gmail `notFound` response has that meaning.

History and initial-sync checkpoints advance only after all message outcomes
are persisted. A persisted fetch warning contains the Gmail message ID and a
retryable review state, so advancing past it does not discard the ability to
retry. If that warning cannot be persisted, the checkpoint remains unchanged.
Existing history pagination, database lease ownership, request backoff, and
notification uniqueness protections remain in force.
