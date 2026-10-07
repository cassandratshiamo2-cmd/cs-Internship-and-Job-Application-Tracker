const test = require('node:test');
const assert = require('node:assert/strict');
const {
  GMAIL_READONLY_SCOPE,
  createAuthorizationUrl,
  createOAuthState,
  decryptToken,
  encryptToken,
  hashOAuthState,
} = require('../gmail-oauth');

test('encrypts Gmail tokens so stored values are not plaintext', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const encrypted = encryptToken('refresh-secret-value', key);

  assert.notEqual(encrypted, 'refresh-secret-value');
  assert.equal(decryptToken(encrypted, key), 'refresh-secret-value');
  assert.throws(() => decryptToken(encrypted, Buffer.alloc(32, 8).toString('base64')));
});

test('creates unique state and only requests Gmail read access', () => {
  const firstState = createOAuthState();
  const secondState = createOAuthState();
  const authUrl = new URL(createAuthorizationUrl({
    generateAuthUrl: (options) => `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      scope: options.scope.join(' '),
      state: options.state,
      access_type: options.access_type,
      prompt: options.prompt,
    })}`,
  }, firstState));

  assert.notEqual(hashOAuthState(firstState), hashOAuthState(secondState));
  assert.equal(authUrl.searchParams.get('scope'), GMAIL_READONLY_SCOPE);
  assert.equal(authUrl.searchParams.get('access_type'), 'offline');
});