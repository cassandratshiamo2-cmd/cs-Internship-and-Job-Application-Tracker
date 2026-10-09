const express = require('express');

function createNotificationRouter({ pool, authenticateRequest }) {
  const router = express.Router();

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