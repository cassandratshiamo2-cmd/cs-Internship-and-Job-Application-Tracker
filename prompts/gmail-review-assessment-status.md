# ApplyFlow Gmail Review: Correct Assessment Status

## Objective

Fix the Gmail email-review workflow so an assessment invitation such as
`Assessment Invitation – Test Company Alpha` is detected as `Assessment`, and
using **Apply Status** for the selected Test Company Alpha application persists
that status rather than leaving it at `Applied`.

## Findings from the current trace

- Gmail message parsing in `server/gmail-sync.js` extracts the subject and body,
  but `processMessage` passes the email to `classifyApplicationEmail` before it
  is stored for review.
- `server/gmail-parser.js` currently classifies only `text`; its `subject`
  argument is not included in the searchable content. Thus an assessment
  invitation indicated by the subject can be missed. If the body contains a
  generic application-received phrase, that may be classified as `Applied`.
- The frontend displays the persisted `detected_status` and posts the chosen
  `applicationId` to `/api/gmail/review/:messageId`.
- `server/gmail-routes.js` applies the review item’s stored `detected_status`
  to the selected application in a transaction. When that stored value is
  `Applied` and the existing application is already `Applied`, the route takes
  its already-up-to-date path; it is not the source of the incorrect
  classification.
- Preserve the existing requirement that a status-like subject by itself is
  not enough proof of an application outcome. Use meaningful email-body
  evidence and subject context to identify assessment invitations without
  allowing newsletters or generic application confirmations to become
  assessments.

## Implementation requirements

1. Make a small, shared classification change in `server/gmail-parser.js` (and
   its caller only if needed) so assessment invitations are recognized from
   supported recruitment wording across subject and body, including the
   subject `Assessment Invitation – Test Company Alpha`.
2. Ensure an explicit assessment-invitation signal takes precedence over a
   generic `Applied` confirmation when both occur in the same message.
3. Do not classify a message from its subject alone. Keep existing unrelated
   newsletter/job-alert handling and other status rules intact.
4. Preserve manual selection semantics: the authenticated review endpoint must
   update only the selected application belonging to the signed-in user, and
   atomically persist the application status plus the review-history outcome,
   application link, previous status, and new status.
5. Preserve existing notification behavior and avoid duplicate notifications
   or duplicate application records. Do not alter Gmail connection/auth setup,
   schema, production data, environment files, or deployment settings.
6. Add regression tests that demonstrate:
   - an assessment invitation with the reported subject and relevant body is
     detected as `Assessment`, including when a generic application-received
     phrase also appears;
   - a subject-only assessment invitation with irrelevant body text is not
     treated as a confirmed outcome;
   - an authenticated manual-review request applies `Assessment` to the
     explicitly selected Test Company Alpha application, leaves other
     applications unchanged, and records `Assessment` in review history;
   - the existing status-update/notification behavior remains correct.

## Validation

- Run the focused parser and Gmail route tests, then the full backend test suite
  if practical.
- Run `git diff --check`.
- Report exact files changed and actual check results. Do not claim production
  verification; no live Gmail or production database access is part of this
  change.
