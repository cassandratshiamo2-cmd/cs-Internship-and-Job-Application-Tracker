const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { createGmailRouter } = require('../gmail-routes');

function createTestPool({ message, application, history = [] }) {
  const client = {
    async query(sql, params = []) {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rowCount: 1, rows: [] };
      }
      if (sql.startsWith('SELECT id, detected_status')) {
        return { rowCount: 1, rows: [message] };
      }
      if (sql.startsWith('SELECT id, company, position, status')) {
        return { rowCount: 1, rows: [{ ...application }] };
      }
      if (sql.startsWith('UPDATE applications SET')) {
        const [, , nextStatus, nextDate, preserveStatus, nextTime, nextType] = params;
        application.status = preserveStatus ? application.status : nextStatus;
        application.interview_date = application.interview_date || nextDate;
        application.interview_time = application.interview_time || nextTime;
        application.interview_type = application.interview_type || nextType;
        return { rowCount: 1, rows: [{ ...application }] };
      }
      if (sql.startsWith('UPDATE gmail_processed_messages SET outcome = \'reviewed\'')) {
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
  const baseUrl = await withGmailReviewServer(t, {
    message: {},
    application: {},
    syncService: {
      async syncUser() {
        return { inProgress: true, processed: 0 };
      },
    },
  });

  const response = await fetch(`${baseUrl}/api/gmail/sync`, { method: 'POST' });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.inProgress, true);
  assert.equal(payload.processed, 0);
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
  assert.deepEqual(payload.messages, history);
});