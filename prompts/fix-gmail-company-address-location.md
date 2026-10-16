# Fix Gmail Company Address Location Extraction

## Objective

Update Gmail interview-location parsing so the explicit label
`Company Address:` is accepted as the interview location without broadening
acceptance of unrelated addresses.

## Scope

- In `server/gmail-parser.js`, recognize exactly the `Company Address` label as
  an explicit location context in `extractInterviewLocation`. Preserve current
  interview-labelled location, venue, and address handling; do not accept
  unrelated standalone addresses.
- In `server/test/gmail-parser.test.js`, cover the exact NovaBridge address
  `Company Address: Test Office, 123 Example Avenue, Hatfield, Pretoria, 0083`,
  the same address in HTML passed through `extractInterviewDetails`, missing
  addresses, and the existing safeguards against unrelated addresses.
- Do not change `server/gmail-sync.js` unless a regression proves the existing
  persistence path drops an extracted location. Existing sync code has already
  been inspected and passes `interviewLocation` into the matched application
  update with null-preserving behavior.
- Do not change date/time, timezone, interview-type, meeting-link, matching,
  schema, frontend, or unrelated code.
- Do not add dependencies. Do not stage, commit, push, or deploy.

## Validation

- Run focused parser and sync tests from `server`.
- Run the full backend test suite.
- Run `git diff --check` and inspect the final scoped diff.
- Confirm no date/time or meeting-link logic changed.
