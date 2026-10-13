# ApplyFlow Gmail integration — Phase 2 application matching

## Objective

Improve global Gmail-to-application matching while preserving Phase 1 message
context handling, user isolation, status safeguards, transaction behavior, and
idempotency.

## Intended files

- `server/gmail-matcher.js`: normalize and score independent matching evidence,
  keep automatic matching limited to confident and unique candidates, and
  produce candidate explanations containing company, position, and matched
  evidence.
- `server/gmail-sync.js`: supply only user/connection-scoped application
  metadata and safe existing Gmail-thread associations to the matcher, and
  persist useful candidate explanations with review outcomes.
- `server/test/gmail-matcher.test.js`: cover harmless name/title variants,
  similar companies and roles, duplicate/ambiguous applications,
  sender-domain-only evidence, reference IDs where represented in existing
  application fields, and unrelated messages.
- `server/test/gmail-sync.test.js`: cover thread association behavior,
  user/connection isolation, and review reason persistence without changing
  status or notifications for ambiguous matches.

## Constraints

- Preserve all existing worktree changes, especially the Phase 1 parser/sync
  changes and untracked `server/gmail-parser.js.backup`.
- Do not change OAuth, external integrations, environment variables,
  production data, or unrelated features.
- Do not add a migration: use existing application notes/application-link
  fields and `gmail_processed_messages` thread/application associations only
  when present and sufficiently reliable.
- Sender domain alone must never authorize an automatic update.
- Similar company names, similar job titles, and duplicate applications must
  not be collapsed into a false unique match.
- Review explanations must identify candidate company and job title and state
  the evidence behind each candidate.
- Do not stage, commit, push, deploy, restore, replace, or discard files.

## Validation

- Run focused matcher and Gmail sync tests, then the complete backend suite.
- Review the complete diff and run `git diff --check`.
- Report exact test counts and any limitations. Do not claim production behavior
  was verified.
