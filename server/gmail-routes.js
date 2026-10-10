const express = require('express');
const { google } = require('googleapis');
const {
  getSafeSyncErrorDetails,
  isRetryableProcessedMessage,
  MAX_REPROCESS_ATTEMPTS,
} = require('./gmail-sync');
const { decideApplicationEmailUpdate } = require('./gmail-matcher');
const { getInterviewDetailsToFill, getInterviewDetailsToUpdate } = require('./gmail-parser');
const { scheduleInterviewReminderIfReady } = require('./gmail-interview');
const { createStatusChangeNotification } = require('./gmail-notifications');
const {
  createAuthorizationUrl,
  createOAuthClient,
  createOAuthState,
  decryptToken,
  encryptToken,
  hashOAuthState,
} = require('./gmail-oauth');

function createGmailRouter({ pool, syncService, authenticateRequest, scheduleInterviewReminder, env = process.env }) {
  const router = express.Router();
  const clientUrl = env.CLIENT_URL || 'http://localhost:3000';

  router.get('/oauth/callback', async (req, res) => {
    const redirectWithResult = (result) => {
      const redirect = new URL('/gmail', clientUrl);
      redirect.searchParams.set('gmail', result);
      return res.redirect(redirect.toString());
    };

    if (req.query.error) return redirectWithResult('denied');
    if (typeof req.query.state !== 'string' || typeof req.query.code !== 'string') {
      return redirectWithResult('invalid');
    }

    try {
      const stateResult = await pool.query(
        'DELETE FROM gmail_oauth_states WHERE state_hash = $1 AND expires_at > NOW() RETURNING user_id',
        [hashOAuthState(req.query.state)]
      );
      if (!stateResult.rowCount) return redirectWithResult('expired');
      const userId = stateResult.rows[0].user_id;
      const oauthClient = createOAuthClient(env);
      const tokenResult = await oauthClient.getToken(req.query.code);
      const tokens = tokenResult.tokens;
      oauthClient.setCredentials(tokens);
      const gmail = google.gmail({ version: 'v1', auth: oauthClient });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      const gmailAddress = String(profile.data.emailAddress || '').trim().toLowerCase();
      if (!gmailAddress) throw new Error('Google did not return the Gmail account address.');

      const existing = await pool.query(
        'SELECT refresh_token_ciphertext FROM gmail_connections WHERE user_id = $1',
        [userId]
      );
      const refreshToken = tokens.refresh_token
        ? encryptToken(tokens.refresh_token, env.GMAIL_TOKEN_ENCRYPTION_KEY)
        : existing.rows[0]?.refresh_token_ciphertext;
      if (!refreshToken) throw new Error('Google did not provide a refresh token. Disconnect and reconnect Gmail.');

      await pool.query(
        'INSERT INTO gmail_connections (' +
          'user_id, gmail_address, refresh_token_ciphertext, access_token_ciphertext, ' +
          'token_expires_at, history_id, is_connected, last_sync_error' +
        ') VALUES ($1, $2, $3, $4, $5, NULL, TRUE, NULL) ' +
        'ON CONFLICT (user_id) DO UPDATE SET ' +
          'gmail_address = EXCLUDED.gmail_address, ' +
          'refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext, ' +
          'access_token_ciphertext = EXCLUDED.access_token_ciphertext, ' +
          'token_expires_at = EXCLUDED.token_expires_at, ' +
          'history_id = NULL, initial_sync_history_id = NULL, initial_sync_page_token = NULL, ' +
          'quota_backoff_until = NULL, quota_failure_count = 0, ' +
          'is_connected = TRUE, last_sync_at = NULL, last_sync_error = NULL, updated_at = NOW()',
        [
          userId,
          gmailAddress,
          refreshToken,
          tokens.access_token ? encryptToken(tokens.access_token, env.GMAIL_TOKEN_ENCRYPTION_KEY) : null,
          tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        ]
      );

      void syncService.syncUser(userId).catch((error) => {
        console.error('Initial Gmail sync failed:', error.message);
      });
      return redirectWithResult('connected');
    } catch (error) {
      console.error('Gmail OAuth callback failed.');
      return redirectWithResult('error');
    }
  });

  router.get('/status', authenticateRequest, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT gmail_address, is_connected, last_sync_at, last_sync_error ' +
          'FROM gmail_connections WHERE user_id = $1',
        [req.user.id]
      );
      const connection = result.rows[0];
      return res.status(200).json({
        connected: Boolean(connection?.is_connected),
        email: connection?.is_connected ? connection.gmail_address : null,
        lastSyncAt: connection?.last_sync_at || null,
        lastSyncError: connection?.last_sync_error || null,
      });
    } catch (error) {
      console.error('Loading Gmail connection status failed:', error.message);
      return res.status(500).json({ message: 'Unable to load Gmail connection status.' });
    }
  });

  router.post('/connect', authenticateRequest, async (req, res) => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI || !env.GMAIL_TOKEN_ENCRYPTION_KEY) {
      return res.status(503).json({ message: 'Gmail OAuth is not configured on the server.' });
    }
    try {
      const state = createOAuthState();
      await pool.query(
        'INSERT INTO gmail_oauth_states (user_id, state_hash, expires_at) ' +
          "VALUES ($1, $2, NOW() + INTERVAL '10 minutes')",
        [req.user.id, hashOAuthState(state)]
      );
      return res.status(200).json({ authorizationUrl: createAuthorizationUrl(createOAuthClient(env), state) });
    } catch (error) {
      console.error('Starting Gmail OAuth failed.');
      return res.status(500).json({ message: 'Unable to start Gmail connection.' });
    }
  });

  router.post('/sync', authenticateRequest, async (req, res) => {
    try {
      const result = await syncService.syncUser(req.user.id, {
        reprocessIgnored: true,
        waitForActiveMs: 15000,
      });
      if (result.quotaLimited) {
        const retryAfterSeconds = Math.max(1, Number(result.retryAfterSeconds || 60));
        res.set('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({
          message: `Gmail is temporarily rate-limited. Try again in ${retryAfterSeconds} seconds.`,
          retryAfterSeconds,
        });
      }
      if (result.inProgress) {
        return res.status(200).json({
          message: 'A Gmail sync is already running. Try again shortly.',
          processed: 0,
          inProgress: true,
        });
      }
      return res.status(200).json({
        message: result.initialSyncComplete === false
          ? 'This initial sync page finished; remaining pages will be picked up by automatic sync.'
          : 'Gmail sync completed.',
        processed: result.processed,
        outcomes: result.outcomes,
        initialSyncComplete: result.initialSyncComplete !== false,
      });
    } catch (error) {
      console.error('Manual Gmail sync failed:', getSafeSyncErrorDetails(error));
      return res.status(502).json({
        message: error.code === 'GMAIL_NOT_CONNECTED' || error.code === 'GMAIL_AUTH_EXPIRED'
          ? error.message
          : 'Unable to sync Gmail. Please try again later.',
      });
    }
  });

  router.delete('/connection', authenticateRequest, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, refresh_token_ciphertext FROM gmail_connections WHERE user_id = $1 AND is_connected = TRUE',
        [req.user.id]
      );
      const connection = result.rows[0];
      if (!connection) return res.status(200).json({ disconnected: true });

      if (connection.refresh_token_ciphertext && env.GMAIL_TOKEN_ENCRYPTION_KEY) {
        try {
          const oauthClient = createOAuthClient(env);
          await oauthClient.revokeToken(
            decryptToken(connection.refresh_token_ciphertext, env.GMAIL_TOKEN_ENCRYPTION_KEY)
          );
        } catch (error) {
          console.error('Revoking Gmail access failed.');
        }
      }

      await pool.query(
        'UPDATE gmail_connections SET is_connected = FALSE, gmail_address = NULL, ' +
          'refresh_token_ciphertext = NULL, access_token_ciphertext = NULL, token_expires_at = NULL, ' +
          'quota_backoff_until = NULL, quota_failure_count = 0, ' +
          'last_sync_error = NULL, updated_at = NOW() WHERE id = $1',
        [connection.id]
      );
      return res.status(200).json({ disconnected: true });
    } catch (error) {
      console.error('Disconnecting Gmail failed.');
      return res.status(500).json({ message: 'Unable to disconnect Gmail.' });
    }
  });

  router.get('/review', authenticateRequest, async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT id, gmail_message_id, sender, subject, received_at, detected_status, confidence, " +
          'reprocess_version, ' +
          "candidate_application_ids, review_reason FROM gmail_processed_messages " +
          "WHERE user_id = $1 AND outcome = 'review' " +
          'AND EXISTS (' +
            'SELECT 1 FROM gmail_connections AS connection ' +
            'WHERE connection.id = gmail_processed_messages.connection_id ' +
              'AND connection.user_id = gmail_processed_messages.user_id' +
          ') ORDER BY received_at DESC LIMIT 100',
        [req.user.id]
      );
      return res.status(200).json({
        messages: result.rows.map((message) => ({
          ...message,
          retryable: Number(message.reprocess_version || 0) < MAX_REPROCESS_ATTEMPTS,
        })),
      });
    } catch (error) {
      console.error('Loading Gmail review queue failed:', error.message);
      return res.status(500).json({ message: 'Unable to load Gmail review items.' });
    }
  });

  router.get('/history', authenticateRequest, async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT message.id, message.gmail_message_id, message.sender, message.subject, " +
          'message.received_at, message.processed_at, message.detected_status, ' +
          'message.reprocess_version, message.review_reason, ' +
          'message.detected_interview_date::text AS detected_interview_date, ' +
          'message.detected_interview_time::text AS detected_interview_time, ' +
          'message.detected_interview_type, message.outcome, ' +
          'application.company AS application_company, application.position AS application_position, ' +
          'application.status AS application_status, ' +
          'application.interview_date::text AS application_interview_date, ' +
          'application.interview_time::text AS application_interview_time, ' +
          'application.interview_type AS application_interview_type ' +
        'FROM gmail_processed_messages AS message ' +
        'JOIN gmail_connections AS connection ON connection.id = message.connection_id ' +
          'AND connection.user_id = message.user_id ' +
        'LEFT JOIN applications AS application ON application.id = message.application_id ' +
          'AND application.user_id = message.user_id ' +
        "WHERE message.user_id = $1 AND message.outcome IN ('updated', 'reviewed', 'dismissed', 'ignored') " +
        'ORDER BY message.processed_at DESC, message.received_at DESC LIMIT 100',
        [req.user.id]
      );
      return res.status(200).json({
        messages: result.rows.map((message) => ({
          ...message,
          retryable: isRetryableProcessedMessage(message),
        })),
      });
    } catch (error) {
      console.error('Loading Gmail processing history failed:', error.message);
      return res.status(500).json({ message: 'Unable to load Gmail processing history.' });
    }
  });

  router.post('/messages/:messageId/retry', authenticateRequest, async (req, res) => {
    const processedMessageId = Number(req.params.messageId);
    if (!Number.isSafeInteger(processedMessageId) || processedMessageId <= 0) {
      return res.status(400).json({ message: 'A valid processed message ID is required.' });
    }

    try {
      const result = await syncService.retryProcessedMessage(req.user.id, processedMessageId);
      if (result.inProgress) {
        return res.status(409).json({
          message: 'Another Gmail sync is still running. Retry this email shortly.',
          inProgress: true,
        });
      }
      if (result.quotaLimited) {
        const retryAfterSeconds = Math.max(1, Number(result.retryAfterSeconds || 60));
        res.set('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({
          message: `Gmail is temporarily rate-limited. Try again in ${retryAfterSeconds} seconds.`,
          retryAfterSeconds,
        });
      }
      return res.status(200).json({
        message: 'Email retry completed.',
        processed: result.processed,
        outcomes: result.outcomes,
      });
    } catch (error) {
      if (error.code === 'GMAIL_MESSAGE_NOT_RETRYABLE') {
        return res.status(409).json({ message: error.message });
      }
      console.error('Retrying Gmail message failed:', getSafeSyncErrorDetails(error));
      return res.status(error.code === 'GMAIL_AUTH_EXPIRED' ? 502 : 500).json({
        message: error.code === 'GMAIL_AUTH_EXPIRED' || error.code === 'GMAIL_NOT_CONNECTED'
          ? error.message
          : 'Unable to retry this email. Please try again later.',
      });
    }
  });

  router.post('/review/:messageId', authenticateRequest, async (req, res) => {
    const action = String(req.body?.action || '');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const messageResult = await client.query(
        "SELECT id, detected_status, detected_interview_date::text AS detected_interview_date, " +
          "detected_interview_time::text AS detected_interview_time, detected_interview_type " +
        'FROM gmail_processed_messages AS message ' +
        'JOIN gmail_connections AS connection ON connection.id = message.connection_id ' +
          'AND connection.user_id = message.user_id ' +
        "WHERE message.id = $1 AND message.user_id = $2 AND message.outcome = 'review' FOR UPDATE OF message",
        [req.params.messageId, req.user.id]
      );
      const message = messageResult.rows[0];
      if (!message) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Review item was not found.' });
      }

      if (action === 'dismiss') {
        await client.query(
          "UPDATE gmail_processed_messages SET outcome = 'dismissed', processed_at = NOW() " +
            'WHERE id = $1 AND user_id = $2',
          [message.id, req.user.id]
        );
        await client.query('COMMIT');
        return res.status(200).json({ message: 'Email dismissed.' });
      }

      const applicationId = Number(req.body?.applicationId);
      if (action !== 'apply' || !Number.isInteger(applicationId) || applicationId <= 0 || !message.detected_status) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Choose a valid application and review action.' });
      }

      const applicationResult = await client.query(
        'SELECT id, company, position, status, interview_date::text AS interview_date, ' +
          'interview_time::text AS interview_time, interview_type, interview_location, ' +
          'notification_channels, application_link, interview_email ' +
          'FROM applications WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [applicationId, req.user.id]
      );
      const application = applicationResult.rows[0];
      if (!application) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Application was not found.' });
      }
      const interviewDetails = {
        interviewDate: message.detected_interview_date,
        interviewTime: message.detected_interview_time,
        interviewType: message.detected_interview_type,
      };
      const isExistingInterview =
        message.detected_status === 'Interview' && application.status === 'Interview';
      const detailsToFill = isExistingInterview
        ? getInterviewDetailsToUpdate(application, interviewDetails)
        : getInterviewDetailsToFill(application, interviewDetails);
      const updateDecision = decideApplicationEmailUpdate({
        currentStatus: application.status,
        detectedStatus: message.detected_status,
        interviewDetailsDetected: Boolean(
          interviewDetails.interviewDate || interviewDetails.interviewTime || interviewDetails.interviewType
        ),
        interviewDetailsChanged: Boolean(
          detailsToFill.interviewDate || detailsToFill.interviewTime || detailsToFill.interviewType
        ),
        manual: true,
      });
      if (updateDecision.action === 'manual_review') {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: updateDecision.reason || 'This status would not advance the selected application.' });
      }
      if (updateDecision.action === 'already_up_to_date') {
        await client.query(
          "UPDATE gmail_processed_messages SET outcome = 'reviewed', application_id = $2, previous_status = $3, new_status = $3, processed_at = NOW() WHERE id = $1",
          [message.id, applicationId, application.status]
        );
        await client.query('COMMIT');
        return res.status(200).json({ message: 'Application is already up to date.' });
      }

      const updatedResult = await client.query(
        'UPDATE applications SET ' +
          'status = CASE WHEN $5::boolean THEN $3 ELSE status END, ' +
          'interview_date = CASE WHEN $8::boolean THEN COALESCE($4::date, interview_date) ELSE COALESCE(interview_date, $4::date) END, ' +
          'interview_time = CASE WHEN $8::boolean THEN COALESCE($6::time, interview_time) ELSE COALESCE(interview_time, $6::time) END, ' +
          'interview_type = CASE WHEN $8::boolean THEN COALESCE($7, interview_type) ELSE COALESCE(interview_type, $7) END, ' +
          'updated_at = NOW() ' +
          'WHERE id = $1 AND user_id = $2 ' +
          'RETURNING id, company, position, status, interview_date::text AS interview_date, ' +
          'interview_time::text AS interview_time, notification_channels, application_link, interview_email',
        [
          applicationId,
          req.user.id,
          message.detected_status,
          detailsToFill.interviewDate,
          updateDecision.applyStatus,
          detailsToFill.interviewTime,
          detailsToFill.interviewType,
          Boolean(updateDecision.applyInterviewDetails && isExistingInterview),
        ]
      );
      await scheduleInterviewReminderIfReady({
        scheduleInterviewReminder,
        userId: req.user.id,
        applicationId,
        application: updatedResult.rows[0],
        client,
      });
      if (application.status !== updatedResult.rows[0].status) {
        await createStatusChangeNotification({
          client,
          userId: req.user.id,
          applicationId,
          company: updatedResult.rows[0].company,
          position: updatedResult.rows[0].position,
          previousStatus: application.status,
          newStatus: updatedResult.rows[0].status,
          gmailMessageId: 'review:' + message.id,
        });
      }
      await client.query(
        "UPDATE gmail_processed_messages SET outcome = 'reviewed', application_id = $2, " +
          'previous_status = $3, new_status = detected_status, processed_at = NOW() WHERE id = $1',
        [message.id, applicationId, application.status]
      );
      await client.query('COMMIT');
      return res.status(200).json({ message: 'Application status updated.' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Applying Gmail review failed:', error.message);
      return res.status(500).json({ message: 'Unable to apply this email update.' });
    } finally {
      client.release();
    }
  });

  return router;
}

module.exports = { createGmailRouter };