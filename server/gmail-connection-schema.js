async function ensureGmailSyncTimestamps(pool) {
  await pool.query(
    'ALTER TABLE gmail_connections ' +
      'ADD COLUMN IF NOT EXISTS last_sync_attempt_at TIMESTAMPTZ'
  );

  await pool.query(
    'ALTER TABLE gmail_connections ' +
      'ADD COLUMN IF NOT EXISTS last_successful_sync_at TIMESTAMPTZ'
  );
}

module.exports = { ensureGmailSyncTimestamps };
