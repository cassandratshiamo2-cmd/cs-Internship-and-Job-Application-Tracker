# Resolve Dev and Stashed ApplyFlow Work

## Current state

- Current branch: `dev`, tracking `origin/dev`.
- `git stash pop` left ten unmerged paths and untracked stashed content under `prompts/`, `server/interview-reminder-schedule.js`, and `server/test/`.
- Preserve the current `dev` stage and stashed stage. Do not reset, checkout either side wholesale, drop the stash, or overwrite the untracked files.
- Resolve the ten unmerged files only; mark those conflict paths resolved in the index after validating. Do not commit or push.

## Confirmed branch differences

- Dev's `server/server.js` contains health, register, and login routes but no application CRUD or notification queue routes. The stashed server adds authenticated application CRUD, interview reminder endpoints/worker, SAST conversion, and notification read behavior. Merge these capabilities into one server and retain one register/login implementation, health route, error handling, and compatible CORS behavior.
- Dev's `mock-data.ts` contains local Interviews and local Notifications storage/synchronization, while the stash adds application/auth local storage helpers. Merge the exports and models instead of replacing either data path.
- Dev's Interviews page renders its separate `Interview` model and dev-generated reminder summary. The stash's version loads application records with status Interview and interview date/time, including interview type and SAST status calculation. Render/preserve both sets without manufacturing duplicate records.
- Dev's Notifications page uses local notifications; the stash adds the authenticated queue-backed shared state, SAST display, and read action. Keep authenticated backend state as source for logged-in users and preserve the dev local behavior as appropriate for no-token/local sessions; do not count scheduled/pending queue rows as unread.
- Dev's AppShell has its existing user label/nav and logout behavior; the stash adds responsive mobile nav, auth token cleanup, and API-backed unread badge. Combine them and preserve the exact badge rule `status === 'sent' && read === false`.
- Dev's type model and forms are simpler. Retain its supported application type/status/work-arrangement behavior while integrating stashed application links, interview date/time/type, notification channel type, and authenticated save/fetch flows.
- Dev deletes `client/my-app/lib/notification-api.ts`; the stashed version is an added shared API module and must be retained for the queue-backed reminders and badge/read state.
- The stashed scheduler helper/test and all four stashed prompts are untracked and must be preserved. Do not recreate, overwrite, or delete them.

## Resolution approach

1. Resolve `client/my-app/lib/types.ts` as a superset of valid dev and stashed application/interview/notification models. Keep application type `Job`, distinct `Interview` records, notification timestamps/status, and the currently supported In-app-only interview reminder channel.
2. Merge `client/my-app/lib/mock-data.ts` so local auth, application CRUD fallback, and dev interview/local notification functions all remain available without resetting existing browser storage.
3. Resolve Add/Edit/Detail pages and `server/server.js` so authenticated application CRUD, existing dev auth behavior, interview type, SAST conversion, the 24-hour/immediate/passed scheduler, queue upsert, worker, email infrastructure, and read/cleanup behavior remain consistent. Do not introduce another scheduler or notification queue.
4. Resolve AppShell and Notifications so desktop/mobile navigation retains the badge, Notifications can show queue-backed authenticated data and the existing local dev behavior where applicable, and read state remains tied to the existing user-scoped API.
5. Resolve Interviews so dev's distinct `Interview` records and application-derived Interview records remain visible with their existing date/time/type/status information and no client/server hydration mismatch.
6. Remove every conflict marker, retain all stashed untracked prompt/helper/test files, run checks, and use `git add` only for the ten resolved conflict paths to clear their unmerged index state. Do not commit or push.

## Validation

```powershell
node --check server/server.js
node --test server/test/interview-reminder-schedule.test.js
Set-Location client/my-app
npx eslint .
npm run build
```

Also verify no conflict markers remain, `git status --short --branch` still shows `dev`, and all named functionality is present. Report any verification limitation; do not claim browser or database integration tests unless actually run.