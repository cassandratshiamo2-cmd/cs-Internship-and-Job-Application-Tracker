# Interview Reminder SAST Timezone Fix

## Confirmed findings

- Add and edit currently turn the form's local `YYYY-MM-DD` + `HH:mm` into ISO with `new Date(`${date}T${time}`).toISOString()`. That interprets the wall time in the browser/device timezone, not explicitly in `Africa/Johannesburg`.
- `server/interview-reminder-schedule.js` subtracts exactly 24 elapsed hours from its input instant and preserves its instant correctly; its input can be wrong because it comes from browser-local parsing.
- The server's `/api/notifications` selects PostgreSQL `interview_date` as a `DATE` without casting to text. The pg driver returns this as a JavaScript `Date`, so JSON emits a UTC timestamp for midnight rather than a date string. The Notifications page currently renders `notification.date`, not `scheduledFor`, making that raw timestamp look like the reminder time.
- The queue already stores `scheduled_for` and `interview_at` as absolute `TIMESTAMPTZ`; its unique key/upsert, worker, catch-up logic, and sent/unread retention must remain intact.

## Required implementation

1. Use one explicit `Africa/Johannesburg` conversion on the server for each entered interview date/time. Add a small helper in `server/interview-reminder-schedule.js` that converts the validated local date and time to an absolute instant using `Intl.DateTimeFormat` with the IANA zone, without depending on the host timezone or adding a package.
2. Stop generating `interviewAt` with browser `new Date(localDateTime)` in the add/edit forms. Send the original interview date/time fields; have authenticated create/edit routes and the existing notification endpoint call the same server conversion once, then pass that instant to the existing reminder scheduler and queue helper.
3. Keep `calculateInterviewReminderSchedule`'s exact 24-hour subtraction and the current immediate, passed-interview, upsert, worker, authentication, email, queue, and retention behavior unchanged. Store the converted `interview_at` and calculated `scheduled_for` instants in the existing columns. Do not add schema or another scheduler.
4. In `/api/notifications`, return the interview calendar date as `YYYY-MM-DD` text so it cannot serialize as a UTC-midnight ISO timestamp. Continue returning `scheduledFor` as an absolute instant.
5. Display the reminder's `scheduledFor` on the Notifications page using `Intl.DateTimeFormat` with `timeZone: 'Africa/Johannesburg'`; never show raw ISO UTC as the main date. Keep the interview message based on the interview date/time, also as calendar text rather than a JS Date string.
6. Keep client date comparisons used for catch-up wording/past filtering anchored to `Africa/Johannesburg`, not the browser's timezone. Preserve idempotency so repeated saves of an unchanged interview retain the existing sent/unread row.
7. Add deterministic scheduler tests for both October 24-hour cases, the 11:03-to-11:30 SAST immediate case, passed interviews, and unchanged repeated scheduling/unique-row behavior where testable without replacing the DB queue.

## Files in scope

- `client/my-app/app/applications/new/page.tsx`
- `client/my-app/app/applications/[id]/edit/page.tsx`
- `client/my-app/lib/notification-api.ts`
- `client/my-app/app/notifications/page.tsx`
- `client/my-app/lib/types.ts` only if a typed scheduled display field is needed
- `server/server.js`
- `server/interview-reminder-schedule.js`
- `server/test/interview-reminder-schedule.test.js`

Do not modify unrelated application CRUD, auth, interview status/type, worker, queue schema, email provider, or other pages.

## Validation

From repository root:

```powershell
node --check server/server.js
node --test server/test/interview-reminder-schedule.test.js
Set-Location client/my-app
npx eslint .
npm run build
```

Verify the October 2 08:30 SAST instant is `2026-10-02T06:30:00.000Z`, and its reminder is `2026-10-01T06:30:00.000Z`. Also inspect that the October 1 example becomes `2026-09-30T06:30:00.000Z`. Do not commit or push.