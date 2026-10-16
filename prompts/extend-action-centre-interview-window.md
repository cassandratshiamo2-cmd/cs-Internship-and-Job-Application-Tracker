# Extend Dashboard Action Centre Interview Reminder Window

## Objective

Allow valid interviews scheduled within the next 14 calendar days, inclusive,
to produce upcoming-interview recommendations in the existing dashboard
Action Centre.

## Scope

- In `client/my-app/lib/action-centre.ts`, change only the upcoming interview
  day-window boundary from 3 to 14.
- Preserve the existing `Interview` status requirement, valid date parsing,
  date-only calendar-day comparison, and exclusion of past interviews.
- Update `client/my-app/lib/action-centre.test.mjs` using its fixed `today`
  fixture. Verify interviews today, +3, +4, and +14 are included; +15 and past
  dates are excluded; and applications with non-Interview status do not
  generate interview recommendations.
- Do not change any other files, add dependencies, or alter unrelated action
  behavior.

## Validation

- Run the focused action-centre Node test file with the existing Node
  TypeScript-stripping command.
- Run available frontend checks relevant to the change.
- Run `git diff --check` and inspect the final diff.
- Do not stage, commit, push, or deploy.
