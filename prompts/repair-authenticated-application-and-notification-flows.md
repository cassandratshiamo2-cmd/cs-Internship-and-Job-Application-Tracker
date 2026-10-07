# Repair Authenticated Application and Notification Flows

## Context

Inspect the current final working-tree implementation after the dev/stash merge. Keep the change limited to confirmed regressions below. Do not stage, commit, push, reset, or delete the stash. Do not change the database schema or rewrite the reminder scheduler/provider infrastructure.

## Confirmed Issues

1. `server/server.js` registers `/api/register` and `/api/login` twice. Keep one complete route for each endpoint, preserving password hashing, password comparison, JWT behavior, validation, and response shapes.
2. The authenticated applications list reads only local storage. Load the signed-in user's applications from the existing authenticated `GET /api/applications` endpoint; preserve search and filtering. Keep mock storage only for unauthenticated prototype use, and do not silently fall back to mock data after an authenticated API failure.
3. The delete confirmation page only removes applications from local storage. For a signed-in user, load the application from the API and delete it through the existing authenticated `DELETE /api/applications/:id` route. Preserve an unauthenticated mock path if required by existing prototype behavior, and surface API failures without pretending the database row was deleted.
4. The Interviews page always loads and syncs local mock interviews/reminders, even for signed-in users. Keep the PostgreSQL/API-backed application and reminder data authoritative for authenticated users; do not display or generate local mock reminders in that signed-in path. Retain the existing SAST-aware interview status logic and unauthenticated prototype behavior where appropriate.

## Invariants

- Preserve application create/detail/edit/delete behavior and the existing API contracts.
- Preserve `InterviewType` in the UI, types, and API payloads.
- Only `In-app` can be selected for interview reminders. Email is not selectable; SMS is not used.
- Preserve authenticated `/api/notifications` loading, read/unread updates, and the navigation unread badge.
- Preserve the PostgreSQL notification queue, single notification worker, reminder scheduling helper/tests, and `Africa/Johannesburg` timezone handling.
- Preserve generic email/provider support where already used; do not add an email interview-reminder option.
- Do not introduce another authenticated/local reminder scheduler or change server schema.

## Validation

After approval and implementation, run from the repository root:

- `node --check server/server.js`
- `node --test server/test/interview-reminder-schedule.test.js`
- `git diff --check`
- From `client/my-app`, `npm run build`

Do not stage or commit after validation. Report the final `git status` and note that unresolved index entries remain until the user stages the resolved files.
