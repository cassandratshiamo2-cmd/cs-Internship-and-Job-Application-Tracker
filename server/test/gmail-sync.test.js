const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createGmailSyncService,
  getRetryAfterMs,
  isGmailQuotaError,
} = require('../gmail-sync');
const { encryptToken } = require('../gmail-oauth');

const encryptionKey = Buffer.alloc(32, 3).toString('base64');

function createTestService({
  historyList,
  existingMessage = false,
  cooldownAfterQuota = false,
  failUnlock = false,
  wait = async () => {},
  random = () => 0.5,
} = {}) {
  const calls = { profile: 0, history: 0, get: 0, delays: [], unlocks: 0, releases: 0, discardedClients: 0 };
  const connection = {
    id: 7,
    user_id: 4,
    gmail_address: 'applyflow@example.com',
    refresh_token_ciphertext: encryptToken('refresh-token', encryptionKey),
    access_token_ciphertext: null,
    token_expires_at: null,
    history_id: 'history-start',
    initial_sync_history_id: null,
    initial_sync_page_token: null,
  };
  let lockHeld = false;
  let coolingDown = false;
  let shouldFailUnlock = failUnlock;

  const pool = {
    async query(sql) {
      if (sql.startsWith('SELECT * FROM gmail_connections')) {
        return { rowCount: 1, rows: [connection] };
      }
      if (sql.startsWith('SELECT CEIL(EXTRACT(EPOCH FROM (quota_backoff_until')) {
        return {
          rowCount: coolingDown ? 1 : 0,
          rows: coolingDown ? [{ retry_after_seconds: 90 }] : [],
        };
      }
      if (sql.startsWith('SELECT 1 FROM gmail_processed_messages')) {
        return {
          rowCount: existingMessage ? 1 : 0,
          rows: existingMessage ? [{ '?column?': 1 }] : [],
        };
      }
      if (sql.startsWith('UPDATE gmail_connections SET quota_failure_count')) {
        coolingDown = cooldownAfterQuota;
        return { rowCount: 1, rows: [{ retry_after_seconds: 60 }] };
      }
      if (sql.startsWith('UPDATE gmail_connections')) {
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected pool query: ${sql}`);
    },
    async connect() {
      return {
        async query(sql) {
          if (sql.includes('pg_try_advisory_lock')) {
            const acquired = !lockHeld;
            if (acquired) lockHeld = true;
            return { rowCount: 1, rows: [{ acquired }] };
          }
          if (sql.includes('pg_advisory_unlock')) {
            calls.unlocks += 1;
            if (shouldFailUnlock) {
              shouldFailUnlock = false;
              throw new Error('Synthetic advisory unlock failure');
            }
            lockHeld = false;
            return { rowCount: 1, rows: [{ pg_advisory_unlock: true }] };
          }
          throw new Error(`Unexpected lock query: ${sql}`);
        },
        release(error) {
          calls.releases += 1;
          if (error) {
            calls.discardedClients += 1;
            lockHeld = false;
          }
        },
      };
    },
  };

  const service = createGmailSyncService({
    pool,
    env: {
      GMAIL_TOKEN_ENCRYPTION_KEY: encryptionKey,
    },
    retryBaseMs: 100,
    oauthClientFactory() {
      return {
        credentials: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expiry_date: Date.now() + 60000,
        },
        setCredentials() {},
        async getAccessToken() {},
      };
    },
    gmailClientFactory() {
      return {
        users: {
          getProfile: async () => {
            calls.profile += 1;
            return { data: { historyId: 'initial-history' } };
          },
          history: {
            list: async (...args) => {
              calls.history += 1;
              return historyList
                ? historyList(...args)
                : { data: { historyId: 'history-next', history: [] } };
            },
          },
          messages: {
            get: async () => {
              calls.get += 1;
              return { data: {} };
            },
          },
        },
      };
    },
    wait: async (milliseconds) => {
      calls.delays.push(milliseconds);
      await wait(milliseconds);
    },
    random,
  });

  return { calls, service, isLockHeld: () => lockHeld };
}

test('incremental sync skips stored messages before fetching their bodies', async () => {
  const { calls, service } = createTestService({
    existingMessage: true,
    historyList: async () => ({
      data: {
        historyId: 'history-next',
        history: [{ messagesAdded: [{ message: { id: 'already-processed' } }] }],
      },
    }),
  });

  const result = await service.syncConnection(7);

  assert.equal(result.processed, 1);
  assert.deepEqual(result.outcomes, ['duplicate']);
  assert.equal(calls.profile, 0);
  assert.equal(calls.history, 1);
  assert.equal(calls.get, 0);
});

test('a connection lock prevents a second sync from calling Gmail concurrently', async () => {
  let releaseHistory;
  let startedHistory;
  const historyStarted = new Promise((resolve) => { startedHistory = resolve; });
  const { calls, service } = createTestService({
    historyList: async () => {
      startedHistory();
      return new Promise((resolve) => { releaseHistory = resolve; });
    },
  });

  const firstSync = service.syncConnection(7);
  await historyStarted;
  const secondResult = await service.syncConnection(7);
  assert.equal(secondResult.inProgress, true);
  assert.equal(calls.history, 1);

  releaseHistory({ data: { historyId: 'history-next', history: [] } });
  await firstSync;
});

test('a failed Gmail sync releases the advisory lock for the next attempt', async () => {
  let failOnce = true;
  const { calls, service, isLockHeld } = createTestService({
    historyList: async () => {
      if (failOnce) {
        failOnce = false;
        throw new Error('Synthetic history request failure');
      }
      return { data: { historyId: 'history-recovered', history: [] } };
    },
  });

  await assert.rejects(service.syncConnection(7), /Gmail sync failed/);
  assert.equal(isLockHeld(), false);
  assert.equal(calls.unlocks, 1);

  const retryResult = await service.syncConnection(7);
  assert.equal(retryResult.inProgress, undefined);
  assert.equal(calls.unlocks, 2);
  assert.equal(isLockHeld(), false);
});

test('an advisory unlock failure discards its database session', async () => {
  const { calls, service, isLockHeld } = createTestService({ failUnlock: true });

  await assert.rejects(service.syncConnection(7), /Synthetic advisory unlock failure/);
  assert.equal(calls.discardedClients, 1);
  assert.equal(isLockHeld(), false);

  const retryResult = await service.syncConnection(7);
  assert.equal(retryResult.inProgress, undefined);
  assert.equal(isLockHeld(), false);
});

test('quota errors use bounded exponential retry and then a persisted cooldown', async () => {
  let attemptCount = 0;
  const { calls, service } = createTestService({
    cooldownAfterQuota: true,
    historyList: async () => {
      attemptCount += 1;
      const error = new Error('Quota exceeded for units per minute');
      error.response = { status: 429, headers: {} };
      throw error;
    },
  });

  const result = await service.syncConnection(7);
  assert.equal(result.quotaLimited, true);
  assert.deepEqual(calls.delays, [100, 200, 400]);
  assert.equal(attemptCount, 4);
  assert.equal(calls.profile, 0);

  const repeatedResult = await service.syncConnection(7);
  assert.equal(repeatedResult.quotaLimited, true);
  assert.equal(repeatedResult.retryAfterSeconds, 90);
  assert.equal(attemptCount, 4);
});

test('quota detection distinguishes quota-related 403 responses from permission errors', () => {
  assert.equal(isGmailQuotaError({
    response: {
      status: 403,
      data: { error: { errors: [{ reason: 'userRateLimitExceeded' }] } },
    },
  }), true);
  assert.equal(isGmailQuotaError({ response: { status: 403, data: {} }, message: 'Forbidden' }), false);
});

test('quota retries honor Gmail Retry-After headers', () => {
  assert.equal(getRetryAfterMs({
    response: { headers: { 'retry-after': '3' } },
  }), 3000);
  assert.equal(getRetryAfterMs({
    response: { headers: { 'retry-after': 'Thu, 01 Jan 1970 00:00:05 GMT' } },
  }, 1000), 4000);
});

test('sync applies the Shoprite interview date and time without replacing an existing type', async () => {
  const connection = {
    id: 7,
    user_id: 4,
    gmail_address: 'applyflow@example.com',
    refresh_token_ciphertext: encryptToken('refresh-token', encryptionKey),
    access_token_ciphertext: null,
    token_expires_at: null,
    history_id: 'history-start',
    initial_sync_history_id: null,
    initial_sync_page_token: null,
  };
  const application = {
    id: 42,
    company: 'Shoprite',
    position: 'Cashier',
    status: 'Interview',
    updated_at: new Date('2026-10-08T09:00:00Z'),
    interview_date: '2026-10-09',
    interview_time: '07:30:00',
    interview_type: 'Panel',
    notification_channels: [],
    application_link: null,
    interview_email: null,
  };
  const processed = {};
  const rawEmail = Buffer.from([
    'From: Shoprite Careers <careers@shoprite.co.za>',
    'To: applyflow@example.com',
    'Subject: INTERVIEW INVITATION',
    'Date: Thu, 08 Oct 2026 08:00:00 +0200',
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="applyflow-boundary"',
    '',
    '--applyflow-boundary',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'YOU ARE INVITED TO AN INTERVIEW ON THE 09 OCTOBER 2026',
    'AT 08:30',
    '',
    'Kind regards',
    '',
    'Shoprite',
    '--applyflow-boundary',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<p>YOU ARE INVITED TO AN INTERVIEW ON THE 09 OCTOBER 2026</p>',
    '<p>AT 08:30</p><p>Kind regards</p><p>Shoprite</p>',
    '--applyflow-boundary--',
  ].join('\r\n')).toString('base64url');
  let lockHeld = false;
  const pool = {
    async query(sql) {
      if (sql.startsWith('SELECT * FROM gmail_connections')) return { rowCount: 1, rows: [connection] };
      if (sql.startsWith('SELECT CEIL(EXTRACT(EPOCH FROM (quota_backoff_until')) return { rowCount: 0, rows: [] };
      if (sql.startsWith('SELECT 1 FROM gmail_processed_messages')) return { rowCount: 0, rows: [] };
      if (sql.startsWith('SELECT id, company, position, status, updated_at FROM applications')) {
        return { rowCount: 1, rows: [application] };
      }
      if (sql.startsWith('UPDATE gmail_connections')) return { rowCount: 1, rows: [] };
      throw new Error(`Unexpected pool query: ${sql}`);
    },
    async connect() {
      return {
        async query(sql, params = []) {
          if (sql.includes('pg_try_advisory_lock')) {
            lockHeld = true;
            return { rowCount: 1, rows: [{ acquired: true }] };
          }
          if (sql.includes('pg_advisory_unlock')) {
            lockHeld = false;
            return { rowCount: 1, rows: [{ pg_advisory_unlock: true }] };
          }
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 1, rows: [] };
          if (sql.startsWith('INSERT INTO gmail_processed_messages')) {
            assert.equal(params[8], '2026-10-09');
            assert.equal(params[9], '08:30');
            Object.assign(processed, {
              status: params[7],
              interview_date: params[8],
              interview_time: params[9],
              interview_type: params[10],
            });
            return { rowCount: 1, rows: [{ id: 500 }] };
          }
          if (sql.startsWith('SELECT id, company, position, status, updated_at, interview_date')) {
            return { rowCount: 1, rows: [application] };
          }
          if (sql.startsWith('UPDATE applications SET status = CASE')) {
            application.status = params[7] ? application.status : params[2];
            application.interview_date = params[7]
              ? (params[5] || application.interview_date)
              : (application.interview_date || params[5]);
            application.interview_time = params[7]
              ? (params[6] || application.interview_time)
              : (application.interview_time || params[6]);
            application.interview_type = params[7]
              ? (params[8] || application.interview_type)
              : (application.interview_type || params[8]);
            return { rowCount: 1, rows: [{ ...application }] };
          }
          if (sql.startsWith('UPDATE gmail_processed_messages SET outcome = \'updated\'')) {
            return { rowCount: 1, rows: [] };
          }
          throw new Error(`Unexpected transaction query: ${sql}`);
        },
        release() {},
      };
    },
  };
  const service = createGmailSyncService({
    pool,
    env: { GMAIL_TOKEN_ENCRYPTION_KEY: encryptionKey },
    oauthClientFactory() {
      return {
        credentials: { access_token: 'access-token', refresh_token: 'refresh-token', expiry_date: Date.now() + 60000 },
        setCredentials() {},
        async getAccessToken() {},
      };
    },
    gmailClientFactory() {
      return {
        users: {
          history: {
            async list() {
              return {
                data: {
                  historyId: 'history-next',
                  history: [{ messagesAdded: [{ message: { id: 'shoprite-interview' } }] }],
                },
              };
            },
          },
          messages: {
            async get() {
              return {
                data: {
                  labelIds: [],
                  raw: rawEmail,
                  threadId: 'shoprite-thread',
                  internalDate: String(new Date('2026-10-08T06:00:00Z').getTime()),
                },
              };
            },
          },
        },
      };
    },
  });

  const result = await service.syncConnection(7);

  assert.deepEqual(result.outcomes, ['updated']);
  assert.deepEqual(
    [processed.status, processed.interview_date, processed.interview_time, processed.interview_type],
    ['Interview', '2026-10-09', '08:30', null]
  );
  assert.deepEqual(
    [application.status, application.interview_date, application.interview_time, application.interview_type],
    ['Interview', '2026-10-09', '08:30', 'Panel']
  );
  assert.equal(lockHeld, false);
});
