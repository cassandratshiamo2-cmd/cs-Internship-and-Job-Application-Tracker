# Notification cleanup and email delivery fix

## Goal
Finish the remaining notification-only cleanup for ApplyFlow without changing unrelated application or auth flows. The work must keep the Add Application flow intact, remove active SMS handling, preserve In-app and Email delivery only, and ensure email is sent from the backend through Resend rather than directly from the frontend.

## Scope
- Remove SMS from all active frontend and backend notification logic.
- Keep notification channels limited to `In-app` and `Email`.
- Preserve the existing Add Application / Edit Application flows unless a change is required to avoid invalid SMS-related behavior.
- Keep the backend and frontend separated as required by the project architecture.
- Do not add database or production auth work beyond what is already in scope.
- Ensure notifications remain mock-data-free on the frontend and fetch from the authenticated backend route.

## Required behavior
1. Frontend:
   - `NotificationChannel` must only allow `In-app` and `Email`.
   - Checkbox options in interview reminder forms must not include SMS.
   - Notification API helper must filter to only supported channels and avoid any SMS-specific handling.
   - Notifications page should continue to load from `GET /api/notifications` with the user token.

2. Backend:
   - Remove active SMS support from the notification worker and route validation.
   - `notification_jobs.channel` validation should allow only `Email` and `In-app`.
   - Any legacy SMS rows should be ignored or cancelled safely without breaking existing data.
   - Backend email delivery must remain handled through Resend with environment variables only.
   - No secrets or credentials should be committed to the repository.

3. Requested product rule:
   - “Email must be sent from the backend, not directly from the frontend.”
   - “Do not claim email works unless it was actually tested.”

## Non-goals
- Do not redesign unrelated dashboard or auth behavior.
- Do not change the Add Application creation flow beyond necessary validation updates.
- Do not introduce or enable a real backend/API beyond the existing Express notification routes.
- Do not add SMS, Twilio, or phone-based notification features back in.

## Validation
Run the relevant checks after the patch:
- Frontend build: `cd client/my-app && npm run build`
- Node syntax check for the backend: `cd server && node --check server.js`
- If available, review the git diff for stray SMS references and credential exposure.

## Success criteria
- No active SMS references remain in the active user-facing notification workflow.
- Only In-app and Email remain in the notification channel model.
- Email is fired by the backend using Resend environment variables.
- Existing Add Application behavior remains intact except for necessary validation updates.
- Verification is based on actual commands and results, not assumptions.
