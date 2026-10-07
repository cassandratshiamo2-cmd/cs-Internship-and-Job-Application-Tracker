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
  wait = async () => {},
  random = () => 0.5,
} = {}) {
  const calls = { profile: 0, history: 0, get: 0, delays: [] };
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
            lockHeld = true;
            return { rowCount: 1, rows: [{ acquired }] };
          }
          if (sql.includes('pg_advisory_unlock')) {
            lockHeld = false;
            return { rowCount: 1, rows: [{ pg_advisory_unlock: true }] };
          }
          throw new Error(`Unexpected lock query: ${sql}`);
        },
        release() {},
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

  return { calls, service };
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
