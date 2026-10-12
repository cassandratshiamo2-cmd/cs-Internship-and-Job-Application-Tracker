# Prevent Pnet Promotional Offers from Updating Application Status

## Objective

Fix the reviewed false-positive path where Pnet job-alert copy describing
recommended vacancies can be treated as an Offer for a matching saved
application.

## Confirmed path

1. `classifyApplicationEmail` initially identifies a Pnet job alert and marks
   it ignored.
2. `processMessage` in `gmail-sync.js` finds a strong company/position match
   and checks a broad `hasTransactionalApplicationContext` expression.
3. The phrase "your application profile matches ... and we are pleased to
   offer you access to these recommended roles" passes that context check.
4. Reclassification with `allowGenericJobAlert: true` recognizes
   "pleased to offer you" as Offer, after which normal safe matching and
   `recordMessage` can update the application and create a status notification.

## Scope

- Make the Pnet job-alert exception require explicit application-outcome
  evidence, not merely a nearby mention of "your application" and a status word
  elsewhere in the same sentence.
- Keep generic Pnet alerts/newsletters ignored, including the exact wording:
  "Your application profile matches Shoprite Cashier vacancies, and we are
  pleased to offer you access to these recommended roles and interview tips."
- Preserve genuine transactional Pnet interview, rejection, and offer messages,
  with confidence/unique-match checks unchanged. Do not disable all Pnet mail
  or rely on sender alone.
- Add parser regression coverage for the promotional wording and retain/add
  transactional controls. Add an end-to-end mocked sync test using the exact
  wording and a matching Shoprite/Cashier application; assert ignored or
  review, unchanged status, zero application updates, and zero status-change
  notifications.
- Keep the patch focused in parser/sync logic and their tests. Do not touch
  OAuth, database schema, frontend, notifications, deployment settings, or
  unrelated features.

## Safety and validation

- Do not inspect `.env`, access Gmail or production databases, change live
  records, or commit/push/merge/deploy.
- Run focused parser and sync tests, full backend tests, frontend lint/build if
  relevant, and `git diff --check`.
- Report exact counts/results and state that production behavior was not
  verified.
