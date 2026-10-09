# Delete Application Notifications Safely

## Objective

When an authenticated user deletes an application, atomically remove all
notification jobs belonging to that application and user. Prevent the
notification worker from delivering a job after its application has already
been deleted.

## Constraints

- Preserve the existing user-scoped application deletion and all other
  application behavior.
- Do not change schema, Gmail processing/history, authentication, or UI.
- Do not delete notification rows for another application or user.
- Use one database transaction for the application and notification-row
  deletion. Roll back when either operation fails.
- Keep worker claims safe and skip/cancel jobs whose application or active
  claim no longer exists before contacting a notification provider.

## Tests and validation

- Verify successful deletion removes the target application's notification
  rows, preserves unrelated applications' rows, and never removes another
  user's rows.
- Verify application deletion failure or notification cleanup failure rolls
  back the transaction.
- Verify a missing/deleted application prevents delivery of an already-claimed
  notification job.
- Run the full backend test suite, relevant frontend checks, and
  `git diff --check`.
- Do not alter production data or deploy.
