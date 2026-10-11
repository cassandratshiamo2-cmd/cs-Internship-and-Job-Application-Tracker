async function checkDatabaseHealth(pool, databaseConfigured) {
  if (!databaseConfigured) {
    return {
      httpStatus: 503,
      body: { status: 'DOWN', database: 'not_configured' },
    };
  }

  try {
    await pool.query('SELECT 1');
    return {
      httpStatus: 200,
      body: { status: 'UP', database: 'connected' },
    };
  } catch {
    return {
      httpStatus: 503,
      body: { status: 'DOWN', database: 'disconnected' },
    };
  }
}

async function checkGmailSyncHealth(pool, { intervalMs = 120000, now = Date.now() } = {}) {
  try {
    const result = await pool.query(
      'SELECT worker.last_completed_at, worker.consecutive_failed_runs, ' +
        'worker.last_error_category, counts.connected_accounts, counts.failing_accounts, ' +
        'counts.oldest_success_at ' +
      'FROM (SELECT COUNT(*) FILTER (WHERE is_connected AND NOT sync_paused)::int AS connected_accounts, ' +
        'COUNT(*) FILTER (WHERE is_connected AND NOT sync_paused AND consecutive_sync_failures >= 5)::int AS failing_accounts, ' +
        'MIN(last_sync_success_at) FILTER (WHERE is_connected AND NOT sync_paused) AS oldest_success_at ' +
        'FROM gmail_connections) AS counts ' +
      "LEFT JOIN gmail_sync_worker_state AS worker ON worker.worker_name = 'gmail'"
    );
    const row = result.rows[0];
    const lastCompletedAt = row?.last_completed_at
      ? new Date(row.last_completed_at).toISOString()
      : null;
    const staleAfterMs = Math.max(intervalMs * 3, 300000);
    const lastCompletedAgeMs = lastCompletedAt
      ? now - new Date(lastCompletedAt).getTime()
      : null;
    const connectedAccounts = Number(row?.connected_accounts || 0);
    const repeatedFailures = Number(row?.failing_accounts || 0);
    const isStale = connectedAccounts > 0 &&
      (lastCompletedAgeMs === null || lastCompletedAgeMs > staleAfterMs);
    const degraded = isStale || repeatedFailures > 0 ||
      Number(row?.consecutive_failed_runs || 0) >= 3;

    return {
      status: degraded ? 'DEGRADED' : 'UP',
      lastCompletedAt,
      connectedAccounts,
      accountsWithRepeatedFailures: repeatedFailures,
      consecutiveFailedSweeps: Number(row?.consecutive_failed_runs || 0),
      lastErrorCategory: row?.last_error_category || null,
      oldestSuccessfulAccountSyncAt: row?.oldest_success_at
        ? new Date(row.oldest_success_at).toISOString()
        : null,
      stale: isStale,
    };
  } catch {
    return {
      status: 'UNKNOWN',
      lastCompletedAt: null,
      connectedAccounts: null,
      accountsWithRepeatedFailures: null,
      consecutiveFailedSweeps: null,
      lastErrorCategory: 'HEALTH_QUERY_FAILED',
      oldestSuccessfulAccountSyncAt: null,
      stale: null,
    };
  }
}

module.exports = { checkDatabaseHealth, checkGmailSyncHealth };
