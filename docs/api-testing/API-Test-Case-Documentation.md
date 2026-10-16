# ApplyFlow API Test Case Documentation

## Purpose and scope

This guide documents manual API checks against the existing Express server. It does not define new API behavior or change the Sprint 1–4 frontend scope. Requests and expected outcomes below were derived from the current server routes and route-level tests.

The Gmail parser is an internal module, not an HTTP route. Parser behavior is exercised through Gmail synchronization/review and by the existing `server/test/gmail-parser.test.js` unit tests using synthetic message content; Postman cannot submit an arbitrary email directly to the parser.

## Test setup and safety

1. Follow [the API testing README](./README.md) to start a local backend and import the collection.
2. Use a dedicated local test account and non-production database. The server requires a configured PostgreSQL database to start.
3. Set `baseUrl`, `testEmail`, and `testPassword` in Postman collection variables. Choose a unique email for registration and a password of at least eight characters. The test password is intentionally not included in this collection.
4. Run **POST Register test user**, then **POST Login test user**. A successful login stores the bearer token in the collection variable.
5. Requests create, update, mark, dismiss, disconnect, or delete data. Run only the tests you intend to perform. The application delete operation is irreversible; Gmail disconnect revokes the linked refresh token when possible. Do not use production records or a personal Gmail account.
6. For Gmail calls, first connect the dedicated test account through the normal OAuth flow and ensure it contains suitable synthetic/test messages. Never send real email content or credentials to an untrusted Postman workspace.

Requests that take identifiers from earlier responses save those IDs to collection variables. The Gmail retry and review requests need a suitable processed-message ID; the review-apply request also needs a test-owned application ID in `gmailApplicationId`.

## Endpoint test cases

### System

| ID | Request | Expected result | Notes |
| --- | --- | --- | --- |
| SYS-01 | `GET /` | `200`; JSON message indicates the backend is running. | Public liveness response. |
| SYS-02 | `GET /api/health` | `200` with `status: UP`, `database: connected`, and timestamp when PostgreSQL is available; `503` with `status: DOWN` and database state when unavailable or unconfigured. | Database health, not merely process liveness. |

### Authentication

| ID | Request | Expected result | Notes |
| --- | --- | --- | --- |
| AUTH-01 | `POST /api/register` with fullName, valid email, and password >= 8 characters | `201`; user contains id, fullName, normalized email, but no password. | Use a unique email. Password is hashed by the backend. |
| AUTH-02 | `POST /api/register` with required fields missing | `400`; required-fields message. | Negative validation. |
| AUTH-03 | `POST /api/register` with malformed email | `400`; invalid-email message. | Negative validation. |
| AUTH-04 | `POST /api/register` with short password | `400`; minimum-length message. | Password must contain at least eight characters. |
| AUTH-05 | `POST /api/register` with an existing email | `409`; duplicate-user message. | Registration normalizes email to lowercase and trims whitespace. |
| AUTH-06 | `POST /api/login` with correct credentials | `200`; response contains a signed token and user id/name/email. | Token is valid for one hour; collection saves it for protected requests. |
| AUTH-07 | `POST /api/login` with incorrect email or password | `401`; generic invalid-credentials message. | Both failure cases intentionally share a response. |
| AUTH-08 | Any protected endpoint without a bearer token | `401`; authentication-required response. | Use `GET /api/applications` to exercise the guard without mutation. |
| AUTH-09 | Any protected endpoint with an expired or invalid token | `401`; expired-session response. | Can be tested with a deliberately invalid token. |

The implemented API login has no server-side failed-attempt lockout endpoint behavior. The prototype UI lockout is not part of this Postman collection.

### Applications

Required fields are `company`, `position`, `date` (`YYYY-MM-DD`), `type`, `status`, `arrangement`, and `notes`. Types accepted by the current validator are `Internship`, `WIL`, `Graduate Job`, `Full-Time Job`, and legacy `Job`. Status values are `Saved`, `Applied`, `Assessment`, `Shortlisted`, `Interview`, `Offer`, `Rejected`, and `Withdrawn`; arrangements are `Remote`, `Hybrid`, and `Onsite`. A status of `Interview` also requires a valid `interviewDate`, `interviewTime`, and `interviewType`. Optional URLs and interview email are validated when supplied.

| ID | Request | Expected result | Notes |
| --- | --- | --- | --- |
| APP-01 | `GET /api/applications` with bearer token | `200`; `{ "applications": [...] }` contains only the authenticated user's records. | Check empty and populated accounts. |
| APP-02 | `POST /api/applications` with valid required fields | `201`; response contains the saved application and string id. | The collection saves `applicationId`. |
| APP-03 | `POST /api/applications` with missing required fields, invalid date/enums, or invalid link | `400`; JSON `message` explains validation failure. | Includes impossible dates such as `2026-02-30`. |
| APP-04 | `GET /api/applications/:id` for an owned record | `200`; `{ "application": {...} }`. | Compare returned id and fields. |
| APP-05 | `GET /api/applications/:id` with non-positive/non-numeric id | `400`; valid-id message. | |
| APP-06 | `GET /api/applications/:id` for a missing or another user's record | `404`; application-not-found response. | Confirms owner scoping. |
| APP-07 | `PUT /api/applications/:id` with a complete valid payload | `200`; updated application is returned. | PUT validates the complete payload; do not send a partial update. |
| APP-08 | `PUT /api/applications/:id` with invalid values or invalid ID | `400`; validation or valid-id message. | An Interview status requires valid interview details. |
| APP-09 | `DELETE /api/applications/:id` for an owned record | `200`; `deleted: true`; related notification jobs are removed in the same transaction. | Irreversible. |
| APP-10 | `DELETE /api/applications/:id` for another user's or missing record | `404`; no other user's record or jobs are deleted. | |
| APP-11 | `DELETE /api/applications/:id` without bearer token | `401`; no database work should be performed. | |

### Interview reminders and notifications

| ID | Request | Expected result | Notes |
| --- | --- | --- | --- |
| NOT-01 | `POST /api/notifications/interview` with applicationId, company, position, valid interviewDate/interviewTime, and `notificationChannels: ["In-app"]` | `200`; response indicates whether scheduled, with results array. A past interview returns `scheduled: false` and no results. | Other channel values are not supported by this endpoint. Date/time interpretation follows the server's interview schedule logic. |
| NOT-02 | `POST /api/notifications/interview` with required details omitted, no In-app channel, unsupported channel, invalid date/time, or invalid applicationLink | `400`; validation message. | |
| NOT-03 | `DELETE /api/notifications/interview/:applicationId` | `200`; `{ "cancelled": <number> }`. | Cancels pending/processing reminder jobs for the signed-in user. |
| NOT-04 | `GET /api/notifications` | `200`; `{ "notifications": [...] }`, `Cache-Control: no-store`; records are limited to the signed-in user and linked applications. | Expired interview reminders may be pruned during this read. |
| NOT-05 | `PATCH /api/notifications/:notificationId/read` without a body | `200`; notification is marked read. | |
| NOT-06 | `PATCH /api/notifications/:notificationId/read` with `{ "read": false }` | `200`; response notification has `read: false`. | `true` can mark as read explicitly. |
| NOT-07 | PATCH with non-boolean `read`, or for a missing/other user's notification | `400` for non-boolean; `404` for an unavailable/other user's record. | |

### Gmail connection, sync, and review

All Gmail routes except OAuth callback require a bearer token. API results depend on Google OAuth configuration, a connected Gmail account, and available Gmail data. Do not automate a real OAuth consent or real mailbox without a dedicated account.

| ID | Request | Expected result | Notes |
| --- | --- | --- | --- |
| GML-01 | `GET /api/gmail/status` | `200`; `connected` boolean and sync timestamps/error; `Cache-Control: no-store`. | Email is null when disconnected. |
| GML-02 | `POST /api/gmail/connect` | `200` with an authorizationUrl when OAuth settings are configured; `503` with a clear configuration message otherwise. | Starting OAuth creates expiring state. Complete consent in a browser, not by fabricating a successful callback. |
| GML-03 | `GET /api/gmail/oauth/callback?error=access_denied` | `302` redirect to the configured client Gmail page with `gmail=denied`. | Safe denial-path check included in Postman. Successful callback requires a real one-time state and provider code. |
| GML-04 | `GET /api/gmail/oauth/callback` without valid state/code | Redirect to the client Gmail page with `gmail=invalid`; expired/unknown state redirects with `gmail=expired`. | Callback status is a redirect, not a JSON API response. |
| GML-05 | `POST /api/gmail/sync` while connected | `200`; sync message, processed count/outcomes, and initial-sync completion state. | A concurrent sync can return `200` with `inProgress: true`. |
| GML-06 | `POST /api/gmail/sync` during provider quota cooldown | `429`; `Retry-After` header and `retryAfterSeconds`. | Retry only after the supplied delay. |
| GML-07 | `POST /api/gmail/sync` while disconnected/auth expired or provider unavailable | `502`; safe error message. | Error text can distinguish not-connected/auth-expired conditions. |
| GML-08 | `GET /api/gmail/review` | `200`; `messages` array of review-queue items with boolean `retryable`. | Queue is limited to 100 items. Use a returned message id for review actions. |
| GML-09 | `GET /api/gmail/history` | `200`; `messages` array containing completed `updated`, `reviewed`, or `dismissed` outcomes and `retryable`. | Limited to 100; ignored/review queue rows are not normal history entries. |
| GML-10 | `POST /api/gmail/messages/:messageId/retry` for a retryable message | `200`; processed count/outcomes. | Requires a message owned by the current account and still available in Gmail. |
| GML-11 | Retry invalid ID, already non-retryable item, busy sync, or quota-limited mailbox | `400` for invalid ID; `409` for retry conflict/non-retryable; `429` with Retry-After for quota. | `500`/`502` represent server/provider failures. |
| GML-12 | `POST /api/gmail/review/:messageId` with `{ "action": "dismiss" }` | `200`; email dismissed and moves to history. | Mutates the review item. |
| GML-13 | Review with `{ "action": "apply", "applicationId": <owned id> }` | `200` when applied or already up to date; `400` for invalid action/application input; `404` for unavailable review/application; `409` when the status would not advance and needs review. | Choose an application owned by the current account. This can update status/interview details and schedule reminders. |
| GML-14 | `DELETE /api/gmail/connection` | `200`; `{ "disconnected": true }`. | Destructive to the local link and attempts to revoke Google's refresh token. |

#### Parser-focused regression scenarios

These tests exercise `server/gmail-parser.js` with synthetic fixtures through `node --test`; they are not Postman requests. Verify them using the existing unit tests and do not put personal messages into test fixtures.

| ID | Synthetic input scenario | Expected parser behavior |
| --- | --- | --- |
| PAR-01 | Current authored body clearly says an application was received/submitted | Classify `Applied` with confidence; quoted/forwarded text alone must not override current text. |
| PAR-02 | Subject signals an assessment invitation and current body relates to the candidate/application | Classify `Assessment` where the parser's assessment-invitation rules match. |
| PAR-03 | Interview invitation includes date, time, type, location, or meeting link | Classify `Interview` and extract only unambiguous details; time-zone cases use the parser's configured zone handling. |
| PAR-04 | Current email contains conflicting application outcomes, or subject contradicts authored body | Return no automatic status and require review rather than choosing one silently. |
| PAR-05 | Generic job alert, security notice, or quoted old status without a current personalized result | Do not treat it as a new application-status change. |

Run the parser's focused tests with:

```powershell
node --test server/test/gmail-parser.test.js
```

Run the full server unit suite with `npm --prefix server test`.

## Evidence and expected variation

The Postman collection includes response assertions for its representative positive/negative requests. Assertions allow explicitly documented operational outcomes for health, Gmail OAuth configuration, synchronization, and retry because those depend on local configuration and provider state. A passing Postman assertion does not prove Gmail-provider delivery or database isolation; use a dedicated local account and review state changes directly.
