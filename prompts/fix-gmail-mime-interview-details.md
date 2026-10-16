# Fix Gmail interview detail extraction across MIME alternatives

## Objective

Permanently fix Gmail interview date/time extraction when a multipart message contains a minimal `text/plain` alternative and the actual interview details in `text/html`. Reproduce the issue with the reported DataWave Technologies invitation, preserve the date/time safety behavior, and verify extracted details survive Gmail sync and manual review persistence. Do not deploy.

## Evidence and root cause

- `server/gmail-sync.js` fetches raw Gmail messages and parses them with `mailparser`. `fetchMessage` stores the parser's plain-text alternative in `email.text` and the HTML alternative in `email.html`.
- `processMessage` successfully classifies interview status from the subject/plain text, then calls `extractInterviewDetails(email)`.
- In `server/gmail-parser.js`, date/time, interview type, and location extraction currently read `subject` and `text` only. Only meeting-link extraction examines `html`.
- Reproduction using `simpleParser` and a multipart/alternative fixture: `text/plain` says only “You are invited to an interview at DataWave Technologies for the Graduate Data Analyst position.”; `text/html` contains the requested date (22 October 2026), time (11:00 AM), type (Video Interview), and Google Meet link. Current behavior classifies `Interview`, but `interviewDate` and `interviewTime` are null.
- The direct plain-text version already yields `2026-10-22` and `11:00`, so the bug must be fixed and regression-tested through the MIME alternate-body path; do not claim the direct plain-text date/time behavior was broken.
- The explicit type parser normalizes “Video Interview” to `videointerview`, which is not currently a supported alias.
- Sync persists extracted values in `gmail_processed_messages`, and its transactional application update uses those values. Review routes likewise read the detected values and persist them to the application. Verify those paths rather than making unrelated route/schema changes.

## Scope

Inspect and modify only the relevant existing Gmail parser/sync and test files, unless the investigation demonstrates another tightly coupled path must change:

- `server/gmail-parser.js`
- `server/gmail-sync.js` only if a parser-level change cannot consume the already-retained HTML body
- `server/test/gmail-parser.test.js`
- `server/test/gmail-sync.test.js`
- `server/test/gmail-routes.test.js` only if an additional review-persistence regression is needed

Do not modify `server/gmail-parser.js.backup`, any generated docs, environment variables, database/schema, application design, OAuth settings, or deployment configuration. Preserve existing user work. Do not deploy.

## Implementation requirements

1. Add a regression test that fails before the fix and passes after it. The test must use the exact sample values:
   - Subject: `Interview Invitation – Graduate Data Analyst – DataWave Technologies`
   - Company: `DataWave Technologies`
   - Position: `Graduate Data Analyst`
   - Date: `22 October 2026`
   - Time: `11:00 AM`
   - Interview Type: `Video Interview`
   - Meeting Link: `https://meet.google.com/xyz-abcd-efg`
2. Cover standalone plain text, HTML, and a decoded multipart MIME message where the plain-text fallback does not contain the schedule but the HTML body does. Preserve quoted-message filtering, date/time ambiguity handling, timezone behavior, and the rule against inventing missing fields.
3. Accept `Video Interview` as the explicit `Video` type without making incompatible or ambiguous interview types appear certain.
4. Cover supported date/time formats and missing date/time/type/link fields. Preserve nulls for genuinely missing or ambiguous details.
5. Add a Gmail sync persistence regression that verifies the detected values are saved to the processed-message record and the matched application; include manual review/application update coverage if needed to establish that route's persistence.
6. Do not broaden Gmail classification or matching unnecessarily. Reuse existing parser helpers and keep changes surgical.

## Validation and completion

- First run the new focused regression before the implementation to confirm it fails for the MIME issue, then implement the fix and verify it passes.
- Run focused parser, sync, and review route tests; then run the complete server test suite.
- Review the final diff and verify no deployment occurred and no files outside the approved source/test scope were changed (leave prior untracked docs and the backup untouched).
- Report the precise root cause, files changed, exact test commands/results, any remaining limitations, and explicitly state that no deployment was performed.
