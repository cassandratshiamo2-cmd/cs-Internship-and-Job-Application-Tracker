const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureNotificationJobDeliverable } = require('../notification-job-guard');

const job = {
  id: '41',
  user_id: 7,
  application_id: '17',
  locked_by: 'worker-a',
};

test('notification delivery is allowed only for an existing application and current worker claim', async () => {
  const pool = {
    async query(sql, params) {
      assert.match(sql, /application\.id::text = \$1/);
      assert.match(sql, /status = 'processing' AND locked_by = \$4/);
      assert.deepEqual(params, ['17', 7, '41', 'worker-a']);
      return { rows: [{ application_exists: true, job_is_claimed: true }] };
    },
  };

  assert.equal(await ensureNotificationJobDeliverable(pool, job), true);
});

test('a claimed job whose application was deleted is cancelled instead of delivered', async () => {
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.startsWith('SELECT')) {
        return { rows: [{ application_exists: false, job_is_claimed: true }] };
      }
      return { rowCount: 1, rows: [] };
    },
  };

  assert.equal(await ensureNotificationJobDeliverable(pool, job), false);
  assert.equal(queries.length, 2);
  assert.match(queries[1].sql, /status = 'cancelled'/);
  assert.match(queries[1].sql, /locked_by = \$4/);
  assert.deepEqual(queries[1].params, ['41', 7, '17', 'worker-a']);
});

test('a job no longer owned by this worker cannot be delivered or cancelled by the stale owner', async () => {
  let cancellationParams;
  const pool = {
    async query(sql, params) {
      if (sql.startsWith('UPDATE')) cancellationParams = params;
      return { rows: [{ application_exists: true, job_is_claimed: false }] };
    },
  };

  assert.equal(await ensureNotificationJobDeliverable(pool, job), false);
  assert.deepEqual(cancellationParams, ['41', 7, '17', 'worker-a']);
});
