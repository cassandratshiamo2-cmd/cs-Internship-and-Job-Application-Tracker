const crypto = require('node:crypto');
const { google } = require('googleapis');

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

function createOAuthClient(env = process.env) {
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI
  );
}

function createAuthorizationUrl(oauthClient, state) {
  return oauthClient.generateAuthUrl({
    access_type: 'offline',
    include_granted_scopes: true,
    prompt: 'consent',
    scope: [GMAIL_READONLY_SCOPE],
    state,
  });
}

function hashOAuthState(state) {
  return crypto.createHash('sha256').update(state).digest('hex');
}

function createOAuthState() {
  return crypto.randomBytes(32).toString('base64url');
}

function getEncryptionKey(value = process.env.GMAIL_TOKEN_ENCRYPTION_KEY) {
  if (!value) {
    throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY is required.');
  }

  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) {
    throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }

  return key;
}

function encryptToken(token, value) {
  const key = getEncryptionKey(value);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ]);

  return [iv, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString('base64url'))
    .join('.');
}

function decryptToken(encryptedToken, value) {
  const [encodedIv, encodedTag, encodedCiphertext] = encryptedToken.split('.');
  if (!encodedIv || !encodedTag || !encodedCiphertext) {
    throw new Error('Stored Gmail token is invalid.');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(value),
    Buffer.from(encodedIv, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

module.exports = {
  GMAIL_READONLY_SCOPE,
  createAuthorizationUrl,
  createOAuthClient,
  createOAuthState,
  decryptToken,
  encryptToken,
  hashOAuthState,
};