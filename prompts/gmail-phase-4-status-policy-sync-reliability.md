# ApplyFlow Gmail integration — Phase 4 status policy and sync reliability

## Objective

Define safe Gmail-driven status transitions and harden per-message recovery while
preserving Phase 1–3 behavior, idempotency, notifications, user isolation,
leases, and checkpoint safety.

## Intended files

- `server/gmail-matcher.js`: make the email status-transition policy explicit.
  Automatically permit clear forward transitions and only narrowly permitted,
  newer employer corrections; require review for stale, ambiguous, or
  unsupported corrections. Keep status decision logic centralized.
- `server/gmail-sync.js`: continue processing independent messages when a
  message-specific fetch/processing failure is exhausted, persist a useful
  retryable review reason, and preserve checkpoints only when the failure is
  durably retryable. Keep quota/auth failures global and stop processing on
  them. Preserve transactional application/processed-message/notification
  writes, notification event keys, and lease checks.
- `server/GMAIL_STATUS_UPDATE_POLICY.md`: document direction, evidence,
  matching, time ordering, permitted transitions, review cases, retries,
  notifications, and checkpoint rules.
- `server/test/gmail-matcher.test.js`: cover forward employer updates,
  newer rejection/withdrawal policy, stale messages, contradictory/invalid
  transitions, and explicit review decisions.
- `server/test/gmail-sync.test.js`: cover duplicate syncs/notifications,
  durable per-message failures with later IDs continuing, checkpoint retention
  when failure persistence fails, history pagination, transient retry and
  quota stops, overlapping leases, and explicit retry idempotency.

## Constraints

- Preserve existing Phase 1–3 changes, especially parser/sync code, all tests,
  matching logic, and untracked `server/gmail-parser.js.backup`.
- Use current authenticated incoming direction, current authored evidence,
  unique confident matching, and Gmail `internalDate`/existing timestamps.
- Never auto-apply stale, quoted-only, contradictory, direction-unknown, or
  ambiguous messages.
- Existing `applications.updated_at` remains the guard against overwriting
  newer user/manual edits. Do not claim source provenance beyond the current
  schema.
- Preserve notification uniqueness and transaction behavior. No migration,
  OAuth/environment change, live Gmail/production database access, or unrelated
  refactor.
- Do not stage, commit, push, deploy, restore, replace, or discard files.

## Validation

- Run focused matcher and Gmail sync tests, then the complete backend suite.
- Review the final diff and run `git diff --check`.
- Report exact test counts, policy decisions, changed files, and remaining risks.
