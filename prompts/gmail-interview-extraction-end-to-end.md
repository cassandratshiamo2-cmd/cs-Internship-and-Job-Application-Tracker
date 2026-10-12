# Generic Gmail interview-detail extraction and persistence

## Findings from the current implementation

- Gmail messages are fetched as raw MIME in `server/gmail-sync.js` and passed through
  `mailparser`; sync retains `parsed.text` and uses the message body for classification,
  matching, and extraction.
- Interview classification and application matching are separate. The matcher already
  uses message company/role evidence, sender evidence, a confidence threshold, and a
  uniqueness gap; keep those checks and connected-user scoping intact.
- `extractInterviewDateTime` currently accepts several date/time formats, but dates are
  only accepted when the text immediately before them matches a narrow set of explicit
  phrases such as “interview scheduled for/on”. The example “invited for an interview
  at Spar on 13 October 2026 at 08:30” does not match that association rule, so the
  email may be classified as Interview while its schedule remains empty.
- `extractInterviewType` only returns explicitly supported types. Do not infer
  In-person from wording such as “at Spar”.
- The database has no interviews table. `applications` already stores nullable
  `interview_date`, `interview_time`, `interview_type`, and `interview_location`.
  Gmail sync persists date/time/type, but does not extract or write location.
- There is no application meeting-URL field. `application_link` is the job posting
  link, and `interview_email` is the notification recipient; do not reuse either for a
  meeting URL.
- Gmail processed-message rows retain only detected interview date/time/type. Review
  application currently has access to those fields only, preventing an uncertain match
  from presenting and applying a location or meeting URL.
- Application GET/list responses already serialize the saved interview fields. The
  Application Details and Interviews pages show date/time/type and conditionally show
  location only for `In-person`; neither shows a meeting URL. The dashboard reads
  application status/counts. Notification reminders are scheduled from application
  date/time, and the existing sync path reschedules them after updates.
- The server applies updates inside a transaction, scopes applications by user,
  preserves populated interview fields when extraction is empty, requires a unique
  match, and checks stale timestamps. Preserve these protections and Gmail 404 handling.
- The frontend package has lint/build scripts but no frontend test runner. Server tests
  use `node:test`.

## Implementation objective

Make the smallest complete, reusable end-to-end improvement for all supported email
formats and users. Do not hardcode any company, subject, date, address, or application
ID. Do not add a separate interviews table.

### Extraction and normalization

1. Extend the existing parser in `server/gmail-parser.js` with conservative, reusable
   extraction for interview schedule, explicitly stated type, physical address/location,
   and meeting URL.
2. Support existing formats plus the natural invitation pattern “invited for an
   interview at [company] on [date] at [time]”, date forms `13 October 2026`,
   `October 13, 2026`, and `2026-10-13`, and times `08:30`, `8:30 AM`, and `14:00`.
   Handle plain-text and HTML MIME conversion and common line breaks/signatures/
   quoted content without extracting unrelated dates or times.
3. Only return date/time/type/location/link when explicit and unambiguous. Never infer
   an interview type or fabricate a location/link. A valid date may be retained when
   its time is absent; ambiguous or unsupported values remain unset and are surfaced
   for confirmation.
4. Normalize dates and times to the existing SAST/Africa-Johannesburg storage contract.
   Validate values before parameterized database writes. Do not include email body or
   credentials in logs.

### Persistence, review, and API

1. Keep `applications` as the interview record. Preserve existing location storage and
   add only the nullable meeting-URL column the current schema lacks, using the
   repository's idempotent `ensureDatabase()` migration convention. Document how
   startup applies it; do not create a duplicate interview table.
2. Persist extracted location and meeting URL on confidently matched applications.
   Preserve existing values when an email omits a field. For an unambiguous later
   reschedule, update only explicitly extracted changed values and update reminder
   scheduling through the existing helper. Do not create duplicate reminder/status
   notifications on repeat sync.
3. Retain extracted location and meeting URL on processed Gmail rows so manual-review
   actions can show and apply the proposed details. Extend the authenticated review
   and history API shapes accordingly. Continue requiring the user to select an
   application when the automatic match is uncertain.
4. Ensure application list/detail APIs serialize the saved meeting URL and current
   interview fields without date/timezone shifts. Do not conflate the meeting URL with
   `applicationLink` or notification `interviewEmail`.
5. Validate review-queue/UI exposure of extracted details and keep status transition,
   stale-message, retry, ownership, transaction, and idempotency safeguards unchanged.

### Frontend

1. On Application Details, show Interview Type, Date, Time, Location/Address, and
   Meeting Link with “Not provided” or “Needs confirmation” when absent. Render the
   link safely as an external link. Populate fields from the authenticated server
   response, not transient Gmail UI state.
2. Show saved location/link and missing-field labels on the Interviews page for every
   interview type; do not hide location because type is unknown. Preserve SAST date/
   time presentation.
3. Make extracted review details visible before the user applies a proposed match.
   Keep dashboard counts/status and Notifications behavior consistent with saved
   application data and existing reminders; avoid unrelated UI refactors.

## Regression coverage

Add or extend tests for:

- The Spar invitation: Interview, 13 October 2026, 08:30, company evidence and correct
  unique application update.
- Invitations from multiple different companies, formal and informal wording, and
  all listed date/time formats, including SAST normalization.
- Explicit locations/addresses from body/signature/location sections and meeting
  URLs; absent/ambiguous values remain unset, and “at [company]” does not imply
  In-person.
- Plain text, HTML-only/multipart, line breaks, signatures, quoted replies, unrelated
  dates/times, invalid dates, unrelated recruitment mail, and no invented fields.
- Unique versus ambiguous application matches, cross-user ownership, review preview
  and manual application of extracted details.
- Duplicate message sync, later rescheduling, preservation of missing details,
  reminders without duplicates, and stale email protection.
- API persistence and response fields; frontend output using the existing project
  test capability if possible. Since there is no frontend test runner today, first
  look for a no-new-dependency test approach; do not introduce a test framework unless
  it is necessary and approved by repository conventions.
- Existing Offer, Rejected, Assessment, and Shortlisted classifications and Gmail
  fetch/history 404 behavior.

## Validation and scope constraints

- Run focused parser, matcher, sync, route, and application API tests, then the full
  server test suite.
- Run client lint and production build. Report that the repository currently has no
  frontend test script if that remains true, and describe the exact UI verification.
- Preserve Gmail OAuth/configuration and the existing Gmail 404 handling fix.
- Do not deploy, commit, push, or merge.
- Limit modifications to the parser/sync/review/API/schema data flow, related tests,
  and the interview/application UI surfaces.
