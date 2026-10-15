# Add a Dashboard Action Centre

## Objective

Add a responsive Action Centre to the existing ApplyFlow dashboard. Use the
application data already loaded by the dashboard for both authenticated users
and guest/demo mode. Preserve the dashboard's existing statistics, recent
applications, progress indicators, and data-loading behavior.

## Scope

- Add a small, typed, pure helper in `client/my-app/lib/` to derive action
  recommendations from `Application[]` and a supplied current date.
- Render the recommendations in `client/my-app/app/dashboard/page.tsx`, using
  existing visual conventions and the existing application-detail route.
- Add focused tests for action thresholds, sorting, malformed/missing dates,
  and the five-action limit. Reuse installed tooling; do not add dependencies.
- Do not change backend/API/database behavior, authentication, mock data, or
  unrelated dashboard sections.

## Recommendation rules

1. Recommend a follow-up only for `Applied`, `Assessment`, or `Shortlisted`
   applications whose application date is at least 7 calendar days ago.
   Elevate its priority at 14 or more days. Do not generate follow-ups for
   other statuses or invalid/future application dates.
2. For `Interview` applications:
   - Recommend an upcoming interview when its valid interview date is today
     through three calendar days from today, inclusive. Show company, position,
     date, and time when the time exists.
   - Never label a past interview as upcoming. For a date before today,
     recommend reviewing the application status.
   - Treat absent or invalid interview dates safely; do not present them as
     upcoming. A separate recommendation to confirm interview details is
     acceptable if clearly distinguished from an upcoming reminder.
3. Recommend that users review opportunities for `Saved` applications, at a
   lower priority than urgent follow-ups and upcoming interviews.
4. Sort actions deterministically so urgent follow-ups and upcoming interviews
   rank ahead of ordinary follow-ups and saved-opportunity reminders. Show no
   more than five actions. Provide a useful empty state when there are none.
5. Each action must include company, position, reason, and priority, and link
   to that application's existing detail page. Use no fabricated records or
   claims about employer responses/Gmail.

## Date handling

Use calendar-day arithmetic that is stable across time zones for date-only
application and interview values. Validate date-only strings and reject
invalid dates. Handle missing company/position/time fields without throwing.
For interview display, avoid shifting a date-only value due to UTC/local
timezone conversion.

## Validation

- Add focused tests using Node's built-in test runner and the installed Node
  TypeScript-stripping support, or the repository's existing test tooling if
  one is available. Do not install packages.
- Cover the 6/7/13/14-day follow-up boundaries, excluded statuses, interview
  dates today/+3/+4/past/missing/invalid, optional interview time, action
  ordering and five-item cap, and empty results.
- Run the frontend lint and production build from `client/my-app`.
- Keep the change limited to the helper, dashboard, focused test file, and this
  prompt. Do not deploy.
