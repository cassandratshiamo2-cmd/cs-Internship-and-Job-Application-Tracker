import assert from 'node:assert/strict';
import { test } from 'node:test';

const { retryAndRefresh } = await import('./gmail-retry.ts');

test('a successful retry remains successful when refreshing Gmail data fails', async () => {
  const retryResult = { outcomes: ['updated'] };
  const result = await retryAndRefresh(
    async () => retryResult,
    async () => {
      throw new Error('Refresh failed');
    },
  );

  assert.equal(result.result, retryResult);
  assert.equal(result.refreshFailed, true);
  assert.match(String(result.refreshError), /Refresh failed/);
});

test('a failed retry is not converted into a refresh result', async () => {
  let refreshCalled = false;

  await assert.rejects(
    retryAndRefresh(
      async () => {
        throw new Error('Retry failed');
      },
      async () => {
        refreshCalled = true;
      },
    ),
    /Retry failed/,
  );
  assert.equal(refreshCalled, false);
});
