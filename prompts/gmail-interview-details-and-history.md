# Gmail Interview Details and Processed History

## Goal

Fix Gmail interview handling so an interview invitation updates the matched application with its interview date and time, preserves an existing interview type unless the email explicitly supplies one, and leaves a visible record of successfully processed emails on the Gmail page.

## Exact regression case

Email subject: `INTERVIEW INVITATION`

Email body: `YOU ARE INVITED TO AN INTERVIEW ON THE 09 OCTOBER 2026 AT 08:30`

Expected matched Shoprite application: status `Interview`, interview date `2026-10-09`, and interview time `08:30`. Keep the stored values in ApplyFlow's current date/time format and its existing SAST/Africa/Johannesburg interpretation; do not introduce browser-local timezone conversion.

## Implementation scope

- Fix the parser's explicit interview-date association so the exact wording above extracts both date and time while unrelated dates remain ignored.
- Extract supported explicit interview types (Phone, Video, In-person, Technical, Panel, and the existing supported `Other` value where explicit). Never replace an already-saved application type. If the email gives no type, preserve the current value, including `Not specified`/NULL.
- Update automatic Gmail sync application writes to preserve existing transition safety, fill missing interview fields, and record the extracted type when appropriate. Keep review/manual processing consistent where detected interview details are applied.
- Add an authenticated processed-history API using the existing `gmail_processed_messages` records and display auto-applied/reviewed results on the Gmail page, including matched application and extracted status/date/time/type where available. Keep the existing review queue and its actions intact.
- Add targeted parser and sync/history tests, including the exact supplied email and resulting Shoprite application fields.
- Do not modify OAuth credentials or `GMAIL_TOKEN_ENCRYPTION_KEY`; preserve OAuth, sync, matching, status transitions, quota protection, advisory locking, and cooldown behavior.

## Verification

- Run `npm test` from `server/` and report the exact passing test count/results.
- Run `npm run build` from `client/my-app/` and report the result.
- Inspect the final diff for changes limited to Gmail parser/sync/routes/schema, related tests, frontend Gmail API/page, and this prompt.