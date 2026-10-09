const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { createApplicationRouter } = require('../application-routes');

function createTestPool({ failAt } = {}) {
  const applications = [{ id: 17, user_id: 7 }, { id: 18, user_id: 8 }];
  const notifications = [
    { id: 41, user_id: 7, application_id: '17', status: 'pending' },
    { id: 42, user_id: 7, application_id: '17', status: 'sent' },
    { id: 43, user_id: 7, application_id: '18', status: 'pending' },
    { id: 44, user_id: 8, application_id: '17', status: 'pending' },
  ];
  const queries = [];
  let snapshot;

  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql === 'BEGIN') {
        snapshot = {
          applications: applications.map((row) => ({ ...row })),
          notifications: notifications.map((row) => ({ ...row })),
        };
        return { rowCount: 1, rows: [] };
      }
      if (sql.startsWith('DELETE FROM applications')) {
        if (failAt === 'application-delete') throw new Error('Application delete failure');
        const index = applications.findIndex(
          (row) => row.id === params[0] && row.user_id === params[1]
        );
        if (index < 0) return { rowCount: 0, rows: [] };
        const [deleted] = applications.splice(index, 1);
        return { rowCount: 1, rows: [{ id: deleted.id }] };
      }
      if (sql.startsWith('DELETE FROM notification_jobs')) {
        if (failAt === 'notification-delete') throw new Error('Notification delete failure');
        const before = notifications.length;
        for (let index = notifications.length - 1; index >= 0; index--) {
          const row = notifications[index];
          if (row.user_id === params[0] && row.application_id === params[1]) {
            notifications.splice(index, 1);
          }
        }
        return { rowCount: before - notifications.length, rows: [] };
      }
      if (sql === 'COMMIT') return { rowCount: 1, rows: [] };
      if (sql === 'ROLLBACK') {
        applications.splice(0, applications.length, ...snapshot.applications);
        notifications.splice(0, notifications.length, ...snapshot.notifications);
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected test query: ${sql}`);
    },
    release() {},
  };

  return {
    applications,
    notifications,
    queries,
    async connect() { return client; },
  };
}

async function withApplicationServer(t, pool) {
  const app = express();
  app.use('/api/applications', createApplicationRouter({
    pool,
    authenticateRequest(req, res, next) {
      if (req.get('authorization') !== 'Bearer user-7') {
        return res.status(401).json({ message: 'Unauthorized.' });
      }
      req.user = { id: 7 };
      return next();
    },
  }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('deleting an application atomically removes only its notification jobs', async (t) => {
  const pool = createTestPool();
  const baseUrl = await withApplicationServer(t, pool);
  const response = await fetch(`${baseUrl}/api/applications/17`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer user-7' },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.deleted, true);
  assert.deepEqual(pool.applications, [{ id: 18, user_id: 8 }]);
  assert.deepEqual(pool.notifications.map(({ id }) => id), [43, 44]);
  assert.equal(pool.queries[0].sql, 'BEGIN');
  assert.equal(pool.queries[1].params[1], 7);
  assert.deepEqual(pool.queries[2].params, [7, '17']);
  assert.equal(pool.queries[3].sql, 'COMMIT');
});

test('notification cleanup failure rolls back application and notification deletion', async (t) => {
  const pool = createTestPool({ failAt: 'notification-delete' });
  const baseUrl = await withApplicationServer(t, pool);
  const response = await fetch(`${baseUrl}/api/applications/17`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer user-7' },
  });

  assert.equal(response.status, 500);
  assert.deepEqual(pool.applications, [{ id: 17, user_id: 7 }, { id: 18, user_id: 8 }]);
  assert.deepEqual(pool.notifications.map(({ id }) => id), [41, 42, 43, 44]);
  assert.equal(pool.queries.at(-1).sql, 'ROLLBACK');
});

test('application deletion failure leaves its notifications untouched', async (t) => {
  const pool = createTestPool({ failAt: 'application-delete' });
  const baseUrl = await withApplicationServer(t, pool);
  const response = await fetch(`${baseUrl}/api/applications/17`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer user-7' },
  });

  assert.equal(response.status, 500);
  assert.deepEqual(pool.applications, [{ id: 17, user_id: 7 }, { id: 18, user_id: 8 }]);
  assert.deepEqual(pool.notifications.map(({ id }) => id), [41, 42, 43, 44]);
  assert.equal(pool.queries.at(-1).sql, 'ROLLBACK');
});

test('a user cannot delete another user application or its notifications', async (t) => {
  const pool = createTestPool();
  const baseUrl = await withApplicationServer(t, pool);
  const response = await fetch(`${baseUrl}/api/applications/18`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer user-7' },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(pool.applications, [{ id: 17, user_id: 7 }, { id: 18, user_id: 8 }]);
  assert.deepEqual(pool.notifications.map(({ id }) => id), [41, 42, 43, 44]);
  assert.equal(pool.queries.at(-1).sql, 'ROLLBACK');
});

test('application deletion requires authentication', async (t) => {
  const pool = createTestPool();
  const baseUrl = await withApplicationServer(t, pool);
  const response = await fetch(`${baseUrl}/api/applications/17`, { method: 'DELETE' });

  assert.equal(response.status, 401);
  assert.equal(pool.queries.length, 0);
});

test('invalid application IDs are rejected without opening a database transaction', async (t) => {
  const pool = createTestPool();
  const baseUrl = await withApplicationServer(t, pool);
  const response = await fetch(`${baseUrl}/api/applications/not-an-id`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer user-7' },
  });

  assert.equal(response.status, 400);
  assert.equal(pool.queries.length, 0);
});
