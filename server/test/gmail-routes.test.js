const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { createGmailRouter } = require('../gmail-routes');

function createTestPool(options) {
  const { message, application, history = [], notifications } = options;
  const applications = options.applications || [application];
  const client = {
    async query(sql, params = []) {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rowCount: 1, rows: [] };
      }
      if (sql.startsWith('SELECT id, detected_status')) {
        return { rowCount: 1, rows: [message] };
      }
      if (sql.startsWith('SELECT id, company, position, status')) {
        const selectedApplication = applications.find(
          (item) => String(item.id) === String(params[0])
        );
        return {
          rowCount: selectedApplication ? 1 : 0,
          rows: selectedApplication ? [{ ...selectedApplication }] : [],
        };
      }
      if (sql.startsWith('UPDATE applications SET')) {
        const [, , nextStatus, nextDate, preserveStatus, nextTime, nextType] = params;
        const selectedApplication = applications.find(
          (item) => String(item.id) === String(params[0])
        );
        selectedApplication.status = preserveStatus ? nextStatus : selectedApplication.status;
        selectedApplication.interview_date = selectedApplication.interview_date || nextDate;
        selectedApplication.interview_time = selectedApplication.interview_time || nextTime;
        selectedApplication.interview_type = selectedApplication.interview_type || nextType;
        return { rowCount: 1, rows: [{ ...selectedApplication }] };
      }
      if (sql.startsWith('INSERT INTO notification_jobs')) {
        notifications?.push(params);
        return { rowCount: 1, rows: [{ id: 901 }] };
      }
      if (sql.startsWith('UPDATE gmail_processed_messages SET outcome = \'reviewed\'')) {
        message.outcome = 'reviewed';
        message.application_id = params[1];
        message.previous_status = params[2];
        message.new_status = message.detected_status;
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected test query: ${sql}`);
    },
    release() {},
  };

  return {
    async query(sql) {
      if (sql.includes('FROM gmail_processed_messages AS message')) {
        return { rowCount: history.length, rows: history };
      }
      throw new Error(`Unexpected pool query: ${sql}`);
    },
    async connect() { return client; },
  };
}

async function withGmailReviewServer(t, options) {
  const app = express();
  app.use(express.json());
  app.use('/api/gmail', createGmailRouter({
    pool: createTestPool(options),
    syncService: options.syncService || {},
    authenticateRequest(req, res, next) {
      req.user = { id: 7 };
      next();
    },
    scheduleInterviewReminder: options.scheduleInterviewReminder,
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return `http://127.0.0.1:${server.address().port}`;
}

test('manual sync returns a retryable response for Gmail quota cooldowns', async (t) => {
  const baseUrl = await withGmailReviewServer(t, {
    message: {},
    application: {},
    syncService: {
      async syncUser() {
        return { quotaLimited: true, retryAfterSeconds: 90 };
      },
    },
  });

  const response = await fetch(`${baseUrl}/api/gmail/sync`, { method: 'POST' });
  const payload = await response.json();

  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '90');
  assert.equal(payload.retryAfterSeconds, 90);
  assert.match(payload.message, /try again in 90 seconds/i);
});

test('manual sync reports an existing per-user sync without starting another', async (t) => {
  let syncOptions;
  const baseUrl = await withGmailReviewServer(t, {
    message: {},
    application: {},
    syncService: {
      async syncUser(userId, options) {
        assert.equal(userId, 7);
        syncOptions = options;
        return { inProgress: true, processed: 0 };
      },
    },
  });

  const response = await fetch(`${baseUrl}/api/gmail/sync`, { method: 'POST' });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.inProgress, true);
  assert.equal(payload.processed, 0);
  assert.match(payload.message, /already running.*try again shortly/i);
  assert.deepEqual(syncOptions, { reprocessIgnored: true, waitForActiveMs: 15000 });
});

test('authenticated email retry is scoped to the signed-in user and existing history id', async (t) => {
  let retryArguments;
  const baseUrl = await withGmailReviewServer(t, {
    message: {},
    application: {},
    syncService: {
      async retryProcessedMessage(userId, processedMessageId) {
        retryArguments = [userId, processedMessageId];
        return { processed: 1, outcomes: ['updated'] };
      },
    },
  });

  const response = await fetch(`${baseUrl}/api/gmail/messages/812/retry`, { method: 'POST' });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(retryArguments, [7, 812]);
  assert.equal(payload.processed, 1);
  assert.deepEqual(payload.outcomes, ['updated']);
});

test('email retry reports a concurrent sync instead of claiming success', async (t) => {
  const baseUrl = await withGmailReviewServer(t, {
    message: {},
    application: {},
    syncService: {
      async retryProcessedMessage() {
        return { inProgress: true, processed: 0, outcomes: [] };
      },
    },
  });

  const response = await fetch(`${baseUrl}/api/gmail/messages/812/retry`, { method: 'POST' });
  const payload = await response.json();

  assert.equal(response.status, 409);
  assert.equal(payload.inProgress, true);
  assert.match(payload.message, /another Gmail sync is still running/i);
});

test('manual sync returns checked-message outcomes only after the sync page completes', async (t) => {
  const baseUrl = await withGmailReviewServer(t, {
    message: {},
    application: {},
    syncService: {
      async syncUser() {
        return {
          processed: 3,
          outcomes: ['updated', 'review', 'duplicate'],
          initialSyncComplete: true,
        };
      },
    },
  });

  const response = await fetch(`${baseUrl}/api/gmail/sync`, { method: 'POST' });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.message, 'Gmail sync completed.');
  assert.equal(payload.processed, 3);
  assert.deepEqual(payload.outcomes, ['updated', 'review', 'duplicate']);
  assert.equal(payload.initialSyncComplete, true);
});

test('manual sync preserves a safe reconnect message for expired Gmail authorization', async (t) => {
  const baseUrl = await withGmailReviewServer(t, {
    message: {},
    application: {},
    syncService: {
      async syncUser() {
        const error = new Error('Gmail access was denied or expired. Reconnect Gmail and try again.');
        error.code = 'GMAIL_AUTH_EXPIRED';
        throw error;
      },
    },
  });

  const response = await fetch(`${baseUrl}/api/gmail/sync`, { method: 'POST' });
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.match(payload.message, /reconnect Gmail/i);
});

test('review endpoint fills an already-Interview application and schedules its complete in-app reminder', async (t) => {
  const application = {
    id: 13,
    company: 'Test Company',
    position: 'Software Developer',
    status: 'Interview',
    interview_date: null,
    interview_time: null,
    interview_type: null,
    notification_channels: ['In-app'],
    application_link: null,
    interview_email: null,
  };
  let reminderCall;
  const baseUrl = await withGmailReviewServer(t, {
    message: {
      id: 88,
      detected_status: 'Interview',
      detected_interview_date: '2026-10-15',
      detected_interview_time: '10:00',
      detected_interview_type: 'Video',
    },
    application,
    async scheduleInterviewReminder(data) { reminderCall = data; },
  });

  const response = await fetch(`${baseUrl}/api/gmail/review/88`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'apply', applicationId: '13' }),
  });

  assert.equal(response.status, 200);
  assert.equal(application.status, 'Interview');
  assert.equal(application.interview_date, '2026-10-15');
  assert.equal(application.interview_time, '10:00');
  assert.equal(application.interview_type, 'Video');
  assert.equal(reminderCall.applicationId, '13');
  assert.equal(reminderCall.interviewDate, '2026-10-15');
  assert.equal(reminderCall.interviewTime, '10:00');
});

test('review endpoint marks an already-Interview application with no new details as up to date', async (t) => {
  const application = {
    id: 13,
    company: 'Test Company',
    position: 'Software Developer',
    status: 'Interview',
    interview_date: null,
    interview_time: null,
    interview_type: null,
    notification_channels: ['In-app'],
    application_link: null,
    interview_email: null,
  };
  const baseUrl = await withGmailReviewServer(t, {
    message: {
      id: 89,
      detected_status: 'Interview',
      detected_interview_date: null,
      detected_interview_time: null,
      detected_interview_type: null,
    },
    application,
    async scheduleInterviewReminder() { assert.fail('Reminder must not be scheduled without details.'); },
  });

  const response = await fetch(`${baseUrl}/api/gmail/review/89`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'apply', applicationId: '13' }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.message, 'Application is already up to date.');
  assert.equal(application.status, 'Interview');
  assert.equal(application.interview_date, null);
  assert.equal(application.interview_time, null);
});

test('review endpoint creates one status-change notification transactionally', async (t) => {
  const application = {
    id: 14,
    company: 'Test Company',
    position: 'Software Developer',
    status: 'Applied',
    interview_date: null,
    interview_time: null,
    interview_type: null,
    notification_channels: [],
    application_link: null,
    interview_email: null,
  };
  const notifications = [];
  const baseUrl = await withGmailReviewServer(t, {
    message: {
      id: 90,
      detected_status: 'Shortlisted',
      detected_interview_date: null,
      detected_interview_time: null,
      detected_interview_type: null,
    },
    application,
    notifications,
  });

  const response = await fetch(`${baseUrl}/api/gmail/review/90`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'apply', applicationId: '14' }),
  });

  assert.equal(response.status, 200);
  assert.equal(application.status, 'Shortlisted');
  assert.equal(notifications.length, 1);
  assert.deepEqual(notifications[0].slice(0, 6), [
    7, '14', 'Status Update', 'In-app', 'Test Company', 'Software Developer',
  ]);
  assert.deepEqual(notifications[0].slice(7, 9), ['Applied', 'Shortlisted']);
});

test('applying an assessment review persists status on the selected application and records history', async (t) => {
  const selectedApplication = {
    id: 17,
    company: 'Test Company Alpha',
    position: 'Software Developer Intern',
    status: 'Applied',
    interview_date: null,
    interview_time: null,
    interview_type: null,
    notification_channels: [],
    application_link: null,
    interview_email: null,
  };
  const otherApplication = {
    ...selectedApplication,
    id: 18,
    company: 'Test Company Beta',
    status: 'Applied',
  };
  const message = {
    id: 91,
    detected_status: 'Assessment',
    detected_interview_date: null,
    detected_interview_time: null,
    detected_interview_type: null,
  };
  const notifications = [];
  const baseUrl = await withGmailReviewServer(t, {
    message,
    application: selectedApplication,
    applications: [selectedApplication, otherApplication],
    notifications,
  });

  const response = await fetch(`${baseUrl}/api/gmail/review/91`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'apply', applicationId: '17' }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.message, 'Application status updated.');
  assert.equal(selectedApplication.status, 'Assessment');
  assert.equal(otherApplication.status, 'Applied');
  assert.equal(message.outcome, 'reviewed');
  assert.equal(message.application_id, 17);
  assert.equal(message.previous_status, 'Applied');
  assert.equal(message.new_status, 'Assessment');
  assert.equal(notifications.length, 1);
  assert.deepEqual(notifications[0].slice(7, 9), ['Applied', 'Assessment']);
});

test('history endpoint returns processed interview details and matched application', async (t) => {
  const history = [{
    id: 88,
    subject: 'INTERVIEW INVITATION',
    outcome: 'updated',
    detected_status: 'Interview',
    detected_interview_date: '2026-10-09',
    detected_interview_time: '08:30',
    detected_interview_type: null,
    application_company: 'Shoprite',
    application_position: 'Graduate Programme',
    application_status: 'Interview',
  }];
  const baseUrl = await withGmailReviewServer(t, {
    message: {},
    application: {},
    history,
  });

  const response = await fetch(`${baseUrl}/api/gmail/history`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload.messages, history.map((message) => ({ ...message, retryable: false })));
});