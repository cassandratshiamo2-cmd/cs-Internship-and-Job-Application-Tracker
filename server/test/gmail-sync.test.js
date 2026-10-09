const test = require('node:test');
const assert = require('node:assert/strict');
const { simpleParser } = require('mailparser');
const {
  createGmailSyncService,
  getRetryAfterMs,
  isGmailQuotaError,
  startGmailSyncWorker,
} = require('../gmail-sync');
const { encryptToken } = require('../gmail-oauth');

const encryptionKey = Buffer.alloc(32, 3).toString('base64');

function createTestService({
  historyList,
  existingMessage = false,
  cooldownAfterQuota = false,
  failUnlock = false,
  unlockReturnsFalse = false,
  failLockAcquisition = false,
  requestTimeoutMs = 30000,
  messageGet,
  messageList,
  parseMessage,
  applications = [],
  existingMessages = [],
  scheduleInterviewReminder,
  wait = async () => {},
  random = () => 0.5,
  leaseStore = new Map(),
  scheduleLeaseRenewal,
  cancelLeaseRenewal,
  failLeaseRenewal = false,
} = {}) {
  const calls = {
    profile: 0,
    history: 0,
    list: 0,
    get: 0,
    delays: [],
    unlocks: 0,
    releases: 0,
    discardedClients: 0,
    applicationUpdates: 0,
    historyResets: 0,
    leaseRenewals: 0,
    historyCursorUpdates: [],
    initialSyncCursorUpdates: [],
    notifications: [],
    oauthTimeout: null,
    lockQueryTimeouts: [],
    connectionUpdates: [],
    locks: 0,
  };
  const processedRows = new Map();
  let nextProcessedId = 100;
  let nextNotificationId = 1;
  if (existingMessage) {
    processedRows.set('already-processed', {
      id: 99,
      outcome: typeof existingMessage === 'string' ? existingMessage : 'updated',
    });
  }
  for (const message of existingMessages) {
    processedRows.set(message.messageId, {
      id: message.id,
      outcome: message.outcome,
      detectedStatus: message.detectedStatus || null,
      reviewReason: message.reviewReason || null,
      reprocessVersion: message.reprocessVersion || 0,
    });
  }
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
  const heldLocks = leaseStore;
  let coolingDown = false;
  let shouldFailUnlock = failUnlock;
  let shouldReturnFalseOnUnlock = unlockReturnsFalse;
  let shouldFailLockAcquisition = failLockAcquisition;

  const pool = {
    async query(sql, params = []) {
      if (sql.startsWith('INSERT INTO gmail_sync_leases')) {
        calls.locks += 1;
        const [lockKey, ownerToken] = params;
        const currentLease = heldLocks.get(lockKey);
        if (shouldFailLockAcquisition) {
          shouldFailLockAcquisition = false;
          heldLocks.set(lockKey, { ownerToken, expiresAt: Date.now() + 180000 });
          throw new Error('Synthetic sync lease acquisition response failure');
        }
        if (currentLease && currentLease.expiresAt > Date.now()) {
          return { rowCount: 0, rows: [] };
        }
        heldLocks.set(lockKey, { ownerToken, expiresAt: Date.now() + 180000 });
        return { rowCount: 1, rows: [{ owner_token: ownerToken }] };
      }
      if (sql.startsWith('UPDATE gmail_sync_leases SET')) {
        calls.leaseRenewals += 1;
        if (failLeaseRenewal) {
          failLeaseRenewal = false;
          throw new Error('Synthetic sync lease renewal failure');
        }
        const lease = heldLocks.get(params[0]);
        if (!lease || lease.ownerToken !== params[1] || lease.expiresAt <= Date.now()) {
          return { rowCount: 0, rows: [] };
        }
        lease.expiresAt = Date.now() + 180000;
        return { rowCount: 1, rows: [{ owner_token: params[1] }] };
      }
      if (sql.startsWith('DELETE FROM gmail_sync_leases')) {
        calls.unlocks += 1;
        if (shouldFailUnlock) {
          shouldFailUnlock = false;
          throw new Error('Synthetic sync lease release failure');
        }
        if (shouldReturnFalseOnUnlock) {
          shouldReturnFalseOnUnlock = false;
          return { rowCount: 0, rows: [] };
        }
        const lease = heldLocks.get(params[0]);
        if (!lease || lease.ownerToken !== params[1]) return { rowCount: 0, rows: [] };
        heldLocks.delete(params[0]);
        return { rowCount: 1, rows: [{ lock_key: params[0] }] };
      }
      if (sql.startsWith('SELECT id FROM gmail_connections WHERE is_connected = TRUE ORDER BY id')) {
        return { rowCount: 1, rows: [{ id: connection.id }] };
      }
      if (sql.startsWith('SELECT * FROM gmail_connections')) {
        return { rowCount: 1, rows: [connection] };
      }
      if (sql.startsWith('SELECT message.id, message.gmail_message_id')) {
        const entry = Array.from(processedRows.entries())
          .find(([, row]) => row.id === params[0]);
        if (!entry || params[1] !== connection.user_id) return { rowCount: 0, rows: [] };
        const [gmailMessageId, row] = entry;
        return {
          rowCount: 1,
          rows: [{
            id: row.id,
            gmail_message_id: gmailMessageId,
            outcome: row.outcome,
            detected_status: row.detectedStatus,
            review_reason: row.reviewReason,
            reprocess_version: row.reprocessVersion || 0,
            connection_id: connection.id,
          }],
        };
      }
      if (sql.startsWith('SELECT CEIL(EXTRACT(EPOCH FROM (quota_backoff_until')) {
        return {
          rowCount: coolingDown ? 1 : 0,
          rows: coolingDown ? [{ retry_after_seconds: 90 }] : [],
        };
      }
      if (sql.startsWith('SELECT outcome, detected_status')) {
        const row = processedRows.get(String(params[1]));
        return {
          rowCount: row ? 1 : 0,
          rows: row ? [{
            outcome: row.outcome,
            detected_status: row.detectedStatus,
            review_reason: row.reviewReason,
            reprocess_version: row.reprocessVersion || 0,
          }] : [],
        };
      }
      if (sql.startsWith('SELECT gmail_message_id FROM gmail_processed_messages')) {
        const rows = Array.from(processedRows.entries())
          .filter(([, row]) => row.outcome === 'ignored' && !row.detectedStatus &&
            row.reviewReason === params[1] && (row.reprocessVersion || 0) < params[2])
          .map(([gmailMessageId]) => ({ gmail_message_id: gmailMessageId }));
        return { rowCount: rows.length, rows };
      }
      if (sql.startsWith('SELECT id, company, position, status, updated_at FROM applications')) {
        return { rowCount: applications.length, rows: applications };
      }
      if (sql.startsWith('UPDATE gmail_connections SET quota_failure_count')) {
        calls.connectionUpdates.push(sql);
        coolingDown = cooldownAfterQuota;
        return { rowCount: 1, rows: [{ retry_after_seconds: 60 }] };
      }
      if (sql.startsWith('UPDATE gmail_connections SET history_id = NULL')) {
        calls.historyResets += 1;
        return { rowCount: 1, rows: [] };
      }
      if (sql.startsWith('UPDATE gmail_connections SET initial_sync_history_id = $2')) {
        calls.initialSyncCursorUpdates.push(params[1]);
        return { rowCount: 1, rows: [] };
      }
      if (sql.startsWith('UPDATE gmail_connections SET initial_sync_page_token = $2')) {
        calls.initialSyncCursorUpdates.push(params[2]);
        return { rowCount: 1, rows: [] };
      }
      if (sql.startsWith('UPDATE gmail_connections SET history_id = $2, last_sync_at')) {
        calls.historyCursorUpdates.push(params[1]);
        return { rowCount: 1, rows: [] };
      }
      if (sql.startsWith('UPDATE gmail_connections')) {
        calls.connectionUpdates.push(sql);
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected pool query: ${sql}`);
    },
    async connect() {
      let ownedLockKey;
      return {
        async query(query, params = []) {
          const sql = typeof query === 'string' ? query : query.text;
          if (typeof query !== 'string') {
            params = query.values || [];
            calls.lockQueryTimeouts.push(query.query_timeout);
          }
          if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rowCount: 1, rows: [] };
          if (sql.startsWith('INSERT INTO notification_jobs')) {
            const [userId, applicationId, notificationType, channel, company, position, status, previousStatus, newStatus, eventKey] = params;
            const exists = calls.notifications.some((notification) =>
              notification.user_id === userId &&
              notification.application_id === applicationId &&
              notification.notification_type === notificationType &&
              notification.channel === channel &&
              notification.event_key === eventKey
            );
            if (exists) return { rowCount: 0, rows: [] };

            const notification = {
              id: nextNotificationId++,
              user_id: userId,
              application_id: applicationId,
              notification_type: notificationType,
              channel,
              company,
              position,
              status,
              read: false,
              previous_status: previousStatus,
              new_status: newStatus,
              event_key: eventKey,
            };
            calls.notifications.push(notification);
            return { rowCount: 1, rows: [{ id: notification.id }] };
          }
          if (sql.startsWith('INSERT INTO gmail_processed_messages')) {
            const messageId = String(params[2]);
            if (sql.includes('review_reason, processed_at')) {
              if (!processedRows.has(messageId)) {
                processedRows.set(messageId, {
                  id: nextProcessedId++,
                  outcome: 'review',
                  warning: true,
                  review_reason: params[3],
                });
              }
              return { rowCount: 1, rows: [] };
            }
            if (processedRows.has(messageId)) return { rowCount: 0, rows: [] };
            const id = nextProcessedId++;
            processedRows.set(messageId, {
              id,
              outcome: 'processing',
              sender: params[4],
              subject: params[5],
              detectedStatus: params[7],
            });
            return { rowCount: 1, rows: [{ id }] };
          }
          if (sql.startsWith('SELECT id, outcome')) {
            const row = processedRows.get(String(params[1]));
            return { rowCount: row ? 1 : 0, rows: row ? [{
              id: row.id,
              outcome: row.outcome,
              detected_status: row.detectedStatus,
              review_reason: row.reviewReason,
              reprocess_version: row.reprocessVersion || 0,
            }] : [] };
          }
          if (sql.startsWith('UPDATE gmail_processed_messages SET sender =')) {
            const row = Array.from(processedRows.values()).find((item) => item.id === params[0]);
            if (row) {
              row.outcome = 'processing';
              row.detectedStatus = params[4];
              row.reviewReason = null;
              if (params[10]) row.reprocessVersion = (row.reprocessVersion || 0) + 1;
            }
            return { rowCount: 1, rows: [] };
          }
          if (sql.startsWith('SELECT id, company, position, status, updated_at, interview_date')) {
            return { rowCount: 1, rows: [{ ...applications[0] }] };
          }
          if (sql.startsWith('UPDATE applications SET status = CASE')) {
            const application = applications.find((item) => String(item.id) === String(params[0]));
            if (!application) return { rowCount: 0, rows: [] };
            calls.applicationUpdates += 1;
            if (params[7]) application.status = params[2];
            application.interview_date = params[9]
              ? (params[5] || application.interview_date)
              : (application.interview_date || params[5]);
            application.interview_time = params[9]
              ? (params[6] || application.interview_time)
              : (application.interview_time || params[6]);
            application.interview_type = params[9]
              ? (params[8] || application.interview_type)
              : (application.interview_type || params[8]);
            return { rowCount: 1, rows: [{ ...application }] };
          }
          if (sql.startsWith('UPDATE gmail_processed_messages SET outcome =')) {
            const row = Array.from(processedRows.values()).find((item) => item.id === params[0]);
            if (row) {
              row.outcome = /SET outcome = '([^']+)'/.exec(sql)?.[1] || row.outcome;
              row.applicationId = params[1];
              row.previousStatus = params[2];
              row.newStatus = params[3];
            }
            return { rowCount: 1, rows: [] };
          }
          throw new Error(`Unexpected lock query: ${sql}`);
        },
        release(error) {
          calls.releases += 1;
          if (error) {
            calls.discardedClients += 1;
            if (ownedLockKey) heldLocks.delete(ownedLockKey);
          }
        },
      };
    },
  };

  const service = createGmailSyncService({
    pool,
    scheduleInterviewReminder,
    parseMessage,
    env: {
      GMAIL_TOKEN_ENCRYPTION_KEY: encryptionKey,
      GMAIL_SYNC_REQUEST_TIMEOUT_MS: String(requestTimeoutMs),
    },
    retryBaseMs: 100,
    oauthClientFactory() {
      return {
        transporter: { defaults: {} },
        credentials: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expiry_date: Date.now() + 60000,
        },
        setCredentials() {},
        async getAccessToken() {
          calls.oauthTimeout = this.transporter.defaults.timeout;
        },
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
            list: async (options) => {
              calls.list += 1;
              return messageList ? messageList(options) : { data: { messages: [] } };
            },
            get: async ({ id }) => {
              calls.get += 1;
              return messageGet ? messageGet(id) : { data: {} };
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
    scheduleLeaseRenewal,
    cancelLeaseRenewal,
  });

  return {
    calls,
    service,
    isLockHeld: (lockKey = 'connection:7') => {
      const lease = heldLocks.get(String(lockKey));
      return Boolean(lease && lease.expiresAt > Date.now());
    },
    expireLock: (lockKey = 'connection:7') => {
      const lease = heldLocks.get(String(lockKey));
      if (lease) lease.expiresAt = 0;
    },
    setStaleLock: (lockKey = 'connection:7') => {
      heldLocks.set(String(lockKey), { ownerToken: 'abandoned-owner', expiresAt: 0 });
    },
    processedRows,
  };
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

test('the exact Nova assessment email is classified, matched, and updates the application', async () => {
  const application = {
    id: 73,
    company: 'Nova',
    position: 'Graduate Trainee',
    status: 'Applied',
    updated_at: new Date(Date.now() - 86400000),
    interview_date: null,
    interview_time: null,
    interview_type: null,
    notification_channels: [],
    application_link: null,
    interview_email: null,
  };
  const raw = Buffer.from([
    'From: Tshiamo Malefo <tshiamomalefo0@gmail.com>',
    'To: cassandratshiamo2@gmail.com',
    'Subject: Nova application',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Dear Cassandra',
    'You are invited for an assesment',
    'Kind regard',
    'Nova recruitment team',
  ].join('\r\n')).toString('base64url');
  const { calls, service, processedRows } = createTestService({
    applications: [application],
    historyList: async () => ({
      data: {
        historyId: 'history-nova-assessment',
        history: [{ messagesAdded: [{ message: { id: 'nova-assessment-message' } }] }],
      },
    }),
    messageGet: async () => ({
      data: {
        labelIds: [],
        raw,
        threadId: 'nova-thread',
        internalDate: String(Date.now()),
      },
    }),
  });

  const result = await service.syncConnection(7);

  assert.deepEqual(result.outcomes, ['updated']);
  assert.equal(calls.get, 1);
  assert.equal(application.status, 'Assessment');
  assert.equal(processedRows.get('nova-assessment-message').detectedStatus, 'Assessment');
  assert.equal(processedRows.get('nova-assessment-message').applicationId, 73);
  assert.deepEqual(calls.notifications.map((item) => [item.previous_status, item.new_status]), [
    ['Applied', 'Assessment'],
  ]);
});

test('a previously ignored Nova email can be explicitly retried in place without duplicate notifications', async () => {
  const application = {
    id: 74,
    company: 'Nova',
    position: 'Graduate Trainee',
    status: 'Applied',
    updated_at: new Date(Date.now() - 86400000),
    interview_date: null,
    interview_time: null,
    interview_type: null,
    notification_channels: [],
    application_link: null,
    interview_email: null,
  };
  const raw = Buffer.from([
    'From: Tshiamo Malefo <tshiamomalefo0@gmail.com>',
    'To: cassandratshiamo2@gmail.com',
    'Subject: Nova application',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Dear Cassandra',
    'You are invited for an assesment',
    'Kind regard',
    'Nova recruitment team',
  ].join('\r\n')).toString('base64url');
  const { calls, service, processedRows } = createTestService({
    applications: [application],
    existingMessages: [{
      id: 812,
      messageId: 'nova-previously-ignored',
      outcome: 'ignored',
      reviewReason: 'No supported application status rule matched.',
      reprocessVersion: 1,
    }],
    historyList: async () => ({ data: { historyId: 'history-retry', history: [] } }),
    messageGet: async () => ({
      data: {
        labelIds: [],
        raw,
        threadId: 'nova-thread',
        internalDate: String(Date.now()),
      },
    }),
  });

  await assert.rejects(
    service.retryProcessedMessage(5, 812),
    (error) => error.code === 'GMAIL_MESSAGE_NOT_RETRYABLE'
  );
  const firstResult = await service.retryProcessedMessage(4, 812);

  assert.deepEqual(firstResult.outcomes, ['updated']);
  assert.equal(calls.get, 1);
  assert.equal(application.status, 'Assessment');
  assert.equal(processedRows.get('nova-previously-ignored').id, 812);
  assert.equal(processedRows.get('nova-previously-ignored').reprocessVersion, 2);
  assert.equal(calls.notifications.length, 1);
  await assert.rejects(
    service.retryProcessedMessage(4, 812),
    (error) => error.code === 'GMAIL_MESSAGE_NOT_RETRYABLE'
  );
  assert.equal(calls.get, 1);
  assert.equal(calls.notifications.length, 1);
});

test('automatic retry does not double-count an ignored email also returned by Gmail history', async () => {
  const application = {
    id: 75,
    company: 'Nova',
    position: 'Graduate Trainee',
    status: 'Applied',
    updated_at: new Date(Date.now() - 86400000),
    interview_date: null,
    interview_time: null,
    interview_type: null,
    notification_channels: [],
    application_link: null,
    interview_email: null,
  };
  const raw = Buffer.from([
    'From: recruiter@nova.example',
    'To: applyflow@example.com',
    'Subject: Nova application',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'You are invited for an assessment.',
    'Nova recruitment team',
  ].join('\r\n')).toString('base64url');
  const { calls, service, processedRows } = createTestService({
    applications: [application],
    existingMessages: [{
      id: 813,
      messageId: 'nova-overlapping-history',
      outcome: 'ignored',
      reviewReason: 'No supported application status rule matched.',
    }],
    historyList: async () => ({
      data: {
        historyId: 'history-overlapping-retry',
        history: [{ messagesAdded: [{ message: { id: 'nova-overlapping-history' } }] }],
      },
    }),
    messageGet: async () => ({
      data: {
        labelIds: [],
        raw,
        threadId: 'nova-overlapping-thread',
        internalDate: String(Date.now()),
      },
    }),
  });

  const result = await service.syncConnection(7, { reprocessIgnored: true });

  assert.equal(result.processed, 1);
  assert.deepEqual(result.outcomes, ['updated']);
  assert.equal(calls.get, 1);
  assert.equal(processedRows.get('nova-overlapping-history').id, 813);
  assert.equal(application.status, 'Assessment');
  assert.equal(calls.notifications.length, 1);
});

test('an existing review message is re-evaluated and updated in place when a strong match is available', async () => {
  const application = {
    id: 76,
    company: 'Acme Technology',
    position: 'Junior Software Engineer',
    status: 'Applied',
    updated_at: new Date('2026-10-07T06:00:00Z'),
    interview_date: null,
    interview_time: null,
    interview_type: null,
    notification_channels: [],
    application_link: null,
    interview_email: null,
  };
  const raw = Buffer.from([
    'From: recruiting@acme.example',
    'To: applyflow@example.com',
    'Subject: Interview invitation - Acme Technology - Junior Software Engineer',
    'Date: Thu, 08 Oct 2026 08:00:00 +0200',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Acme Technology invites you to interview for the Junior Software Engineer position.',
    'Your interview is scheduled for 09 October 2026 at 08:30.',
  ].join('\r\n')).toString('base64url');
  const { service, processedRows, calls } = createTestService({
    existingMessage: 'review',
    applications: [application],
    historyList: async () => ({
      data: {
        historyId: 'history-review-retry',
        history: [{ messagesAdded: [{ message: { id: 'already-processed' } }] }],
      },
    }),
    messageGet: async () => ({
      data: {
        labelIds: [],
        raw,
        threadId: 'review-retry-thread',
        internalDate: String(new Date('2026-10-08T06:00:00Z').getTime()),
      },
    }),
  });

  const result = await service.syncConnection(7);

  assert.deepEqual(result.outcomes, ['updated']);
  assert.equal(processedRows.size, 1);
  assert.equal(processedRows.get('already-processed').id, 99);
  assert.equal(processedRows.get('already-processed').outcome, 'updated');
  assert.equal(calls.applicationUpdates, 1);
  assert.equal(application.status, 'Interview');
  assert.deepEqual(calls.notifications.map(({ read, previous_status, new_status }) => ({
    read,
    previous_status,
    new_status,
  })), [{ read: false, previous_status: 'Applied', new_status: 'Interview' }]);
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

test('an active connection lease is renewed while Gmail work is still running', async () => {
  let releaseHistory;
  let startedHistory;
  let renewLease;
  const historyStarted = new Promise((resolve) => { startedHistory = resolve; });
  const { calls, service } = createTestService({
    historyList: async () => {
      startedHistory();
      return new Promise((resolve) => { releaseHistory = resolve; });
    },
    scheduleLeaseRenewal(callback) {
      renewLease = callback;
      return { unref() {} };
    },
    cancelLeaseRenewal() {},
  });

  const runningSync = service.syncConnection(7);
  await historyStarted;
  assert.equal(calls.leaseRenewals, 1);
  renewLease();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.leaseRenewals, 2);
  releaseHistory({ data: { historyId: 'history-after-renewal', history: [] } });
  await runningSync;
});

test('per-connection leases coordinate manual syncs across service instances', async () => {
  let releaseHistory;
  let startedHistory;
  const historyStarted = new Promise((resolve) => { startedHistory = resolve; });
  const leaseStore = new Map();
  const first = createTestService({
    leaseStore,
    historyList: async () => {
      startedHistory();
      return new Promise((resolve) => { releaseHistory = resolve; });
    },
  });
  const second = createTestService({ leaseStore });

  const firstSync = first.service.syncConnection(7);
  await historyStarted;
  const secondResult = await second.service.syncConnection(7);

  assert.equal(secondResult.inProgress, true);
  assert.equal(second.calls.history, 0);
  releaseHistory({ data: { historyId: 'history-cross-instance', history: [] } });
  await firstSync;
  assert.equal(first.isLockHeld(), false);
});

test('a background sweep and a manual sync cannot process one Gmail connection simultaneously', async () => {
  let releaseHistory;
  let startedHistory;
  const historyStarted = new Promise((resolve) => { startedHistory = resolve; });
  const { calls, service, isLockHeld } = createTestService({
    historyList: async () => {
      startedHistory();
      return new Promise((resolve) => { releaseHistory = resolve; });
    },
  });

  const workerSweep = service.syncAllConnected();
  await historyStarted;
  const manualResult = await service.syncConnection(7);

  assert.equal(manualResult.inProgress, true);
  assert.equal(calls.history, 1);
  assert.equal(isLockHeld('worker:worker'), true);

  releaseHistory({ data: { historyId: 'history-after-worker', history: [] } });
  await workerSweep;
  assert.equal(isLockHeld('worker:worker'), false);
  assert.equal(isLockHeld(), false);
});

test('an older status email is reviewed instead of overwriting a newer application state', async () => {
  const application = {
    id: 81,
    company: 'Acme Technology',
    position: 'Junior Software Engineer',
    status: 'Interview',
    updated_at: new Date('2026-10-08T10:00:00Z'),
    interview_date: null,
    interview_time: null,
    interview_type: null,
    notification_channels: [],
    application_link: null,
    interview_email: null,
  };
  const raw = Buffer.from([
    'From: recruiting@acme.example',
    'To: applyflow@example.com',
    'Subject: Application update - Acme Technology - Junior Software Engineer',
    'Date: Thu, 08 Oct 2026 08:00:00 +0200',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'We regret to inform you that your application was not selected for the Junior Software Engineer position at Acme Technology.',
  ].join('\r\n')).toString('base64url');
  const { calls, service, processedRows } = createTestService({
    applications: [application],
    historyList: async () => ({
      data: {
        historyId: 'history-stale-email',
        history: [{ messagesAdded: [{ message: { id: 'stale-status-email' } }] }],
      },
    }),
    messageGet: async () => ({
      data: {
        labelIds: [],
        raw,
        threadId: 'stale-status-thread',
        internalDate: String(new Date('2026-10-08T06:00:00Z').getTime()),
      },
    }),
  });

  const result = await service.syncConnection(7);

  assert.deepEqual(result.outcomes, ['review']);
  assert.equal(application.status, 'Interview');
  assert.equal(calls.applicationUpdates, 0);
  assert.equal(processedRows.get('stale-status-email').outcome, 'review');
});

test('worker sweeps use a database lock shared by separate service instances', async () => {
  const heldLocks = new Map();
  let releaseConnectionList;
  let startedConnectionList;
  const connectionListStarted = new Promise((resolve) => { startedConnectionList = resolve; });
  let connectionListCalls = 0;

  function createWorkerOnlyService() {
    const pool = {
      async query(sql, params = []) {
        if (sql.startsWith('INSERT INTO gmail_sync_leases')) {
          const existing = heldLocks.get(params[0]);
          if (existing && existing.expiresAt > Date.now()) return { rowCount: 0, rows: [] };
          heldLocks.set(params[0], { ownerToken: params[1], expiresAt: Date.now() + 180000 });
          return { rowCount: 1, rows: [{ owner_token: params[1] }] };
        }
        if (sql.startsWith('UPDATE gmail_sync_leases SET')) {
          const existing = heldLocks.get(params[0]);
          if (!existing || existing.ownerToken !== params[1]) return { rowCount: 0, rows: [] };
          existing.expiresAt = Date.now() + 180000;
          return { rowCount: 1, rows: [{ owner_token: params[1] }] };
        }
        if (sql.startsWith('DELETE FROM gmail_sync_leases')) {
          const existing = heldLocks.get(params[0]);
          if (!existing || existing.ownerToken !== params[1]) return { rowCount: 0, rows: [] };
          heldLocks.delete(params[0]);
          return { rowCount: 1, rows: [{ lock_key: params[0] }] };
        }
        if (sql.startsWith('SELECT id FROM gmail_connections WHERE is_connected = TRUE ORDER BY id')) {
          connectionListCalls += 1;
          startedConnectionList();
          return new Promise((resolve) => { releaseConnectionList = resolve; });
        }
        throw new Error(`Unexpected worker pool query: ${sql}`);
      },
    };
    return createGmailSyncService({ pool, env: {} });
  }

  const firstService = createWorkerOnlyService();
  const secondService = createWorkerOnlyService();
  const firstSweep = firstService.syncAllConnected();
  await connectionListStarted;
  const secondSweep = await secondService.syncAllConnected();

  assert.deepEqual(secondSweep, []);
  assert.equal(connectionListCalls, 1);
  assert.equal(heldLocks.has('worker:worker'), true);

  releaseConnectionList({ rowCount: 0, rows: [] });
  assert.deepEqual(await firstSweep, []);
  assert.equal(heldLocks.has('worker:worker'), false);
});

test('the worker releases its database lock when loading connections fails', async () => {
  const heldLocks = new Map();
  const pool = {
    async query(sql, params = []) {
      if (sql.startsWith('INSERT INTO gmail_sync_leases')) {
        heldLocks.set(params[0], { ownerToken: params[1], expiresAt: Date.now() + 180000 });
        return { rowCount: 1, rows: [{ owner_token: params[1] }] };
      }
      if (sql.startsWith('UPDATE gmail_sync_leases SET')) {
        const existing = heldLocks.get(params[0]);
        if (!existing || existing.ownerToken !== params[1]) return { rowCount: 0, rows: [] };
        existing.expiresAt = Date.now() + 180000;
        return { rowCount: 1, rows: [{ owner_token: params[1] }] };
      }
      if (sql.startsWith('DELETE FROM gmail_sync_leases')) {
        heldLocks.delete(params[0]);
        return { rowCount: 1, rows: [{ lock_key: params[0] }] };
      }
      throw new Error('Synthetic Gmail connection list failure');
    },
  };
  const service = createGmailSyncService({ pool, env: {} });

  await assert.rejects(service.syncAllConnected(), /Synthetic Gmail connection list failure/);
  assert.equal(heldLocks.has('worker:worker'), false);
});

test('the Gmail worker waits for its first interval and does not overlap local sweeps', async () => {
  let runWorker;
  let scheduledInterval;
  let workerCalls = 0;
  let releaseFirstSweep;
  let startedFirstSweep;
  const firstSweepStarted = new Promise((resolve) => { startedFirstSweep = resolve; });
  const firstSweep = new Promise((resolve) => { releaseFirstSweep = resolve; });
  const timer = { timer: true };

  const returnedTimer = startGmailSyncWorker({
    async syncAllConnected() {
      workerCalls += 1;
      if (workerCalls === 1) {
        startedFirstSweep();
        await firstSweep;
      }
    },
  }, { GMAIL_SYNC_INTERVAL_MS: '60000' }, (callback, intervalMs) => {
    runWorker = callback;
    scheduledInterval = intervalMs;
    return timer;
  });

  assert.equal(returnedTimer, timer);
  assert.equal(scheduledInterval, 60000);
  assert.equal(workerCalls, 0);

  const firstTick = runWorker();
  await firstSweepStarted;
  await runWorker();
  assert.equal(workerCalls, 1);

  releaseFirstSweep();
  await firstTick;
  await runWorker();
  assert.equal(workerCalls, 2);
});

test('the Gmail worker clamps short intervals and defaults invalid intervals', () => {
  let shortInterval;
  startGmailSyncWorker({ async syncAllConnected() {} }, { GMAIL_SYNC_INTERVAL_MS: '1000' }, (_run, intervalMs) => {
    shortInterval = intervalMs;
  });
  assert.equal(shortInterval, 30000);

  const originalWarn = console.warn;
  let warningCount = 0;
  let invalidInterval;
  console.warn = () => { warningCount += 1; };
  try {
    startGmailSyncWorker({ async syncAllConnected() {} }, { GMAIL_SYNC_INTERVAL_MS: 'invalid' }, (_run, intervalMs) => {
      invalidInterval = intervalMs;
    });
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(invalidInterval, 120000);
  assert.equal(warningCount, 1);
});

test('a failed Gmail sync releases its database lease for the next attempt', async () => {
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

test('a lease release failure reports an error and the lease expires safely', async () => {
  const { service, isLockHeld, expireLock } = createTestService({ failUnlock: true });

  await assert.rejects(service.syncConnection(7), /Synthetic sync lease release failure/);
  assert.equal(isLockHeld(), true);
  assert.equal((await service.syncConnection(7)).inProgress, true);
  expireLock();
  const retryResult = await service.syncConnection(7);
  assert.equal(retryResult.inProgress, undefined);
  assert.equal(isLockHeld(), false);
});

test('a lease release that is not confirmed remains protected until expiry', async () => {
  const { service, isLockHeld, expireLock } = createTestService({ unlockReturnsFalse: true });

  await assert.rejects(service.syncConnection(7), /lease release could not be confirmed/);
  assert.equal(isLockHeld(), true);
  assert.equal((await service.syncConnection(7)).inProgress, true);
  expireLock();

  const retryResult = await service.syncConnection(7);
  assert.equal(retryResult.inProgress, undefined);
  assert.equal(isLockHeld(), false);
});

test('an expired lease left by a crashed sync can be acquired by the next attempt', async () => {
  const { calls, service, isLockHeld, setStaleLock } = createTestService();
  setStaleLock();
  const recovered = await service.syncConnection(7);

  assert.equal(recovered.inProgress, undefined);
  assert.equal(calls.locks, 1);
  assert.equal(isLockHeld(), false);
});

test('a lost lease renewal stops Gmail work and releases only the current owner lease', async () => {
  const { calls, service, isLockHeld } = createTestService({ failLeaseRenewal: true });

  await assert.rejects(service.syncConnection(7), /Synthetic sync lease renewal failure/);

  assert.equal(calls.profile, 0);
  assert.equal(calls.get, 0);
  assert.equal(calls.unlocks, 1);
  assert.equal(isLockHeld(), false);
});

test('an ambiguous lease acquisition failure is cleaned up by its owner token', async () => {
  const { service, isLockHeld } = createTestService({ failLockAcquisition: true });

  await assert.rejects(service.syncConnection(7), /Synthetic sync lease acquisition response failure/);
  assert.equal(isLockHeld(), false);

  const retryResult = await service.syncConnection(7);
  assert.equal(retryResult.inProgress, undefined);
  assert.equal(isLockHeld(), false);
});

test('a hanging Gmail request times out, releases its lock, and recovers on retry', async () => {
  let historyAttempts = 0;
  let timedOutSignal;
  const { calls, service, isLockHeld } = createTestService({
    requestTimeoutMs: 10,
    historyList: async (requestOptions) => {
      historyAttempts += 1;
      if (historyAttempts === 1) {
        timedOutSignal = requestOptions.signal;
        return new Promise(() => {});
      }
      return { data: { historyId: 'history-after-timeout', history: [] } };
    },
  });

  await assert.rejects(service.syncConnection(7), /Gmail sync failed/);
  assert.equal(timedOutSignal.aborted, true);
  assert.equal(calls.oauthTimeout, 10);
  assert.deepEqual(calls.lockQueryTimeouts, []);
  assert.deepEqual(calls.historyCursorUpdates, []);
  assert.equal(isLockHeld(), false);

  const retryResult = await service.syncConnection(7);
  assert.equal(retryResult.inProgress, undefined);
  assert.equal(historyAttempts, 2);
  assert.equal(isLockHeld(), false);
  assert.deepEqual(calls.historyCursorUpdates, ['history-after-timeout']);
});

test('an expired Gmail history cursor resets and falls back to initial message sync', async () => {
  const { calls, service } = createTestService({
    historyList: async () => {
      const error = new Error('History ID is too old');
      error.response = { status: 404 };
      throw error;
    },
    messageList: async () => ({ data: { messages: [] } }),
  });

  const result = await service.syncConnection(7);

  assert.equal(calls.historyResets, 1);
  assert.equal(calls.profile, 1);
  assert.equal(calls.list, 1);
  assert.equal(result.initialSyncComplete, true);
  assert.deepEqual(calls.initialSyncCursorUpdates, ['initial-history', 'initial-history']);
});

test('scenario 13: malformed message records a warning and the next valid email still applies', async () => {
  const application = {
    id: 71,
    company: 'Acme Technology',
    position: 'Junior Software Engineer',
    status: 'Applied',
    updated_at: new Date('2026-10-07T06:00:00Z'),
    interview_date: null,
    interview_time: null,
    interview_type: 'Panel',
    notification_channels: [],
    application_link: null,
    interview_email: null,
  };
  const validRaw = Buffer.from([
    'From: hiring@acme.example',
    'To: applyflow@example.com',
    'Subject: Interview invitation - Acme Technology - Junior Software Engineer',
    'Date: Thu, 08 Oct 2026 08:00:00 +0200',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Acme Technology invites you to interview for the Junior Software Engineer position.',
    'Your interview is scheduled for 09 October 2026 at 08:30.',
  ].join('\r\n')).toString('base64url');
  const { service, processedRows, calls } = createTestService({
    applications: [application],
    historyList: async () => ({
      data: {
        historyId: 'history-with-one-warning',
        history: [{ messagesAdded: [
          { message: { id: 'malformed-message' } },
          { message: { id: 'valid-interview-message' } },
        ] }],
      },
    }),
    messageGet: async (messageId) => {
      return {
        data: {
          labelIds: [],
          raw: messageId === 'malformed-message'
            ? Buffer.from('INVALID-MIME').toString('base64url')
            : validRaw,
          threadId: 'acme-interview-thread',
          internalDate: String(new Date('2026-10-08T06:00:00Z').getTime()),
        },
      };
    },
    parseMessage: async (buffer) => {
      if (buffer.toString() === 'INVALID-MIME') throw new Error('Synthetic malformed MIME failure');
      return simpleParser(buffer);
    },
  });

  const result = await service.syncConnection(7);

  assert.deepEqual(result.outcomes, ['warning', 'updated']);
  assert.equal(result.warnings.length, 1);
  assert.equal(processedRows.get('malformed-message').outcome, 'review');
  assert.equal(processedRows.get('malformed-message').warning, true);
  assert.equal(processedRows.get('valid-interview-message').outcome, 'updated');
  assert.equal(application.status, 'Interview');
  assert.equal(application.interview_date, '2026-10-09');
  assert.equal(application.interview_time, '08:30');
  assert.equal(application.interview_type, 'Panel');
  assert.equal(calls.get, 2);
});

test('scenario 12: processing the same Gmail message twice has one application and reminder effect', async () => {
  const application = {
    id: 72,
    company: 'Acme Technology',
    position: 'Junior Software Engineer',
    status: 'Applied',
    updated_at: new Date('2026-10-07T06:00:00Z'),
    interview_date: null,
    interview_time: null,
    interview_type: null,
    notification_channels: ['In-app'],
    application_link: null,
    interview_email: null,
  };
  const raw = Buffer.from([
    'From: hiring@acme.example',
    'To: applyflow@example.com',
    'Subject: Interview invitation - Acme Technology - Junior Software Engineer',
    'Date: Thu, 08 Oct 2026 08:00:00 +0200',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Acme Technology invites you to interview for the Junior Software Engineer position.',
    'Your interview is scheduled for 09 October 2026 at 08:30.',
  ].join('\r\n')).toString('base64url');
  let reminderCount = 0;
  const { service, processedRows, calls } = createTestService({
    applications: [application],
    historyList: async () => ({
      data: {
        historyId: 'history-duplicate-test',
        history: [{ messagesAdded: [{ message: { id: 'same-gmail-message' } }] }],
      },
    }),
    messageGet: async () => ({
      data: {
        labelIds: [],
        raw,
        threadId: 'same-gmail-thread',
        internalDate: String(new Date('2026-10-08T06:00:00Z').getTime()),
      },
    }),
    async scheduleInterviewReminder() { reminderCount += 1; },
  });

  const first = await service.syncConnection(7);
  const second = await service.syncConnection(7);

  assert.deepEqual(first.outcomes, ['updated']);
  assert.deepEqual(second.outcomes, ['duplicate']);
  assert.equal(processedRows.size, 1);
  assert.equal(calls.applicationUpdates, 1);
  assert.equal(reminderCount, 1);
  assert.equal(calls.notifications.length, 1);
  assert.equal(calls.notifications[0].read, false);
  assert.equal(application.status, 'Interview');
  assert.equal(application.interview_date, '2026-10-09');
  assert.equal(application.interview_time, '08:30');
});

test('scenario 15: an interview date without a time preserves existing time and type', async () => {
  const application = {
    id: 73,
    company: 'Acme Technology',
    position: 'Junior Software Engineer',
    status: 'Interview',
    updated_at: new Date('2026-10-08T05:00:00Z'),
    interview_date: null,
    interview_time: '07:30:00',
    interview_type: 'Panel',
    notification_channels: [],
    application_link: null,
    interview_email: null,
  };
  const raw = Buffer.from([
    'From: hiring@acme.example',
    'To: applyflow@example.com',
    'Subject: Interview invitation - Acme Technology - Junior Software Engineer',
    'Date: Thu, 08 Oct 2026 08:00:00 +0200',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Acme Technology invites you to interview for the Junior Software Engineer position.',
    'Your interview is scheduled for 09 October 2026.',
  ].join('\r\n')).toString('base64url');
  const { service } = createTestService({
    applications: [application],
    historyList: async () => ({
      data: {
        historyId: 'history-date-only-test',
        history: [{ messagesAdded: [{ message: { id: 'date-only-message' } }] }],
      },
    }),
    messageGet: async () => ({
      data: {
        labelIds: [],
        raw,
        threadId: 'date-only-thread',
        internalDate: String(new Date('2026-10-08T06:00:00Z').getTime()),
      },
    }),
  });

  const result = await service.syncConnection(7);

  assert.deepEqual(result.outcomes, ['updated']);
  assert.equal(application.status, 'Interview');
  assert.equal(application.interview_date, '2026-10-09');
  assert.equal(application.interview_time, '07:30:00');
  assert.equal(application.interview_type, 'Panel');
});

test('scenarios 8 and 9: Pnet and LinkedIn recommendations stay ignored even when a saved role is named', async () => {
  const application = {
    id: 74,
    company: 'Shoprite',
    position: 'Cashier',
    status: 'Applied',
    updated_at: new Date('2026-10-07T06:00:00Z'),
    interview_date: null,
    interview_time: null,
    interview_type: null,
    notification_channels: [],
    application_link: null,
    interview_email: null,
  };
  const rawMessages = {
    'pnet-alert': Buffer.from([
      'From: alerts@pnet.co.za',
      'To: applyflow@example.com',
      'Subject: Pnet Job Alert: Interview roles',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Shoprite Cashier roles are recommended for you. We have shortlisted opportunities matching your profile.',
    ].join('\r\n')).toString('base64url'),
    'linkedin-alert': Buffer.from([
      'From: jobs-noreply@linkedin.com',
      'To: applyflow@example.com',
      'Subject: LinkedIn Job Alerts',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Shoprite Cashier roles are recommended for you. You have been shortlisted for these roles.',
    ].join('\r\n')).toString('base64url'),
  };
  const { service, processedRows, calls } = createTestService({
    applications: [application],
    historyList: async () => ({
      data: {
        historyId: 'history-alert-test',
        history: [{ messagesAdded: [
          { message: { id: 'pnet-alert' } },
          { message: { id: 'linkedin-alert' } },
        ] }],
      },
    }),
    messageGet: async (id) => ({ data: { labelIds: [], raw: rawMessages[id], internalDate: String(Date.now()) } }),
  });

  const result = await service.syncConnection(7);

  assert.deepEqual(result.outcomes, ['ignored', 'ignored']);
  assert.equal(processedRows.get('pnet-alert').outcome, 'ignored');
  assert.equal(processedRows.get('linkedin-alert').outcome, 'ignored');
  assert.equal(calls.applicationUpdates, 0);
  assert.equal(application.status, 'Applied');
});

test('a Pnet alert with explicit existing-application context can still be applied', async () => {
  const application = {
    id: 75,
    company: 'Shoprite',
    position: 'Cashier',
    status: 'Applied',
    updated_at: new Date('2026-10-07T06:00:00Z'),
    interview_date: null,
    interview_time: null,
    interview_type: null,
    notification_channels: [],
    application_link: null,
    interview_email: null,
  };
  const raw = Buffer.from([
    'From: alerts@pnet.co.za',
    'To: applyflow@example.com',
    'Subject: Pnet Job Alert - update on your application',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Shoprite Cashier: your application was rejected.',
  ].join('\r\n')).toString('base64url');
  const { service, processedRows, calls } = createTestService({
    applications: [application],
    historyList: async () => ({
      data: {
        historyId: 'history-pnet-application',
        history: [{ messagesAdded: [{ message: { id: 'pnet-existing-application' } }] }],
      },
    }),
    messageGet: async () => ({
      data: { labelIds: [], raw, internalDate: String(new Date('2026-10-08T06:00:00Z').getTime()) },
    }),
  });

  const result = await service.syncConnection(7);

  assert.deepEqual(result.outcomes, ['updated']);
  assert.equal(processedRows.get('pnet-existing-application').outcome, 'updated');
  assert.equal(calls.applicationUpdates, 1);
  assert.equal(application.status, 'Rejected');
});

test('Shoprite outcome email matches Cashier and records Interview to Rejected in history', async () => {
  const application = {
    id: 77,
    company: 'Shoprite',
    position: 'Cashier',
    status: 'Interview',
    updated_at: new Date('2026-10-07T06:00:00Z'),
    interview_date: null,
    interview_time: null,
    interview_type: null,
    notification_channels: [],
    application_link: null,
    interview_email: null,
  };
  const subject = 'Shoprite Application Outcome – Cashier Position';
  const raw = Buffer.from([
    'From: Shoprite Careers <careers@shoprite.co.za>',
    'To: applyflow@example.com',
    `Subject: ${subject}`,
    'Date: Thu, 08 Oct 2026 08:00:00 +0200',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Thank you for attending your Shoprite Cashier interview. We regret to inform you that your application was unsuccessful because Shoprite selected another candidate.',
  ].join('\r\n')).toString('base64url');
  const { calls, service, processedRows } = createTestService({
    applications: [application],
    historyList: async () => ({
      data: {
        historyId: 'history-shoprite-rejection',
        history: [{ messagesAdded: [{ message: { id: 'shoprite-rejection' } }] }],
      },
    }),
    messageGet: async () => ({
      data: {
        labelIds: [],
        raw,
        threadId: 'shoprite-rejection-thread',
        internalDate: String(new Date('2026-10-08T06:00:00Z').getTime()),
      },
    }),
  });

  const result = await service.syncConnection(7);
  const historyRow = processedRows.get('shoprite-rejection');

  assert.deepEqual(result.outcomes, ['updated']);
  assert.equal(historyRow.subject, subject);
  assert.equal(historyRow.detectedStatus, 'Rejected');
  assert.equal(historyRow.outcome, 'updated');
  assert.equal(application.status, 'Rejected');
  assert.equal(calls.applicationUpdates, 1);
});

test('a clear Shoprite invitation corrects Rejected to Interview despite unrelated company candidates', async () => {
  const applications = [
    {
      id: 79,
      company: 'Shoprite',
      position: 'Cashier',
      status: 'Rejected',
      updated_at: new Date('2026-10-07T06:00:00Z'),
      interview_date: null,
      interview_time: null,
      interview_type: null,
      notification_channels: [],
      application_link: null,
      interview_email: null,
    },
    { id: 80, company: 'Test Company', position: 'Developer', status: 'Applied' },
    { id: 81, company: 'ABC Test Company', position: 'Analyst', status: 'Applied' },
    { id: 82, company: 'Rejected Test Company', position: 'Engineer', status: 'Rejected' },
  ];
  const raw = Buffer.from([
    'From: Shoprite Careers <careers@shoprite.co.za>',
    'To: applyflow@example.com',
    'Subject: INTERVIEW INVITATION - Shoprite TEST',
    'Date: Thu, 08 Oct 2026 08:00:00 +0200',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Shoprite invites you to an interview for the Cashier position.',
    'Your interview is scheduled for 15 October 2026 at 10:00.',
  ].join('\r\n')).toString('base64url');
  const { calls, service, processedRows } = createTestService({
    applications,
    historyList: async () => ({
      data: {
        historyId: 'history-shoprite-interview-correction',
        history: [{ messagesAdded: [{ message: { id: 'shoprite-interview-correction' } }] }],
      },
    }),
    messageGet: async () => ({
      data: {
        labelIds: [],
        raw,
        threadId: 'shoprite-interview-correction-thread',
        internalDate: String(new Date('2026-10-08T06:00:00Z').getTime()),
      },
    }),
  });

  const result = await service.syncConnection(7);
  const processed = processedRows.get('shoprite-interview-correction');

  assert.deepEqual(result.outcomes, ['updated']);
  assert.equal(processed.detectedStatus, 'Interview');
  assert.equal(processed.applicationId, 79);
  assert.equal(applications[0].status, 'Interview');
  assert.equal(applications[0].interview_date, '2026-10-15');
  assert.equal(applications[0].interview_time, '10:00');
  assert.deepEqual(applications.slice(1).map(({ status }) => status), ['Applied', 'Applied', 'Rejected']);
  assert.equal(calls.applicationUpdates, 1);
  assert.equal(calls.notifications.length, 1);
  assert.equal(calls.notifications[0].read, false);
  assert.equal(calls.notifications[0].previous_status, 'Rejected');
  assert.equal(calls.notifications[0].new_status, 'Interview');
  assert.equal(calls.notifications[0].event_key, 'status-change:79:shoprite-interview-correction');
});

test('a Microsoft rejection updates the matching Applied application and notifies once', async () => {
  const application = {
    id: 83,
    company: 'Microsoft',
    position: 'Software Engineer',
    status: 'Applied',
    updated_at: new Date('2026-10-07T06:00:00Z'),
    interview_date: null,
    interview_time: null,
    interview_type: null,
    notification_channels: [],
    application_link: null,
    interview_email: null,
  };
  const raw = Buffer.from([
    'From: Microsoft Recruiting <recruiting@microsoft.com>',
    'To: applyflow@example.com',
    'Subject: Microsoft Application Update',
    'Date: Thu, 08 Oct 2026 08:00:00 +0200',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'We regret to inform you that your Microsoft Software Engineer application was unsuccessful.',
  ].join('\r\n')).toString('base64url');
  const { calls, service } = createTestService({
    applications: [application],
    historyList: async () => ({
      data: {
        historyId: 'history-microsoft-rejection',
        history: [{ messagesAdded: [{ message: { id: 'microsoft-rejection' } }] }],
      },
    }),
    messageGet: async () => ({
      data: {
        labelIds: [],
        raw,
        internalDate: String(new Date('2026-10-08T06:00:00Z').getTime()),
      },
    }),
  });

  const result = await service.syncConnection(7);

  assert.deepEqual(result.outcomes, ['updated']);
  assert.equal(application.status, 'Rejected');
  assert.equal(calls.applicationUpdates, 1);
  assert.equal(calls.notifications.length, 1);
  assert.equal(calls.notifications[0].previous_status, 'Applied');
  assert.equal(calls.notifications[0].new_status, 'Rejected');
  assert.equal(calls.notifications[0].read, false);
});

test('a Google security alert cannot change an application or create a status notification', async () => {
  const application = {
    id: 84,
    company: 'Shoprite',
    position: 'Cashier',
    status: 'Interview',
    updated_at: new Date('2026-10-07T06:00:00Z'),
    interview_date: null,
    interview_time: null,
    interview_type: null,
    notification_channels: [],
    application_link: null,
    interview_email: null,
  };
  const raw = Buffer.from([
    'From: Google <no-reply@accounts.google.com>',
    'To: applyflow@example.com',
    'Subject: Security alert for your Google Account',
    'Date: Thu, 08 Oct 2026 08:00:00 +0200',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'A new device signed in to your Google Account. If this was not you, secure your account.',
  ].join('\r\n')).toString('base64url');
  const { calls, service, processedRows } = createTestService({
    applications: [application],
    historyList: async () => ({
      data: {
        historyId: 'history-google-security-alert',
        history: [{ messagesAdded: [{ message: { id: 'google-security-alert' } }] }],
      },
    }),
    messageGet: async () => ({
      data: {
        labelIds: [],
        raw,
        internalDate: String(new Date('2026-10-08T06:00:00Z').getTime()),
      },
    }),
  });

  const result = await service.syncConnection(7);

  assert.deepEqual(result.outcomes, ['ignored']);
  assert.equal(processedRows.get('google-security-alert').outcome, 'ignored');
  assert.equal(application.status, 'Interview');
  assert.equal(calls.applicationUpdates, 0);
  assert.equal(calls.notifications.length, 0);
});

test('Hitech rejection email with a misspelling updates the matching application and creates an unread notification', async () => {
  const application = {
    id: 78,
    company: 'Hitech',
    position: 'Juniour developer',
    status: 'Applied',
    updated_at: new Date('2026-10-07T06:00:00Z'),
    interview_date: null,
    interview_time: null,
    interview_type: null,
    notification_channels: [],
    application_link: null,
    interview_email: null,
  };
  const subject = 'Responds to an application made';
  const raw = Buffer.from([
    'From: Tshiamo Malefo <tshiamomalefo0@gmail.com>',
    'To: applyflow@example.com',
    `Subject: ${subject}`,
    'Date: Thu, 08 Oct 2026 08:00:00 +0200',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Dear Cassandra',
    '',
    'After a serious competition of large numbers of applicants we unfortunately decided not to carry o with your application',
    '',
    'Best of luch with your career',
    '',
    'Kind regards',
    '',
    'Hitech recruiment team',
  ].join('\r\n')).toString('base64url');
  const { calls, service, processedRows } = createTestService({
    applications: [application],
    existingMessages: [{
      id: 88,
      messageId: 'hitech-rejection',
      outcome: 'ignored',
      reviewReason: 'No supported application status rule matched.',
    }],
    historyList: async () => ({
      data: {
        historyId: 'history-hitech-rejection',
        history: [],
      },
    }),
    messageGet: async () => ({
      data: {
        labelIds: [],
        raw,
        threadId: 'hitech-rejection-thread',
        internalDate: String(new Date('2026-10-08T06:00:00Z').getTime()),
      },
    }),
  });

  const result = await service.syncConnection(7, { reprocessIgnored: true });
  const historyRow = processedRows.get('hitech-rejection');

  assert.deepEqual(result.outcomes, ['updated']);
  assert.equal(historyRow.detectedStatus, 'Rejected');
  assert.equal(historyRow.outcome, 'updated');
  assert.equal(application.status, 'Rejected');
  assert.equal(calls.applicationUpdates, 1);
  assert.deepEqual(calls.notifications, [{
    id: 1,
    user_id: 4,
    application_id: '78',
    notification_type: 'Status Update',
    channel: 'In-app',
    company: 'Hitech',
    position: 'Juniour developer',
    status: 'sent',
    read: false,
    previous_status: 'Applied',
    new_status: 'Rejected',
    event_key: 'status-change:78:hitech-rejection',
  }]);

  const retryResult = await service.syncConnection(7, { reprocessIgnored: true });
  assert.deepEqual(retryResult.outcomes, []);
  assert.equal(calls.get, 1);
  assert.equal(calls.notifications.length, 1);
});

test('a Gmail API authentication failure remains fatal and releases the connection lock', async () => {
  const { service, isLockHeld, calls } = createTestService({
    historyList: async () => ({
      data: {
        historyId: 'history-auth-test',
        history: [{ messagesAdded: [{ message: { id: 'auth-failure-message' } }] }],
      },
    }),
    messageGet: async () => {
      const error = new Error('Unauthorized');
      error.response = { status: 401 };
      throw error;
    },
  });

  await assert.rejects(service.syncConnection(7), /Reconnect Gmail/);
  assert.equal(calls.unlocks, 1);
  assert.equal(isLockHeld(), false);
  assert.ok(calls.connectionUpdates.some((sql) =>
    sql.includes('last_sync_at = NOW(), last_sync_error = $2')
  ));
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

test('scenario 14: Shoprite interview date/time updates an existing Interview without replacing its type', async () => {
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
    updated_at: new Date('2026-10-08T05:00:00Z'),
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
    async query(sql, params = []) {
      if (sql.startsWith('INSERT INTO gmail_sync_leases')) {
        if (lockHeld) return { rowCount: 0, rows: [] };
        lockHeld = true;
        return { rowCount: 1, rows: [{ owner_token: params[1] }] };
      }
      if (sql.startsWith('UPDATE gmail_sync_leases SET')) {
        return { rowCount: lockHeld ? 1 : 0, rows: lockHeld ? [{ owner_token: params[1] }] : [] };
      }
      if (sql.startsWith('DELETE FROM gmail_sync_leases')) {
        lockHeld = false;
        return { rowCount: 1, rows: [{ lock_key: params[0] }] };
      }
      if (sql.startsWith('SELECT * FROM gmail_connections')) return { rowCount: 1, rows: [connection] };
      if (sql.startsWith('SELECT CEIL(EXTRACT(EPOCH FROM (quota_backoff_until')) return { rowCount: 0, rows: [] };
      if (sql.startsWith('SELECT outcome, detected_status')) return { rowCount: 0, rows: [] };
      if (sql.startsWith('SELECT id, company, position, status, updated_at FROM applications')) {
        return { rowCount: 1, rows: [application] };
      }
      if (sql.startsWith('UPDATE gmail_connections')) return { rowCount: 1, rows: [] };
      throw new Error(`Unexpected pool query: ${sql}`);
    },
    async connect() {
      return {
        async query(query, params = []) {
          const sql = typeof query === 'string' ? query : query.text;
          if (typeof query !== 'string') params = query.values || [];
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
            application.status = params[7] ? params[2] : application.status;
            application.interview_date = params[9]
              ? (params[5] || application.interview_date)
              : (application.interview_date || params[5]);
            application.interview_time = params[9]
              ? (params[6] || application.interview_time)
              : (application.interview_time || params[6]);
            application.interview_type = params[9]
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

test('a stale same-status interview email is sent for review without changing newer details', async () => {
  const application = {
    id: 93,
    company: 'Shoprite',
    position: 'Cashier',
    status: 'Interview',
    updated_at: new Date('2026-10-08T07:00:00Z'),
    interview_date: '2026-10-10',
    interview_time: '09:30:00',
    interview_type: 'Panel',
    notification_channels: [],
    application_link: null,
    interview_email: null,
  };
  const raw = Buffer.from([
    'From: Shoprite Careers <careers@shoprite.co.za>',
    'To: applyflow@example.com',
    'Subject: Interview invitation - Shoprite Cashier',
    'Date: Thu, 08 Oct 2026 08:00:00 +0200',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Shoprite invites you to interview for the Cashier position.',
    'Your interview is scheduled for 11 October 2026 at 08:30.',
  ].join('\r\n')).toString('base64url');
  const { calls, service, processedRows } = createTestService({
    applications: [application],
    historyList: async () => ({
      data: {
        historyId: 'history-stale-interview-details',
        history: [{ messagesAdded: [{ message: { id: 'stale-interview-details' } }] }],
      },
    }),
    messageGet: async () => ({
      data: {
        labelIds: [],
        raw,
        threadId: 'stale-interview-thread',
        internalDate: String(new Date('2026-10-08T06:00:00Z').getTime()),
      },
    }),
  });

  const result = await service.syncConnection(7);

  assert.deepEqual(result.outcomes, ['review']);
  assert.equal(calls.applicationUpdates, 0);
  assert.deepEqual(
    [application.status, application.interview_date, application.interview_time, application.interview_type],
    ['Interview', '2026-10-10', '09:30:00', 'Panel']
  );
  assert.equal(processedRows.get('stale-interview-details').outcome, 'review');
});

test('scenarios 1-7: status transitions run through matching, persistence, and application updates', async () => {
  const cases = [
    { current: 'Applied', detected: 'Interview', expected: 'updated', expectedStatus: 'Interview', interview: true },
    { current: 'Applied', detected: 'Rejected', expected: 'updated', expectedStatus: 'Rejected' },
    { current: 'Shortlisted', detected: 'Interview', expected: 'updated', expectedStatus: 'Interview', interview: true },
    { current: 'Interview', detected: 'Offer', expected: 'updated', expectedStatus: 'Offer' },
    { current: 'Interview', detected: 'Interview', expected: 'updated', expectedStatus: 'Interview', interview: true },
    { current: 'Rejected', detected: 'Interview', expected: 'updated', expectedStatus: 'Interview', interview: true },
    { current: 'Offer', detected: 'Interview', expected: 'updated', expectedStatus: 'Interview', interview: true },
  ];
  const emailText = {
    Interview: 'Shoprite invites you to interview for the Cashier position. Your interview is scheduled for 09 October 2026 at 08:30.',
    Rejected: 'Shoprite regrets to inform you that your application was not selected for Cashier.',
    Offer: 'Shoprite is pleased to offer you the Cashier position.',
  };

  for (const [index, scenario] of cases.entries()) {
    const hasExistingInterview = scenario.current === 'Interview';
    const application = {
      id: 80 + index,
      company: 'Shoprite',
      position: 'Cashier',
      status: scenario.current,
      updated_at: new Date('2026-10-07T06:00:00Z'),
      interview_date: hasExistingInterview ? '2026-10-09' : null,
      interview_time: hasExistingInterview ? '07:30:00' : null,
      interview_type: hasExistingInterview ? 'Panel' : null,
      notification_channels: [],
      application_link: null,
      interview_email: null,
    };
    const subject = scenario.detected === 'Interview'
      ? 'INTERVIEW INVITATION - Shoprite Cashier'
      : `Application status - Shoprite Cashier`;
    const raw = Buffer.from([
      'From: careers@shoprite.example',
      'To: applyflow@example.com',
      `Subject: ${subject}`,
      'Date: Thu, 08 Oct 2026 08:00:00 +0200',
      'Content-Type: text/plain; charset=utf-8',
      '',
      emailText[scenario.detected],
    ].join('\r\n')).toString('base64url');
    const { service, processedRows, calls } = createTestService({
      applications: [application],
      historyList: async () => ({
        data: {
          historyId: `status-scenario-${index}`,
          history: [{ messagesAdded: [{ message: { id: `status-scenario-${index}` } }] }],
        },
      }),
      messageGet: async () => ({
        data: {
          labelIds: [],
          raw,
          threadId: `status-scenario-thread-${index}`,
          internalDate: String(new Date('2026-10-08T06:00:00Z').getTime()),
        },
      }),
    });

    const result = await service.syncConnection(7);

    assert.deepEqual(result.outcomes, [scenario.expected], `scenario ${index + 1}`);
    assert.equal(application.status, scenario.expectedStatus, `scenario ${index + 1} status`);
    assert.equal(calls.applicationUpdates, scenario.expected === 'updated' ? 1 : 0, `scenario ${index + 1} write count`);
    const shouldNotify = scenario.expected === 'updated' && scenario.current !== scenario.detected;
    assert.equal(calls.notifications.length, shouldNotify ? 1 : 0, `scenario ${index + 1} notification count`);
    if (shouldNotify) {
      assert.deepEqual(
        calls.notifications.map(({ user_id, application_id, notification_type, channel, company, position, status, read, previous_status, new_status, event_key }) => ({
          user_id,
          application_id,
          notification_type,
          channel,
          company,
          position,
          status,
          read,
          previous_status,
          new_status,
          event_key,
        })),
        [{
          user_id: 4,
          application_id: String(application.id),
          notification_type: 'Status Update',
          channel: 'In-app',
          company: 'Shoprite',
          position: 'Cashier',
          status: 'sent',
          read: false,
          previous_status: scenario.current,
          new_status: scenario.detected,
          event_key: `status-change:${application.id}:status-scenario-${index}`,
        }],
        `scenario ${index + 1} notification contents`
      );
    }
    if (scenario.interview && scenario.expected === 'updated') {
      assert.equal(application.interview_date, '2026-10-09', `scenario ${index + 1} date`);
      assert.equal(application.interview_time, '08:30', `scenario ${index + 1} time`);
      assert.equal(application.interview_type, hasExistingInterview ? 'Panel' : null, `scenario ${index + 1} type`);
    }
    if (scenario.expected === 'review') {
      const row = processedRows.get(`status-scenario-${index}`);
      assert.equal(row.outcome, 'review', `scenario ${index + 1} processed outcome`);
    }
  }
});
