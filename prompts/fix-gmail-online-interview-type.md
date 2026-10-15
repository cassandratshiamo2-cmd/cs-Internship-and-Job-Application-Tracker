# Fix Gmail Online Interview Type Extraction

## Objective

Fix Gmail parsing so an explicitly labeled `Interview Type: Online interview`
is normalized to the existing supported `Video` value and saved through the
existing Gmail sync path to the matched application.

## Evidence

`extractInterviewType` captures explicit `Interview Type:` values, removes
non-letter characters, then resolves the normalized value through
`typeAliases`. The current parser maps `video`, `virtual`, and
`virtualinterview`, but not `online` or `onlineinterview`, so
`Interview Type: Online interview` currently yields `null`. The sync worker
already passes a valid extracted type into `detected_interview_type` and the
matched application's `interview_type` update. Existing update helpers and
SQL coalescing preserve saved type values when extraction is null.

## Scope and restrictions

- Make the smallest parser change, adding the online aliases to `Video`.
- Extend focused parser tests for all supported explicit labels, both
  `Online interview` and `Virtual interview`, unrecognized/missing values, and
  conflicting values.
- Add a focused Gmail sync regression proving `Online interview` reaches the
  correct matched application's saved `interview_type`; ensure an
  unrecognized value preserves an existing valid type.
- Do not modify date/time parsing, regular expressions, helpers, timezone
  handling, persistence, update rules, schemas, or any unrelated code.
- Preserve existing behavior for valid extracted types and absent/invalid
  types. Add no dependencies.

## Validation

- Demonstrate the parser regression before the fix, then run
  `node --test test/gmail-parser.test.js test/gmail-sync.test.js` from `server`.
- Run the full backend suite with `npm test` from `server`.
- Review the final diff and confirm no date/time parsing or persistence code
  changed. Do not deploy, commit, or push.
