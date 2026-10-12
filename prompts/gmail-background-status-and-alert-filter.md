# Improve Gmail Background Sync Visibility and Alert Filtering

## Goal

Address the locally verified Gmail observability and newsletter-filter boundaries
without connecting to Gmail, a database, or Render.

## Approved scope

- Keep backend sync attempt/success timestamp meanings and the existing worker
  lease and polling design.
- Make the Gmail status API request explicitly non-cacheable on the client.
- Refresh only the authenticated Gmail connection status periodically while the
  Gmail page is open/visible and a Gmail account is connected. Avoid reloading
  review/history/application datasets or showing false failures for transient
  polling errors. Ensure polling is cleaned up on unmount and hidden tabs do not
  poll continuously.
- Ensure generic job-alert/newsletter classification does not interpret status
  phrases in newsletter content as application outcomes. Preserve genuine
  transactional application emails, including explicit application-specific
  messages from Pnet/LinkedIn, and preserve safe matching/review behavior.
- Add deterministic mock-based regression tests for generic Pnet/newsletter
  bodies containing status language and for genuine transactional Pnet
  outcomes, plus any status-polling utility behavior supported by the current
  test setup.
- Do not change application matching confidence, database schema, worker
  cadence, notification behavior, OAuth settings, deployment configuration, or
  unrelated features.

## Constraints

- Do not read `.env`, contact Gmail, access a database or production data, use
  Render, or change real application statuses.
- Keep all changes uncommitted; do not push, merge, or deploy.

## Validation

Run Gmail parser, matcher, sync, and route tests; relevant client tests; frontend
lint/build if client implementation changes; and `git diff --check`. Report
exact test output and leave actual Render background execution as unverified.
