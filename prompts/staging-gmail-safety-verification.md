# Safe Staging Verification for Gmail Reliability

## Objective

Complete the remaining safe verification work for the uncommitted Gmail
reliability changes. Begin with repository-local tests and use only disposable
or mocked resources. Do not access production systems, `.env`, real Gmail
accounts, or live application data.

## Findings from repository inspection

- `ensureDatabase()` in `server/server.js` creates `gmail_connections` with
  nullable `last_sync_attempt_at` and `last_successful_sync_at` columns, and
  also applies idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements
  for older schemas. It creates `gmail_sync_leases`; initialization occurs
  before the server listens or starts its workers.
- `gmail-sync.js` coordinates worker sweeps through the `worker:worker`
  database lease, coordinates account sync through connection leases, renews
  leases while processing, and uses owner-token-scoped release. The worker
  performs an initial sweep then uses an in-process interval defaulting to
  60 seconds. An in-process `isRunning` guard only serializes within one
  process; database leases provide cross-instance coordination.
- Existing tests cover separate service instances sharing a mocked lease
  store, including mutual exclusion and lock release on worker failure. They
  do not exercise actual PostgreSQL concurrency.
- No `render.yaml` was found. README documents the worker's startup and polling,
  states that an in-process timer cannot run while the host sleeps, and says
  live Render settings were unavailable. Actual Render sleep/wake behavior
  remains unverified.

## Safe execution plan (after approval)

1. **Schema compatibility:** Add a narrowly scoped test for the additive
   timestamp migration against a simulated pre-change `gmail_connections`
   schema containing existing sync-history values. Assert the two nullable
   columns are added idempotently and pre-existing fields/rows remain intact.
   If an isolated, disposable PostgreSQL instance is locally available, prefer
   running the migration against it. Do not obtain a database URL from `.env`;
   do not connect to a configured or unknown database. If no isolated database
   can be provisioned safely, use a mock and explicitly report that PostgreSQL
   DDL compatibility remains unverified.
2. **Two-instance lease integration:** Run two worker services against the
   same disposable PostgreSQL database. Hold the first sweep inside its
   connection-list operation; assert the second cannot enter that operation.
   Then force a worker failure and assert its lease is released, or (if process
   termination is simulated) that the lease becomes reclaimable only after
   expiration. Use no Gmail client or real account. If no isolated PostgreSQL
   instance is safely available, retain/report the existing shared-mock tests
   as unit evidence but do not label them a database integration test.
3. **Render investigation:** Inspect only repository configuration and
   documentation. Do not change service settings, contact Render, incur cost,
   or claim continuous syncing. Explain how an operator can inspect the
   service's plan/instance/sleep policy, deploy/runtime events, and logs in the
   Render dashboard, then compare wake events with worker startup/initial-sweep
   logs. The dashboard or deployment must be available for actual verification.
4. **Validation:** Run focused schema/lease tests and relevant existing Gmail
   tests, then the full backend tests and `git diff --check`. Report exact
   commands, results, limitations, and remaining staging checks.

## Guardrails

- Do not inspect or print `.env` contents or credentials.
- Do not connect to production, unknown, or user-configured databases.
- Do not access Gmail, alter application records, or modify real statuses.
- Only create/clean up resources created explicitly for this test and only
  after confirming they are isolated and disposable.
- Do not change application matching, notification behavior, OAuth settings,
  deployment configuration, or unrelated code.
- Do not commit, push, merge, or deploy.
