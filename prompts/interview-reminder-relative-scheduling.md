# Interview Reminder Relative Scheduling

## Goal

Change ApplyFlow interview reminders so the existing PostgreSQL-backed notification queue schedules reminders relative to the interview start time, rather than at the interview start time or immediately when an application is marked Interview.

## Existing implementation findings

- `server/server.js` owns `notification_jobs`, the notification worker, `replaceInterviewNotificationJobs`, and `POST /api/notifications/interview`.
- The SQL upsert enforces one row per user/application/notification type/channel, but its sent-job preservation currently depends on an exact `scheduled_for` match.
- `client/my-app/app/applications/new/page.tsx` and `client/my-app/app/applications/[id]/edit/page.tsx` currently construct `scheduledAt` from `new Date(`${interviewDate}T${interviewTime}`).toISOString()`. This interprets the entered date/time in the browser's local timezone before converting it to an absolute timestamp.
- Edit currently calls the scheduling endpoint only when Email is selected; its In-app-only branch cancels the existing backend job instead of replacing/scheduling it.
- `client/my-app/lib/notification-api.ts` sends the timestamp to the existing authenticated endpoint. `client/my-app/app/notifications/page.tsx` reads from the existing queue through `getUserNotifications`.
- The notification list currently returns only jobs with `scheduled_for >= NOW()` and the worker prunes expired jobs. A catch-up job scheduled at the current time must remain visible through the existing in-app list long enough to be read after becoming due.
- Existing working-tree modifications are present in the affected application, notification, type, mock-data, and server files. Preserve them; do not revert or overwrite unrelated changes.

## Required behavior

1. Preserve the existing browser-local interpretation of the user's interview date/time. Convert that local interview instant to an absolute ISO timestamp once, then calculate the reminder from that instant. Do not parse the bare date/time as UTC on the server, introduce another timezone convention, or alter the displayed interview time.
2. For an interview more than 24 hours away, schedule `scheduled_for` exactly 24 hours before the interview.
3. For an upcoming interview less than 24 hours away, schedule exactly one catch-up reminder at the current server/DB time, never at a past timestamp. Its in-app message must say whether the interview is today or tomorrow and include the interview time.
4. For an interview whose instant has passed, do not enqueue a notification. Cancel any stale pending/processing job for that application so it cannot later fire.
5. When an interview's date/time changes, replace its pending job for each selected channel with the newly calculated schedule. Repeated saves for the same interview must not reset an already-sent catch-up reminder or create duplicate jobs.
6. Preserve channel choices: In-app, Email, or both use the same calculated `scheduled_for`. Keep existing email provider configuration, worker, authentication, read/cancel behavior, CRUD, interview type, and database table.
7. Ensure In-app-only edits schedule/replace through the existing endpoint; do not cancel the backend reminder merely because Email was not selected.
8. Ensure a due catch-up In-app job remains visible in the existing notification list after the worker claims/sends it. Make only the minimal retrieval/retention or message-mapping change needed; do not build a second notification system.
9. Calculate/validate the schedule in the existing scheduling path. Do not add duplicate scheduling logic to unrelated routes or trigger scheduling on page load/refresh.

## Scope and implementation notes

- Inspect the related code before editing, including `server/server.js`, `client/my-app/lib/notification-api.ts`, both application forms, shared types, and the notifications page.
- Keep the scheduling decision authoritative in the existing server notification path. The browser must continue to serialize its local interview instant; the server should calculate the 24-hour offset from that absolute instant and compare it against server/DB current time.
- For the less-than-24-hour case, use server/DB current time for the scheduled value so request latency cannot make `scheduled_for` a past timestamp.
- Keep the existing unique key/upsert. Preserve a sent job when the interview date/time is unchanged even if the catch-up request's calculated current time differs; reset/replace it only when the interview schedule actually changes. Preserve read state for an unchanged already-sent job.
- For a past interview, cancel existing pending/processing jobs and return a clear non-scheduled result without treating it as a provider failure.
- For immediate messages, derive today/tomorrow from the user's local interview date without changing the stored/displayed interview time. Ensure the message is represented in the existing notification item, not only an ephemeral generic success string.
- Do not add dependencies or a competing scheduler/timezone abstraction.

## Validation

From the repository root, run:

```powershell
node --check server/server.js
Set-Location client/my-app
npx eslint lib/notification-api.ts app/applications/new/page.tsx 'app/applications/[id]/edit/page.tsx'
npm run build
```

Inspect the final scheduling path and verify these deterministic cases against the calculated timestamp: more than 24 hours away, less than 24 hours but tomorrow, less than 24 hours today, already passed, unchanged repeated save, and edited date/time. Confirm the same schedule is used for In-app and Email and that the entered local interview time is unchanged. Do not commit or push.