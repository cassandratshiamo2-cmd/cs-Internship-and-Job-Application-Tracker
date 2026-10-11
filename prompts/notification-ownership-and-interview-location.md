# Notification Ownership Isolation and Interview Location

## Scope

Implement backend-enforced notification/application ownership isolation, add tests for
cross-user notification isolation and Gmail application matching, and add a persisted
interview location field to the authenticated application create/edit/detail and Interviews
surfaces. Preserve existing Gmail OAuth, notification worker, application behavior,
reminder scheduling, design, and SAST handling.

## Investigation findings and data safety

- Gmail sync currently loads matching candidates with
  `SELECT ... FROM applications WHERE user_id = connection.user_id`, then locks/updates
  the matched application with the same owner predicate. Gmail processed records also use
  the connection's user ID. Preserve and test this tenant boundary.
- Authenticated notification listing and read-state updates currently filter using
  `req.user.id`; reminder scheduling also carries a user ID. Strengthen notification reads
  and creation to verify their referenced application has the same user, without changing
  intentional background-worker processing.
- The notification table does not enforce that a notification's owner matches the linked
  application's owner. Make notification reads ignore mismatched-owner linked records and
  make creation require a matching owner/application pair.
- A read-only audit of application 29 was attempted using the configured server database
  connection, but PostgreSQL rejected authentication (error 28P01). No application,
  notification, status, or other database record was read or changed. Do not delete the
  Nova application or notification or change its status without a successful ownership and
  Gmail-processing audit and reliable evidence for the prior status. Report this limitation
  and the database audit query/commands needed after valid credentials are configured.
- Do not emit OAuth tokens or message contents in logs or test output.

## Implementation

1. Add nullable `interview_location TEXT` to the `applications` schema using the existing
   startup schema update mechanism so databases with existing application tables migrate
   safely.
2. Read and return the location in authenticated application list/detail/create/update
   responses. Persist it on create and update. Preserve an existing location when an older
   or unrelated update omits the field; clear it only when the application exits the
   Interview state or the user explicitly supplies an empty value.
3. Add an optional `interviewLocation` property to the frontend Application type and include
   it in both create and edit payloads where appropriate. Show a multiline
   “Interview Location / Address” input only when the interview type is In-person. Load
   stored values in edit mode. Empty address is valid, including when an in-person location
   has not been confirmed.
4. Show a saved location in the Interviews page and application detail page. For in-person
   interviews without a saved location, display that the location is not confirmed rather
   than inventing an address.
5. Keep phone/video/non-physical interviews optional for location, preserve dates, times,
   interview types, reminders, and Africa/Johannesburg time handling.
6. Strengthen authenticated notification list/read queries and notification creation so a
   linked application must belong to the same authenticated/notification user. Keep every
   read, write, cancellation, and update scoped to its user. Preserve the background worker
   design and its existing deliverability guard.
7. Retain Gmail matching's connection-owner application query and add service-level coverage
   that includes another user's similarly named application and proves it is neither
   matched nor updated nor notified.
8. Add or extend route/service tests to prove a user cannot see or change another user's
   notification, notification creation rejects a cross-owner application, and Gmail
   matching sees only applications belonging to the connected ApplyFlow user.

## Validation

- Run focused server tests, then the full server suite if the focused tests pass.
- Run frontend lint and the Next.js build.
- Do not change dependencies.
- Report every changed file, tests/commands and results, and the exact live-data audit status.
