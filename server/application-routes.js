const express = require('express');

function createApplicationRouter({ pool, authenticateRequest }) {
  const router = express.Router();

  router.delete('/:id', authenticateRequest, async (req, res) => {
    const applicationId = Number(req.params.id);
    if (!Number.isInteger(applicationId) || applicationId <= 0) {
      return res.status(400).json({ message: 'A valid application ID is required.' });
    }

    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const deletedApplication = await client.query(
        'DELETE FROM applications WHERE id = $1 AND user_id = $2 RETURNING id',
        [applicationId, req.user.id]
      );
      if (deletedApplication.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Application not found.' });
      }

      await client.query(
        'DELETE FROM notification_jobs WHERE user_id = $1 AND application_id = $2',
        [req.user.id, String(applicationId)]
      );
      await client.query('COMMIT');

      return res.status(200).json({
        message: 'Application deleted successfully.',
        deleted: true,
      });
    } catch (error) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('Rolling back application deletion failed:', rollbackError.message);
        }
      }
      console.error('Deleting application failed:', error.message);
      return res.status(500).json({ message: 'Unable to delete application.' });
    } finally {
      client?.release();
    }
  });

  return router;
}

module.exports = { createApplicationRouter };
