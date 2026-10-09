const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { createNotificationRouter } = require('../notification-routes');

function createTestPool() {
  const notifications = new Map([
    ['51', { id: '51', user_id: 7, channel: 'In-app', read: false }],
  ]);
  const queries = [];

  return {
    notifications,
    queries,
    async query(sql, params) {
      queries.push({ sql, params });
      const [id, userId, read] = params;
      const notification = notifications.get(String(id));
      if (!notification || notification.user_id !== userId || notification.channel !== 'In-app') {
        return { rowCount: 0, rows: [] };
      }

      notification.read = read;
      return { rowCount: 1, rows: [{ id: notification.id, read: notification.read }] };
    },
  };
}

async function withNotificationServer(t, pool) {
  const app = express();
  app.use(express.json());
  app.use('/api/notifications', createNotificationRouter({
    pool,
    authenticateRequest(req, res, next) {
      const authorization = req.get('authorization');
      if (!authorization?.startsWith('Bearer user-')) {
        return res.status(401).json({ message: 'Unauthorized.' });
      }
      req.user = { id: Number(authorization.slice('Bearer user-'.length)) };
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

test('PATCH notification read state defaults to read and persists read/unread changes', async (t) => {
  const pool = createTestPool();
  const baseUrl = await withNotificationServer(t, pool);

  const defaultReadResponse = await fetch(`${baseUrl}/api/notifications/51/read`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer user-7' },
  });
  const defaultReadPayload = await defaultReadResponse.json();

  assert.equal(defaultReadResponse.status, 200);
  assert.equal(defaultReadPayload.notification.read, true);
  assert.equal(pool.notifications.get('51').read, true);

  const markUnreadResponse = await fetch(`${baseUrl}/api/notifications/51/read`, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer user-7',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ read: false }),
  });
  const markUnreadPayload = await markUnreadResponse.json();

  assert.equal(markUnreadResponse.status, 200);
  assert.equal(markUnreadPayload.notification.read, false);
  assert.equal(pool.notifications.get('51').read, false);
  assert.match(pool.queries[1].sql, /read = \$3/);
  assert.deepEqual(pool.queries[1].params, ['51', 7, false]);
});

test('PATCH notification read state rejects non-boolean values', async (t) => {
  const pool = createTestPool();
  const baseUrl = await withNotificationServer(t, pool);

  for (const value of ['false', null, 1]) {
    const response = await fetch(`${baseUrl}/api/notifications/51/read`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer user-7',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ read: value }),
    });

    assert.equal(response.status, 400);
  }
  assert.equal(pool.queries.length, 0);
});

test('PATCH notification read state requires authentication', async (t) => {
  const pool = createTestPool();
  const baseUrl = await withNotificationServer(t, pool);
  const response = await fetch(`${baseUrl}/api/notifications/51/read`, { method: 'PATCH' });

  assert.equal(response.status, 401);
  assert.equal(pool.queries.length, 0);
});

test('PATCH notification read state cannot update another user notification', async (t) => {
  const pool = createTestPool();
  const baseUrl = await withNotificationServer(t, pool);
  const response = await fetch(`${baseUrl}/api/notifications/51/read`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer user-8' },
  });

  assert.equal(response.status, 404);
  assert.equal(pool.notifications.get('51').read, false);
  assert.match(pool.queries[0].sql, /id = \$1 AND user_id = \$2 AND channel = 'In-app'/);
});