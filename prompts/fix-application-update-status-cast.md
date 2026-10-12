# Fix PostgreSQL application update status parameter typing

## Objective

Correct the PostgreSQL error `inconsistent types deduced for parameter $7` in the `PUT /api/applications/:id` handler in `server/server.js`, and add focused regression coverage.

## Investigation findings

- The endpoint's `UPDATE applications` statement uses `$7` for `status = $7`, then compares `$7` to `'Interview'` in the `interview_location` and `interview_meeting_url` CASE expressions.
- PostgreSQL infers a type for each bind parameter consistently across all occurrences. The status assignment and unknown-literal comparisons currently leave incompatible inference contexts.
- The requested fix is to cast status assignment and both CASE comparisons explicitly as `$7::varchar(32)`.
- There is no route-level update test today: application PUT is defined inline in `server.js`; `application-routes.js` currently contains the DELETE handler only.
- The update route already treats interview details as optional location/link fields, checks property presence separately, scopes updates by user ID, preserves other application data, and schedules reminders/status notifications transactionally.

## Implementation requirements

1. Add the explicit `VARCHAR(32)` cast at all three `$7` usages in the update query, and nowhere unrelated.
2. Add regression coverage for an update to Interview status that supplies interview date, time, and type; verifies location and meeting link can be updated when supplied; and confirms unrelated application fields are preserved.
3. Preserve behavior when location or meeting link is omitted from the update body. Do not touch the database destructively or modify credentials, OAuth, or unrelated features.
4. Keep the test appropriately scoped and avoid broad refactoring solely to make the inline route testable. A focused SQL/parameter regression is acceptable if it exercises the actual update statement and bound parameters.

## Validation

- Run the backend test suite (`npm test` from `server`).
- Run frontend lint (`npm run lint` from `client/my-app`).
- Run `git diff --check`.
- Do not commit, push, merge, or deploy.
