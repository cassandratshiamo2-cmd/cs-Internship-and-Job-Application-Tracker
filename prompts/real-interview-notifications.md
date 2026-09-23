# Add real interview email and phone notifications

## Scope change
Extend the current frontend prototype into an opt-in notification integration. This explicitly moves the notification delivery portion into the prepared Express server phase while keeping applications and interviews local/mock data for now.

## Implementation

1. Add contact fields to interview scheduling:
   - Optional recipient email and phone number fields.
   - Validate email format and basic international phone format when the matching channel is selected.
   - Store only the contact values needed for the reminder configuration; never store provider credentials in the client.

2. Add a server notification endpoint:
   - Add `POST /api/notifications/interview` to `server/server.js`.
   - Validate company, position, interview date/time, selected channels, and recipient contact values.
   - Send email through Resend using `RESEND_API_KEY` and `NOTIFICATION_FROM_EMAIL` environment variables.
   - Send SMS through Twilio using `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` environment variables.
   - Never log secrets or full recipient contact details.
   - Return per-channel delivery results and a useful configuration error when a requested provider is not configured.
   - Keep CORS limited to `CLIENT_URL`.

3. Connect the client:
   - After saving an interview, call the server endpoint for selected Email/Phone channels.
   - Preserve the application locally even if external delivery fails.
   - Display a clear success, partial-success, or configuration message.
   - Keep In-app reminders working independently.

4. Documentation and configuration:
   - Add a server `.env.example` documenting provider variables without real values.
   - Update the server README or project README with setup steps and provider requirements.
   - Do not commit real `.env` files, API keys, phone numbers, or email credentials.

## Validation
Run server lint/syntax checks if available, client lint/build, and test the endpoint with provider configuration absent to confirm safe validation errors. Do not claim messages were delivered without configured providers.
