const test = require('node:test');
const assert = require('node:assert/strict');
const { createStatusChangeNotification } = require('../gmail-notifications');

function createClient(applicationOwnerId) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      assert.match(sql, /application\.id::text = \$2 AND application\.user_id = \$1/);
      return applicationOwnerId === params[0] && String(params[1]) === '29'
        ? { rowCount: 1, rows: [{ id: 1 }] }
        : { rowCount: 0, rows: [] };
    },
  };
}

test('status notification creation is gated by application ownership', async () => {
  const client = createClient(7);
  const created = await createStatusChangeNotification({
    client,
    userId: 7,
    applicationId: 29,
    company: 'Example',
    position: 'Developer',
    previousStatus: 'Applied',
    newStatus: 'Assessment',
    gmailMessageId: 'message-reference',
  });

  assert.equal(created, true);
  assert.match(client.calls[0].sql, /FROM applications AS application/);
  assert.match(client.calls[0].sql, /application\.user_id = \$1/);
  assert.deepEqual(client.calls[0].params.slice(0, 2), [7, '29']);
});

test('status notification is not created for an application owned by another user', async () => {
  const client = createClient(8);
  const created = await createStatusChangeNotification({
    client,
    userId: 7,
    applicationId: 29,
    company: 'Example',
    position: 'Developer',
    previousStatus: 'Applied',
    newStatus: 'Assessment',
    gmailMessageId: 'message-reference',
  });

  assert.equal(created, false);
  assert.equal(client.calls.length, 1);
});
