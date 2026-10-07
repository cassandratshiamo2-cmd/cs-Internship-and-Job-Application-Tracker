# Gmail Email Status Integration

Implement Gmail email integration for ApplyFlow without replacing existing functionality.

## Scope
- Preserve email/password login, JWT authentication, application CRUD, dashboard, interviews, notifications, and current interview reminder behavior.
- Add Google OAuth with the `gmail.readonly` scope only. Never request or store the user's Gmail password. Keep OAuth credentials and tokens on the backend, encrypting stored tokens with a server-side 32-byte key.
- Add persistent Gmail connection state, expiring one-time OAuth state, and Gmail message/status audit records. Scope every connection, message, and application match to the authenticated ApplyFlow user.
- Retrieve messages using Gmail API history after a bounded initial sync, deduplicate by Gmail message ID, and poll periodically with configurable interval and retry handling.
- Parse email events with deterministic rules. Map application received to Applied, assessment to Assessment, shortlisted to Shortlisted, interview invitations to Interview, offers to Offer, and rejection/not-selected messages to Rejected.
- Auto-update only a unique, high-confidence application match. Queue unclassified, ambiguous, low-confidence, and conflicting/stale events for user review. A review action may select one of the current user's applications or dismiss the event.
- Update only the application status and timestamp. Do not overwrite unrelated fields. Do not create interview details or reminder jobs from email; the current reminder flow remains unchanged.
- Add an authenticated Gmail integration UI showing connection state/address, last sync/error, connect/disconnect, manual sync, and queued reviews.

## Backend Design
- Add focused modules for OAuth/token encryption, deterministic MIME parsing, user-scoped application matching, Gmail synchronization, and message processing.
- Add authenticated API endpoints for connection status, connect initiation, disconnect, manual sync, review queue, and review decisions. OAuth callback validates and consumes one-time state before linking the Gmail account.
- Add a distinct polling worker, independent from the existing interview notification worker.
- Use transactions for deduplication, status update, and audit record creation. Never log tokens, email bodies, or authorization codes.

## Database
Add `gmail_connections`, `gmail_oauth_states`, and `gmail_processed_messages` with appropriate user foreign keys, status constraints, expiration/cursor fields, timestamps, and a unique `(connection_id, gmail_message_id)` key. The processed-message table must preserve detected status, match confidence and outcome, and the old/new status when an automatic or reviewed update occurs, while storing only minimal message metadata rather than full message bodies.

## Configuration and Dependencies
- Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and `GMAIL_TOKEN_ENCRYPTION_KEY` to server configuration and `.env.example`; document optional `GMAIL_SYNC_INTERVAL_MS`.
- Add `googleapis` and `mailparser` to the server package.
- Document Google Cloud Gmail API enablement, OAuth consent screen/test users, authorized callback URL, and required environment configuration.

## Client
Add a Gmail integration page and API helper. Add a navigation entry without changing current navigation behavior elsewhere. Use the existing bearer JWT for ApplyFlow API calls; do not put Gmail OAuth tokens in browser storage.

## Validation
Add deterministic parser, matching, transition, OAuth-state, deduplication, and user-isolation tests where practical. Run server tests, client lint, and client production build. Report test/build errors and any Google Cloud setup that must be completed outside the repository.
