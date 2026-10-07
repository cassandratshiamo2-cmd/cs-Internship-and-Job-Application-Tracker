# Remove Email Interview Reminder Option

## Scope

Remove Email as a selectable interview reminder channel and prevent the existing interview scheduling routes from creating Email jobs. Keep the existing In-app queue, worker, Email provider/worker code, `notification_jobs` table, and its `('Email', 'In-app')` constraint unchanged. Do not add SMS, endpoints, or schema changes.

## Inspected implementation

- `client/my-app/app/applications/new/page.tsx` shows In-app and Email checkboxes, validates a reminder email, and sends selected channels.
- `client/my-app/app/applications/[id]/edit/page.tsx` has the same Email checkbox and validation.
- `client/my-app/lib/types.ts` defines `NotificationChannel` as `"In-app" | "Email"`.
- `client/my-app/lib/mock-data.ts` includes a default interview with both channels selected.
- `client/my-app/lib/notification-api.ts` currently forwards both channel values to the existing endpoint.
- `server/server.js` normalizes both channel values, validates an email recipient, and its existing queue upsert creates one job per normalized channel. The generic worker still supports Email jobs. The database schema/check constraint also allows Email and In-app.
- The navigation unread badge already counts exactly sent and unread items; no changes are needed there.

## Planned focused changes

1. `client/my-app/app/applications/new/page.tsx`: expose only In-app, remove the interview-email reminder field/validation, and submit only In-app for new interview reminders.
2. `client/my-app/app/applications/[id]/edit/page.tsx`: expose only In-app, remove the email-reminder field/validation, and submit only In-app when editing an interview.
3. `client/my-app/lib/types.ts`: narrow the supported interview reminder channel type to In-app.
4. `client/my-app/lib/mock-data.ts`: update the default interview sample to In-app only.
5. `client/my-app/lib/notification-api.ts`: allow only In-app in the existing interview reminder client helper; preserve the shared notification state, read helper, badge, and Email result compatibility as appropriate.
6. `server/server.js`: constrain the existing interview-reminder normalization/validation path to In-app only, so stale or crafted requests cannot create Email jobs. Preserve the Email sender and worker handling for existing jobs, and leave the database channel constraint untouched.

Do not change scheduling calculation, SAST conversion, worker, cleanup/read behavior, badge logic, auth, application CRUD, or interview type.

## Validation

Run `node --check server/server.js`, `node --test server/test/interview-reminder-schedule.test.js`, ESLint on changed files, and `npm run build` from `client/my-app`. Inspect that `normalizeNotificationChannels` produces only In-app for the interview flow and that no reminder path inserts Email jobs. Do not commit or push.