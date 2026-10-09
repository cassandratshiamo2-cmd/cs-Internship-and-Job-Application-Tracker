async function ensureNotificationJobDeliverable(pool, job) {
  const result = await pool.query(
    'SELECT ' +
      'EXISTS (' +
        'SELECT 1 FROM applications AS application ' +
        'WHERE application.id::text = $1 AND application.user_id = $2' +
      ') AS application_exists, ' +
      'EXISTS (' +
        'SELECT 1 FROM notification_jobs ' +
        'WHERE id = $3 AND user_id = $2 AND application_id = $1 ' +
          "AND status = 'processing' AND locked_by = $4" +
      ') AS job_is_claimed',
    [job.application_id, job.user_id, job.id, job.locked_by]
  );
  const row = result.rows[0];
  if (row?.application_exists && row.job_is_claimed) return true;

  await pool.query(
    'UPDATE notification_jobs SET ' +
      "status = 'cancelled', processed_at = NOW(), locked_at = NULL, locked_by = NULL, " +
      "last_error = 'Application no longer exists or notification claim expired.', updated_at = NOW() " +
    'WHERE id = $1 AND user_id = $2 AND application_id = $3 ' +
      "AND status = 'processing' AND locked_by = $4",
    [job.id, job.user_id, job.application_id, job.locked_by]
  );
  return false;
}

module.exports = { ensureNotificationJobDeliverable };
