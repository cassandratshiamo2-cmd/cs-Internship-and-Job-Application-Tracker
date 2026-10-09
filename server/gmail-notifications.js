async function createStatusChangeNotification({
  client,
  userId,
  applicationId,
  company,
  position,
  previousStatus,
  newStatus,
  gmailMessageId,
}) {
  const eventKey = `status-change:${applicationId}:${gmailMessageId || Date.now()}`;
  const result = await client.query(
    'INSERT INTO notification_jobs (' +
      'user_id, application_id, notification_type, channel, company, position, ' +
      'interview_date, interview_time, interview_at, application_link, scheduled_for, ' +
      'status, read, previous_status, new_status, event_key' +
    ') VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, NULL, NULL, NOW(), $7, FALSE, $8, $9, $10) ' +
    'ON CONFLICT (user_id, application_id, notification_type, channel, event_key) DO NOTHING RETURNING id',
    [
      userId,
      String(applicationId),
      'Status Update',
      'In-app',
      company,
      position,
      'sent',
      previousStatus || null,
      newStatus || null,
      eventKey,
    ]
  );
  return result.rowCount > 0;
}

module.exports = { createStatusChangeNotification };
