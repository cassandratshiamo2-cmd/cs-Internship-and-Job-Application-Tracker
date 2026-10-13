# ApplyFlow Gmail integration — Phase 3 interview-detail extraction

## Objective

Improve interview schedule and detail extraction while preserving existing
matching, sync safety, Phase 1 message-context safeguards, and confirmed
application interview details.

## Intended files

- `server/gmail-parser.js`: make date/time pairing schedule-local and
  conservative across multiple dates, reschedules, and ranges; refine explicit
  interview type, location/address, and meeting-link evidence; preserve
  supported date formats, timezone conversion, and the Africa/Johannesburg
  default policy; use current authored message content only.
- `server/test/gmail-parser.test.js`: add synthetic regression coverage for
  separate/multiple schedules, rescheduling, missing/ambiguous details,
  date/time pairing, types, addresses, links, supported timezones and
  midnight conversion, invalid values, quoted history, and existing formats.
- `server/test/gmail-sync.test.js`: add or extend a synthetic sync test proving
  uncertain or absent extracted interview details do not overwrite confirmed
  fields and only reliable reschedule details update them.

## Constraints

- Preserve all existing Phase 1 and Phase 2 work, including modified
  `server/gmail-parser.js`, `server/gmail-sync.js`, their existing tests, and
  untracked `server/gmail-parser.js.backup`.
- Do not access live Gmail or production databases, alter OAuth/environment
  settings, or stage, commit, push, deploy, restore, replace, or discard files.
- Do not add a migration or alter the data model. Use existing interview
  detail fields and persistence behavior.
- Do not use quoted/forwarded historical message content as current interview
  evidence. Missing or ambiguous values must not clear confirmed details.
- Do not introduce company-specific rules or unrelated refactors.

## Validation

- Run focused Gmail parser and sync tests, then the complete backend suite.
- Review the final diff and run `git diff --check`.
- Report exact counts, changed files, and limitations. Do not claim production
  behavior was verified.
