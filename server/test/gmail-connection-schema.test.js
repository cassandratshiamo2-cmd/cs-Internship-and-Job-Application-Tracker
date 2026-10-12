const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureGmailSyncTimestamps } = require('../gmail-connection-schema');

test('Gmail sync timestamp migration is additive, idempotent, and preserves legacy sync history', async () => {
  const columns = new Set([
    'id',
    'user_id',
    'history_id',
    'last_sync_at',
    'last_sync_error',
  ]);
  const records = [{
    id: 7,
    user_id: 42,
    history_id: 'history-before-upgrade',
    last_sync_at: new Date('2026-10-10T08:00:00Z'),
    last_sync_error: null,
  }];
  const statements = [];
  const pool = {
    async query(sql) {
      statements.push(sql);
      const match = sql.match(
        /ADD COLUMN IF NOT EXISTS ([a-z_]+) TIMESTAMPTZ$/
      );
      assert.ok(match, `Unexpected schema statement: ${sql}`);
      if (!columns.has(match[1])) {
        columns.add(match[1]);
        for (const record of records) record[match[1]] = null;
      }
      return { rowCount: 0, rows: [] };
    },
  };

  await ensureGmailSyncTimestamps(pool);
  await ensureGmailSyncTimestamps(pool);

  assert.equal(statements.length, 4);
  assert.ok(columns.has('last_sync_attempt_at'));
  assert.ok(columns.has('last_successful_sync_at'));
  assert.equal(records[0].history_id, 'history-before-upgrade');
  assert.equal(records[0].last_sync_at.toISOString(), '2026-10-10T08:00:00.000Z');
  assert.equal(records[0].last_sync_error, null);
  assert.equal(records[0].last_sync_attempt_at, null);
  assert.equal(records[0].last_successful_sync_at, null);
});
