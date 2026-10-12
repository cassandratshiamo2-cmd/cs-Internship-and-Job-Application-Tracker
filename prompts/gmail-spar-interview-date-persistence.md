# Fix Gmail interview date/time extraction and persistence

## Objective

Fix and regression-test the Gmail interview date/time flow for all applications, using the reported Spar interview email as a concrete case. Keep the existing Gmail OAuth integration, confident matching, ownership checks, review flow, stale-email safeguards, status transitions, duplicate protection, and reminder scheduling intact.

## Investigation findings

- Gmail messages are fetched in raw MIME form and parsed by `mailparser`; `fetchMessage` returns parsed subject, text, and HTML.
- `processMessage` classifies the message, matches it against applications scoped to the connected user, and calls `extractInterviewDetails` for Interview messages.
- `recordMessage` stores extracted values on `gmail_processed_messages`, then conditionally updates interview fields on the matched `applications` row within the existing transaction and stale/status guards.
- The Gmail history API returns both detected and saved application interview fields; Application Details and Interviews read saved values through the application API.
- In the current branch, a direct parser/MIME probe of `You are invited for an interview at Spar on 13 October 2026 at 08:30` returns the requested date and time. This exact input must still be protected by an end-to-end sync regression.
- A related common form, `October 13, 2026, at 8:30 AM`, currently parses the date but loses the time because the time suffix matcher treats the comma as the full separator and does not allow the following `at`.
- Existing sync coverage asserts the application date/time in one fixture but does not assert that the persisted processed-history detected date/time match the extracted and saved values.

## Work requested

1. Extend reusable date/time extraction to support both the exact Spar wording and common variants, including optional comma-plus-`at`, without loosening the date-association rules or guessing missing values.
2. Add parser regressions for:
   - `You are invited for an interview at Spar on 13 October 2026 at 08:30`
   - `13 October 2026 at 08:30`
   - `October 13, 2026, at 8:30 AM`
   - An explicit no-time case, which must continue to return no time.
3. Extend the Gmail sync integration test to assert extracted date/time in the processed-message history record as well as values persisted on the confidently matched application. Verify an unrelated application is unchanged and missing interview type/location/meeting URL remain unset.
4. Preserve existing behavior when the email omits interview details; do not overwrite existing values with null or ambiguous extractions.
5. Update documentation only if necessary to describe the resulting behavior. Do not add environment variables, change OAuth configuration, alter unrelated features, or modify Gmail 404 handling.

## Validation

- Run all backend tests with `npm test` from `server`.
- Run frontend lint and production build from `client/my-app`.
- Check `git diff --check`.
- Do not commit, push, merge, or deploy.
