const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { createActionCentreRouter } = require('../action-centre-routes');
const { getSnoozeUntil, getApplicationActionCycle } = require('../action-centre-state');

const now = new Date('2026-10-22T10:00:00.000Z');
const application = {
  id: 17,
  user_id: 7,
  status: 'Applied',
  recruitment_activity_at: '2026-10-10T10:00:00.000Z',
  interview_date: null,
  interview_time: null,
};
const followUpId = 'follow-up:17:2026-10-10T10:00:00.000Z';

function createPool() {
  const states = new Map();
  const queries = [];
  return {
    states,
    queries,
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.startsWith('SELECT state.action_id')) {
        return {
          rows: Array.from(states.values()).filter((row) => row.user_id === params[0]),
        };
      }
      if (sql.startsWith('SELECT id, status, recruitment_activity_at')) {
        return Number(params[1]) === application.user_id && String(params[0]) === String(application.id)
          ? { rows: [{ ...application }] }
          : { rows: [] };
      }
      if (sql.startsWith('INSERT INTO dashboard_action_states')) {
        const [userId, applicationId, actionId, kind, state, snoozedUntil] = params;
        const existing = states.get(`${userId}:${actionId}`);
        const nextState = existing?.state === 'completed' ? 'completed' : state;
        const row = {
          user_id: userId,
          application_id: applicationId,
          actionId,
          kind,
          state: nextState,
          snoozedUntil: nextState === 'completed' ? null : snoozedUntil,
        };
        states.set(`${userId}:${actionId}`, row);
        return {
          rows: [{
            actionId,
            kind,
            state: row.state,
            snoozedUntil: row.snoozedUntil,
          }],
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

async function withServer(t, pool, userId = 7) {
  const app = express();
  app.use(express.json());
  app.use('/api/action-centre', createActionCentreRouter({
    pool,
    now: () => new Date(now),
    authenticateRequest(req, res, next) {
      const header = req.get('authorization');
      if (!header) return res.status(401).json({ message: 'Authentication required.' });
      req.user = { id: Number(header.slice('Bearer '.length)) || userId };
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

test('Tomorrow and In one week snooze deadlines preserve Johannesburg wall-clock time', () => {
  assert.equal(getSnoozeUntil('tomorrow', now).toISOString(), '2026-10-23T10:00:00.000Z');
  assert.equal(getSnoozeUntil('one-week', now).toISOString(), '2026-10-29T10:00:00.000Z');
  assert.equal(getSnoozeUntil('next-month', now), null);
});

test('action cycle validation uses current activity and status', () => {
  assert.equal(getApplicationActionCycle('follow-up', application, now), followUpId);
  assert.equal(getApplicationActionCycle('urgent-follow-up', application, now), null);
  assert.notEqual(getApplicationActionCycle('follow-up', {
    ...application,
    recruitment_activity_at: '2026-10-11T10:00:00.000Z',
  }, now), followUpId);
  assert.equal(getApplicationActionCycle('follow-up', {
    ...application,
    status: 'Offer',
  }, now), null);
});

test('completed action remains completed and action states remain idempotent', async (t) => {
  const pool = createPool();
  const baseUrl = await withServer(t, pool);
  const completedResponse = await fetch(`${baseUrl}/api/action-centre/states`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer 7', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      applicationId: '17',
      actionId: followUpId,
      kind: 'follow-up',
      state: 'completed',
    }),
  });
  const completed = await completedResponse.json();
  assert.equal(completedResponse.status, 200);
  assert.equal(completed.action.state, 'completed');
  assert.equal(pool.queries.at(-1).sql.includes('ON CONFLICT (user_id, action_id)'), true);

  const snoozedResponse = await fetch(`${baseUrl}/api/action-centre/states`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer 7', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      applicationId: '17',
      actionId: followUpId,
      kind: 'follow-up',
      state: 'snoozed',
      snoozePreset: 'tomorrow',
    }),
  });
  const snoozed = await snoozedResponse.json();
  assert.equal(snoozedResponse.status, 200);
  assert.equal(snoozed.action.state, 'completed');
  assert.equal(snoozed.action.snoozedUntil, null);

  const statesResponse = await fetch(`${baseUrl}/api/action-centre/states`, {
    headers: { Authorization: 'Bearer 7' },
  });
  const states = await statesResponse.json();
  assert.equal(statesResponse.status, 200);
  assert.equal(states.states.length, 1);
  assert.equal(states.states[0].state, 'completed');
});

test('action state writes reject unauthenticated, cross-user, stale, and invalid snooze requests', async (t) => {
  const pool = createPool();
  const baseUrl = await withServer(t, pool);
  const unauthenticated = await fetch(`${baseUrl}/api/action-centre/states`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(unauthenticated.status, 401);

  const input = {
    applicationId: '17',
    actionId: followUpId,
    kind: 'follow-up',
    state: 'snoozed',
    snoozePreset: 'next-month',
  };
  const invalidPreset = await fetch(`${baseUrl}/api/action-centre/states`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer 7', 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  assert.equal(invalidPreset.status, 400);

  const foreignApplication = await fetch(`${baseUrl}/api/action-centre/states`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer 8', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, state: 'completed', snoozePreset: undefined }),
  });
  assert.equal(foreignApplication.status, 404);

  const staleAction = await fetch(`${baseUrl}/api/action-centre/states`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer 7', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, actionId: 'follow-up:17:stale', state: 'completed' }),
  });
  assert.equal(staleAction.status, 409);
});
