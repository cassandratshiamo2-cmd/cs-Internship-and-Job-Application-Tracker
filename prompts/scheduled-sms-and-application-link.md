# Scheduled SMS Notifications and Application Links

## Goal

Fix interview phone reminders so an interview saved for a future time is scheduled for delivery at the interview time, add support for international phone numbers, and let users store the job-post URL for each application.

## Scope

This request explicitly extends the current frontend-only prototype into a small notification integration. Keep application records in local storage for now, but use the existing Express server only for notification delivery. Do not add database persistence or unrelated authentication work.

## Required behavior

1. Add an optional `applicationLink` field to the application model and add/edit/detail views.
   - Validate that a supplied value is an `http://` or `https://` URL.
   - Render it as an accessible external link on the application detail page.
2. Keep notification channels as In-app, Email, and Phone.
   - When Phone is selected, accept international numbers in E.164 form, such as `+27123456789`.
   - Show a clear validation error for malformed numbers before saving or calling the server.
3. Replace immediate interview delivery with scheduled notification behavior.
   - Saving an interview for a future date/time should create a scheduled server-side notification.
   - The server must not claim that a message was sent when it only accepted a schedule.
   - Return a clear status/message for scheduled, sent, provider-not-configured, and provider-failure outcomes.
   - Avoid duplicate scheduling when an interview is edited and resubmitted; update or replace the existing schedule for that application.
4. Send an SMS through Twilio when the scheduled time is reached.
   - Read `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` from server environment variables only.
   - Never expose credentials in the client or commit `.env` values.
   - Preserve support for all countries supported by the provider through E.164 validation; do not hard-code a South African-only rule.
   - Include company, position, interview date/time, and the stored application link when present.
5. Keep the UI honest and useful.
   - Show whether the reminder is scheduled or could not be scheduled.
   - Keep the in-app notification visible for the upcoming interview.
   - Display the application link on interview/application details.

## Implementation notes

- Preserve the existing Next.js client / Express server split.
- Use explicit TypeScript types for the new field and delivery response.
- Keep the scheduler in the server process and document the limitation that pending schedules are lost if the process restarts until a database-backed queue is added.
- Add a lightweight in-memory scheduler with replacement/cancellation by application ID for this prototype, or use an existing dependency only if already available and appropriate.
- Validate the interview time using the server's documented timezone behavior; do not silently interpret a local client time as UTC.
- Update the server package scripts or README with the required Twilio environment variables and exact local test steps.

## Validation

- Run client lint and build.
- Run a focused server syntax check.
- Manually test a future interview with Phone selected and verify the UI reports scheduling rather than sent delivery.
- Verify invalid non-E.164 phone numbers and invalid application URLs are rejected.
- Verify editing an interview does not create duplicate timers.
- Verify the server returns a provider-not-configured result when Twilio variables are absent.
