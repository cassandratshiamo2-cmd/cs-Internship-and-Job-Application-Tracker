# Fix Interview Date-Only Serialization

## Confirmed cause

The authenticated Applications API converts PostgreSQL `DATE` fields with `Date.toISOString().slice(0, 10)`. On this machine the Node runtime timezone is `Africa/Johannesburg`; the PostgreSQL DATE parser represents `2026-10-02` as local midnight SAST, and ISO conversion yields `2026-10-01`. The Interviews page therefore displays the prior day. The notification API selects `notification_jobs.interview_date::text`, so its message is the stored date; the `Reminder:` label is `scheduled_for`, the reminder fire time (normally 24 hours before the interview).

## Scoped repair

Fix only interview-date response serialization in `server/server.js` so PostgreSQL DATE values remain date-only and do not pass through UTC ISO conversion. Cover the applications list, shared application serializer, and create response. Do not change stored dates, schema, notification message generation, reminder scheduling, or unrelated application-date fields. Preserve `Africa/Johannesburg` handling and email/provider behavior.

This will align the Interviews page with the backend's stored interview date; for the reported data it will display October 2, matching the notification message, while the October 1 reminder time remains the 24-hour lead time.

## Validation

Run `node --check server/server.js`, `node --test server/test/interview-reminder-schedule.test.js`, `git diff --check`, and `npm run build` from `client/my-app`. Do not stage or commit.
