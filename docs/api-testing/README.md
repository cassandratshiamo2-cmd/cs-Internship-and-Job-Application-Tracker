# ApplyFlow API Testing

This folder contains manual test artifacts for the existing Express API:

- [ApplyFlow-Postman-Collection.json](./ApplyFlow-Postman-Collection.json) — Postman Collection v2.1 with request examples and response assertions.
- [API-Test-Case-Documentation.md](./API-Test-Case-Documentation.md) — endpoint and synthetic Gmail-parser test scenarios.

## Prerequisites

- Node.js and npm.
- A local ApplyFlow backend with PostgreSQL configured and initialized. The backend requires `DATABASE_URL` to start.
- Postman desktop or web client.
- A dedicated test account and non-production database. Gmail checks requiring a connection also need the server-side Google OAuth configuration and a dedicated Gmail test account.

Do not save real passwords, JWTs, OAuth tokens, or database credentials in this folder or in an exported/shared Postman collection. Do not use production records. The application delete and Gmail disconnect requests are destructive.

## Start the API

From the repository root, start the existing backend in a terminal:

```powershell
npm --prefix server start
```

The default local API URL is `http://localhost:5000`. Configure the backend using your existing local server environment setup; do not commit secrets. Verify connectivity with `GET /api/health` in the collection. A `503` health result means the API process answered but its database is unavailable or unconfigured.

The existing isolated server unit tests can also be run without starting Postman:

```powershell
npm --prefix server test
```

The parser is a module-level component rather than an API endpoint; its synthetic regression cases are covered by `server/test/gmail-parser.test.js`.

## Import and configure Postman

1. In Postman, choose **Import** and select `ApplyFlow-Postman-Collection.json`.
2. Open the collection's **Variables** tab and set:
   - `baseUrl`: local API root, for example `http://localhost:5000`.
   - `testEmail`: a unique email address for this non-production test account.
   - `testPassword`: a local test password of at least eight characters. Avoid saving or exporting the value.
3. Leave token and record-ID variables blank initially. The login and create/list requests populate the IDs needed by later requests.
4. Register and log in using the Authentication requests. Login stores the JWT in the `token` collection variable for protected requests.
5. Follow the endpoint prerequisites in [API-Test-Case-Documentation.md](./API-Test-Case-Documentation.md) before running requests that need an application, notification, Gmail review item, or connected account.

Requests that mutate state should be run deliberately, rather than as a blind full-collection run. In particular, Gmail review **apply** and **dismiss** are alternative actions for one queue item; run only the intended one. The Gmail retry request needs a retryable message id, and review apply needs a test-owned application id assigned to `gmailApplicationId`. The collection provides an OAuth-denial callback simulation, not a shortcut for successful Google OAuth.

## Limitations

- The collection tests the current Express API; it does not change the project contract or wire the frontend to the backend.
- There is no direct HTTP endpoint for testing raw parser input. Use the existing parser unit tests with synthetic messages for parser-focused checks.
- Gmail sync and OAuth outcomes depend on local configuration, provider availability, mailbox contents, and account permissions.
- Reminder scheduling may vary based on interview time and existing notification state; use future test dates and a dedicated account.
