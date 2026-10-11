const express = require('express');

function createNotificationRouter({ pool, authenticateRequest }) {
  const router = express.Router();

  router.get('/', authenticateRequest, async (req, res) => {
    try {
      await pool.query(
        'DELETE FROM notification_jobs ' +
          'WHERE user_id = $1 ' +
          "AND channel = 'In-app' " +
          "AND notification_type <> 'Status Update' " +
          "AND status <> 'cancelled' " +
          'AND (' +
            '(interview_at IS NULL AND scheduled_for < NOW()) ' +
            'OR interview_at <= NOW()' +
          ')',
        [req.user.id]
      );

      const result = await pool.query(
        'SELECT ' +
          'notification.id, ' +
          'notification.notification_type, ' +
          'notification.company, ' +
          'notification.position, ' +
          'notification.interview_date::text AS interview_date, ' +
          'notification.interview_time, ' +
          'notification.interview_at, ' +
          'notification.application_id, ' +
          'notification.application_link, ' +
          'notification.scheduled_for, ' +
          'notification.read, ' +
          'notification.status, ' +
          'notification.previous_status, ' +
          'notification.new_status, ' +
          'notification.created_at ' +
        'FROM notification_jobs AS notification ' +
        'WHERE notification.user_id = $1 ' +
          "AND notification.channel = 'In-app' " +
          "AND notification.status <> 'cancelled' " +
          'AND EXISTS (' +
            'SELECT 1 FROM applications AS application ' +
            'WHERE application.id::text = notification.application_id ' +
              'AND application.user_id = notification.user_id' +
          ') ' +
          'AND (' +
            "notification.notification_type = 'Status Update' " +
            'OR notification.scheduled_for >= NOW() ' +
            'OR (' +
              'notification.interview_at > NOW() ' +
              'AND notification.status IN (\'pending\', \'processing\', \'sent\')' +
            ')' +
          ') ' +
        'ORDER BY notification.scheduled_for ASC, notification.created_at DESC',
        [req.user.id]
      );

      const notifications = result.rows.map((notification) => {
        const isStatusUpdate = notification.notification_type === 'Status Update';
        const title = isStatusUpdate
          ? 'Application Status Changed'
          : 'Interview coming up at ' + notification.company;
        const message = isStatusUpdate
          ? `${notification.company} — ${notification.position}\nYour application status changed from ${notification.previous_status || 'Unknown'} to ${notification.new_status || 'Unknown'}.`
          : notification.position +
            ' is scheduled for ' +
            notification.interview_date +
            ' at ' +
            String(notification.interview_time).slice(0, 5) +
            '.';

        return {
          id: String(notification.id),
          title,
          type: notification.notification_type,
          message,
          date: notification.interview_date || notification.created_at,
          interviewTime: notification.interview_time
            ? String(notification.interview_time).slice(0, 5)
            : undefined,
          interviewAt: notification.interview_at,
          scheduledFor: notification.scheduled_for,
          read: notification.read,
          applicationId: notification.application_id,
          applicationLink: notification.application_link,
          status: notification.status,
        };
      });

      return res.status(200).json({ notifications });
    } catch (error) {
      console.error('Loading in-app notifications failed:', error.message);
      return res.status(500).json({ message: 'Unable to load notifications.' });
    }
  });

  router.patch('/:notificationId/read', authenticateRequest, async (req, res) => {
    const requestedRead = req.body?.read;
    if (requestedRead !== undefined && typeof requestedRead !== 'boolean') {
      return res.status(400).json({ message: 'The read value must be a boolean.' });
    }

    const read = requestedRead ?? true;

    try {
      const result = await pool.query(
        'UPDATE notification_jobs ' +
          'SET read = $3, updated_at = NOW() ' +
          'WHERE id = $1 AND user_id = $2 AND channel = \'In-app\' ' +
          'AND EXISTS (' +
            'SELECT 1 FROM applications AS application ' +
            'WHERE application.id::text = notification_jobs.application_id ' +
              'AND application.user_id = notification_jobs.user_id' +
          ') ' +
          'RETURNING id, read',
        [req.params.notificationId, req.user.id, read]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Notification was not found.' });
      }

      return res.status(200).json({
        message: result.rows[0].read
          ? 'Notification marked as read.'
          : 'Notification marked as unread.',
        notification: {
          id: String(result.rows[0].id),
          read: result.rows[0].read,
        },
      });
    } catch (error) {
      console.error('Updating notification read state failed:', error.message);
      return res.status(500).json({ message: 'Unable to update notification.' });
    }
  });

  return router;
}

module.exports = { createNotificationRouter };