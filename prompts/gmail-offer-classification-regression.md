# Gmail offer classification regression

## Context and root cause

Trace the current Gmail flow without changing its existing retrieval, 404 handling,
application matching, or database safety behavior. Gmail messages are fetched as raw
MIME in `server/gmail-sync.js`, parsed into `subject` and `text`, passed through
`classifyApplicationEmail`, matched against the connected user's applications, and
persisted transactionally. The supplied test message currently produces no detected
status: the Offer rules inspect the message body, but do not recognize “you are offered
a position”; “Job offer” in the subject is intentionally insufficient by itself.
Consequently, no Offer reaches application matching or the guarded status update.

## Required implementation

1. Add a narrowly scoped Offer classification pattern in `server/gmail-parser.js` for
   wording that explicitly says the recipient is offered a position/role/job, including
   “you are offered a position”. Keep the current body-context requirement so an Offer
   subject alone does not classify unrelated mail.
2. Add parser tests in `server/test/gmail-parser.test.js` for the exact subject and body:
   - Subject: `Job offer`
   - Body: `Dear candidate, you are offered a position at Microsoft. Kind regards,
     Microsoft recruitment team`
   Expect `Offer`, and retain a negative case where the subject says `Job offer` but the
   body has no application offer wording.
3. Add end-to-end sync regression coverage in `server/test/gmail-sync.test.js` using a
   raw MIME message and the existing service test harness. When there is one eligible
   Microsoft application (`Full stack developer`, current status `Interview`) plus an
   unrelated competing-company application, assert the email is recorded as updated,
   only the Microsoft application advances to `Offer`, and the processed-message row
   references that Microsoft application.
4. Add a same-company ambiguity case with more than one Microsoft application and no
   role named in the email. Assert the message is sent for review and neither
   application is changed. Do not lower the confidence threshold or weaken candidate
   uniqueness requirements to make this case pass.
5. Preserve and run existing stale-email protections: older email must not override a
   newer application update. Do not modify the Gmail 404 handling or cursor-reset logic.

## Separate 404 investigation

Report the existing distinction, without changing it: a message-fetch 404 is treated as
an unavailable Gmail message only when the Gmail API error reason is `notFound`; other
fetch 404s remain sync failures. A 404 from Gmail history listing is separately treated
as an expired history cursor and triggers the existing initial-sync fallback. Do not
infer the cause of a reported count of 24 unavailable messages from the number alone;
only message-fetch errors carrying the `notFound` reason are counted that way.

## Validation

Run the focused parser, matcher, and sync tests, followed by the complete server test
suite if the focused tests pass. Keep changes limited to the classifier and directly
related tests. Do not commit, push, merge, or deploy.
