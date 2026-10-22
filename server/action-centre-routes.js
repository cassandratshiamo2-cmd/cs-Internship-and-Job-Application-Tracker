const express = require('express');
const { getApplicationActionCycle, getSnoozeUntil } = require('./action-centre-state');

const ACTION_KINDS = new Set([
  'follow-up',
  'urgent-follow-up',
  'upcoming-interview',
  'past-interview',
  'interview-details',
  'saved-opportunity',
]);

function createActionCentreRouter({ pool, authenticateRequest, now = () => new Date() }) {
  const router = express.Router();

  router.get('/states', authenticateRequest, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const result = await pool.query(
        'SELECT state.action_id AS "actionId", state.action_kind AS kind, ' +
          'state.state, state.snoozed_until AS "snoozedUntil" ' +
          'FROM dashboard_action_states AS state ' +
          'JOIN applications AS application ON application.id = state.application_id ' +
            'AND application.user_id = state.user_id ' +
          'WHERE state.user_id = $1',
        [req.user.id]
      );
      return res.status(200).json({ states: result.rows });
    } catch (error) {
      console.error('Loading dashboard action states failed:', error.message);
      return res.status(500).json({ message: 'Unable to load dashboard action states.' });
    }
  });

  router.put('/states', authenticateRequest, async (req, res) => {
    const applicationId = Number(req.body?.applicationId);
    const actionId = String(req.body?.actionId || '');
    const kind = String(req.body?.kind || '');
    const state = String(req.body?.state || '');

    if (
      !Number.isSafeInteger(applicationId) ||
      applicationId <= 0 ||
      actionId.length < 1 ||
      actionId.length > 255 ||
      !ACTION_KINDS.has(kind) ||
      !['completed', 'snoozed'].includes(state)
    ) {
      return res.status(400).json({ message: 'A valid dashboard action state is required.' });
    }

    const snoozeUntil = state === 'snoozed'
      ? getSnoozeUntil(req.body?.snoozePreset, now())
      : null;
    if (state === 'snoozed' && !snoozeUntil) {
      return res.status(400).json({ message: 'Choose Tomorrow or In one week to snooze this action.' });
    }

    try {
      const applicationResult = await pool.query(
        'SELECT id, status, recruitment_activity_at, interview_date::text AS interview_date, ' +
          'interview_time::text AS interview_time ' +
          'FROM applications WHERE id = $1 AND user_id = $2',
        [applicationId, req.user.id]
      );
      const application = applicationResult.rows[0];
      if (!application) {
        return res.status(404).json({ message: 'Application not found.' });
      }

      const expectedActionId = getApplicationActionCycle(kind, application, now());
      if (!expectedActionId || actionId !== expectedActionId) {
        return res.status(409).json({ message: 'This dashboard action is no longer current.' });
      }

      const result = await pool.query(
        'INSERT INTO dashboard_action_states ' +
          '(user_id, application_id, action_id, action_kind, state, snoozed_until, completed_at) ' +
          'VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $5::VARCHAR(16) = \'completed\' THEN NOW() ELSE NULL END) ' +
          'ON CONFLICT (user_id, action_id) DO UPDATE SET ' +
          'application_id = EXCLUDED.application_id, action_kind = EXCLUDED.action_kind, ' +
          "state = CASE WHEN dashboard_action_states.state = 'completed' THEN 'completed' ELSE EXCLUDED.state END, " +
          "snoozed_until = CASE WHEN dashboard_action_states.state = 'completed' THEN NULL ELSE EXCLUDED.snoozed_until END, " +
          'completed_at = CASE WHEN dashboard_action_states.state = \'completed\' ' +
            'THEN dashboard_action_states.completed_at ELSE EXCLUDED.completed_at END, updated_at = NOW() ' +
          'RETURNING action_id AS "actionId", action_kind AS kind, state, ' +
          'snoozed_until AS "snoozedUntil"',
        [req.user.id, applicationId, actionId, kind, state, snoozeUntil]
      );
      return res.status(200).json({ action: result.rows[0] });
    } catch (error) {
      console.error('Updating dashboard action state failed:', error.message);
      return res.status(500).json({ message: 'Unable to update dashboard action.' });
    }
  });

  return router;
}

module.exports = { createActionCentreRouter };
