const { google } = require('googleapis');
const { simpleParser } = require('mailparser');
const {
  classifyApplicationEmail,
  extractInterviewDateTime,
  getInterviewDetailsToFill,
} = require('./gmail-parser');
const { getEmailUpdateDecision, matchApplication } = require('./gmail-matcher');
const { createOAuthClient, decryptToken, encryptToken } = require('./gmail-oauth');
const { scheduleInterviewReminderIfReady } = require('./gmail-interview');

const INITIAL_SYNC_DAYS = 30;
const INITIAL_SYNC_PAGE_SIZE = 50;
const HISTORY_PAGE_SIZE = 100;
const MESSAGE_TEXT_LIMIT = 100000;

function asHeaderText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.text || '';
}

function emailAddress(value) {
  const match = String(value || '').match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].toLowerCase() : '';
}

function createGmailSyncService({ pool, scheduleInterviewReminder, env = process.env }) {
  const encryptionKey = env.GMAIL_TOKEN_ENCRYPTION_KEY;

  async function buildGmailClient(connection) {
    const oauthClient = createOAuthClient(env);
    oauthClient.setCredentials({
      access_token: connection.access_token_ciphertext
        ? decryptToken(connection.access_token_ciphertext, encryptionKey)
        : undefined,
      refresh_token: decryptToken(connection.refresh_token_ciphertext, encryptionKey),
      expiry_date: connection.token_expires_at
        ? new Date(connection.token_expires_at).getTime()
        : undefined,
    });

    await oauthClient.getAccessToken();
    const credentials = oauthClient.credentials;
    await pool.query(
      'UPDATE gmail_connections SET ' +
        'access_token_ciphertext = $2, ' +
        'refresh_token_ciphertext = COALESCE($3, refresh_token_ciphertext), ' +
        'token_expires_at = $4, ' +
        'updated_at = NOW() ' +
      'WHERE id = $1',
      [
        connection.id,
        credentials.access_token ? encryptToken(credentials.access_token, encryptionKey) : null,
        credentials.refresh_token ? encryptToken(credentials.refresh_token, encryptionKey) : null,
        credentials.expiry_date ? new Date(credentials.expiry_date) : null,
      ]
    );

    return google.gmail({ version: 'v1', auth: oauthClient });
  }

  async function fetchMessage(gmail, messageId) {
    const result = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'raw',
    });
    if ((result.data.labelIds || []).includes('SENT')) return null;
    const raw = result.data.raw;
    if (!raw) return null;

    const parsed = await simpleParser(Buffer.from(raw, 'base64url'));
    return {
      id: messageId,
      threadId: result.data.threadId || null,
      from: asHeaderText(parsed.from),
      subject: String(parsed.subject || '').slice(0, 998),
      text: String(parsed.text || '').slice(0, MESSAGE_TEXT_LIMIT),
      receivedAt: result.data.internalDate
        ? new Date(Number(result.data.internalDate))
        : parsed.date || new Date(),
    };
  }

  async function recordMessage(connection, email, classification, match, interviewDetails) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        'INSERT INTO gmail_processed_messages (' +
          'connection_id, user_id, gmail_message_id, gmail_thread_id, sender, subject, ' +
          'received_at, detected_status, detected_interview_date, detected_interview_time, ' +
          'confidence, candidate_application_ids, outcome' +
        ') VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::time, $11, $12::jsonb, \'processing\') ' +
        'ON CONFLICT (connection_id, gmail_message_id) DO NOTHING ' +
        'RETURNING id',
        [
          connection.id,
          connection.user_id,
          email.id,
          email.threadId,
          email.from.slice(0, 998),
          email.subject,
          email.receivedAt,
          classification.status,
          interviewDetails?.interviewDate || null,
          interviewDetails?.interviewTime || null,
          classification.confidence,
          JSON.stringify(match.candidateIds || []),
        ]
      );

      let messageRowId;
      if (inserted.rowCount === 0) {
        const existing = await client.query(
          'SELECT id, outcome FROM gmail_processed_messages ' +
            'WHERE connection_id = $1 AND gmail_message_id = $2 FOR UPDATE',
          [connection.id, email.id]
        );
        if (!existing.rows[0] || existing.rows[0].outcome !== 'review') {
          await client.query('ROLLBACK');
          return 'duplicate';
        }

        messageRowId = existing.rows[0].id;
        await client.query(
          'UPDATE gmail_processed_messages SET ' +
            'sender = $2, subject = $3, received_at = $4, detected_status = $5, ' +
            'detected_interview_date = $6::date, detected_interview_time = $7::time, ' +
            'confidence = $8, candidate_application_ids = $9::jsonb, outcome = \'processing\', ' +
            'review_reason = NULL, processed_at = NULL WHERE id = $1',
          [
            messageRowId,
            email.from.slice(0, 998),
            email.subject,
            email.receivedAt,
            classification.status,
            interviewDetails?.interviewDate || null,
            interviewDetails?.interviewTime || null,
            classification.confidence,
            JSON.stringify(match.candidateIds || []),
          ]
        );
      } else {
        messageRowId = inserted.rows[0].id;
      }

      if (!classification.status) {
        await client.query(
          "UPDATE gmail_processed_messages SET outcome = 'ignored', review_reason = 'No supported application status rule matched.', processed_at = NOW() WHERE id = $1",
          [messageRowId]
        );
        await client.query('COMMIT');
        return 'ignored';
      }

      if (match.outcome !== 'matched') {
        await client.query(
          "UPDATE gmail_processed_messages SET outcome = 'review', review_reason = 'Application match was not sufficiently confident and unique.', processed_at = NOW() WHERE id = $1",
          [messageRowId]
        );
        await client.query('COMMIT');
        return 'review';
      }

      const applicationResult = await client.query(
        'SELECT id, company, position, status, updated_at, interview_date, interview_time, ' +
          'notification_channels, application_link, interview_email ' +
          'FROM applications WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [match.application.id, connection.user_id]
      );
      const application = applicationResult.rows[0];
      const detailsToFill = getInterviewDetailsToFill(application, interviewDetails);
      const hasInterviewDetailsToFill = Boolean(
        classification.status === 'Interview' &&
        (detailsToFill.interviewDate || detailsToFill.interviewTime)
      );
      const updateDecision = application
        ? getEmailUpdateDecision({
            currentStatus: application.status,
            nextStatus: classification.status,
            updatedAt: application.updated_at,
            receivedAt: email.receivedAt,
            interviewDetailsToFill: hasInterviewDetailsToFill ? detailsToFill : null,
          })
        : { allowed: false, preserveStatus: false };
      if (
        !application ||
        !updateDecision.allowed
      ) {
        await client.query(
          "UPDATE gmail_processed_messages SET outcome = 'review', application_id = $2, review_reason = 'Application status is newer or does not permit this automatic transition.', processed_at = NOW() WHERE id = $1",
          [messageRowId, application ? application.id : null]
        );
        await client.query('COMMIT');
        return 'review';
      }

      const updated = await client.query(
        'UPDATE applications SET status = CASE WHEN $8::boolean THEN status ELSE $3 END, updated_at = NOW() ' +
          ', interview_date = COALESCE(interview_date, $6::date), ' +
          'interview_time = COALESCE(interview_time, $7::time) ' +
          'WHERE id = $1 AND user_id = $2 AND status = $4 ' +
          'AND (updated_at <= $5 OR $8::boolean) ' +
          'RETURNING id, company, position, status, interview_date::text AS interview_date, ' +
          'interview_time::text AS interview_time, notification_channels, application_link, interview_email',
        [
          application.id,
          connection.user_id,
          classification.status,
          application.status,
          email.receivedAt,
          classification.status === 'Interview' ? detailsToFill.interviewDate : null,
          classification.status === 'Interview' ? detailsToFill.interviewTime : null,
          updateDecision.preserveStatus,
        ]
      );

      if (updated.rowCount !== 1) {
        await client.query(
          "UPDATE gmail_processed_messages SET outcome = 'review', application_id = $2, review_reason = 'Application changed while this email was being processed.', processed_at = NOW() WHERE id = $1",
          [messageRowId, application.id]
        );
        await client.query('COMMIT');
        return 'review';
      }

      const updatedApplication = updated.rows[0];
      await scheduleInterviewReminderIfReady({
        scheduleInterviewReminder,
        userId: connection.user_id,
        applicationId: application.id,
        application: updatedApplication,
        client,
      });

      await client.query(
        "UPDATE gmail_processed_messages SET outcome = 'updated', application_id = $2, previous_status = $3, new_status = $4, processed_at = NOW() WHERE id = $1",
        [messageRowId, application.id, application.status, classification.status]
      );
      await client.query('COMMIT');
      return 'updated';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function processMessage(connection, gmail, messageId) {
    const email = await fetchMessage(gmail, messageId);
    if (!email) return 'ignored';

    if (emailAddress(email.from) === String(connection.gmail_address).toLowerCase()) {
      return 'ignored';
    }

    const classification = classifyApplicationEmail(email);
    const interviewDetails = classification.status === 'Interview'
      ? extractInterviewDateTime(email)
      : null;
    const applications = classification.status
      ? (await pool.query(
          'SELECT id, company, position, status, updated_at FROM applications WHERE user_id = $1',
          [connection.user_id]
        )).rows
      : [];
    const match = classification.status
      ? matchApplication(email, applications)
      : { outcome: 'ignored', candidateIds: [] };

    return recordMessage(connection, email, classification, match, interviewDetails);
  }

  async function reprocessPendingReviews(connection, gmail) {
    const result = await pool.query(
      "SELECT gmail_message_id FROM gmail_processed_messages " +
        "WHERE connection_id = $1 AND outcome = 'review' " +
        'ORDER BY received_at ASC LIMIT 50',
      [connection.id]
    );
    const outcomes = [];
    for (const message of result.rows) {
      outcomes.push(await processMessage(connection, gmail, message.gmail_message_id));
    }
    return { processed: result.rows.length, outcomes };
  }

  async function listInitialPage(gmail, pageToken) {
    return gmail.users.messages.list({
      userId: 'me',
      maxResults: INITIAL_SYNC_PAGE_SIZE,
      pageToken: pageToken || undefined,
      q: `newer_than:${Number(env.GMAIL_INITIAL_SYNC_DAYS || INITIAL_SYNC_DAYS)}d -in:sent`,
    });
  }

  async function syncInitialPage(connection, gmail, profile) {
    const startingHistoryId = connection.initial_sync_history_id || profile.historyId;
    if (!connection.initial_sync_history_id) {
      await pool.query(
        'UPDATE gmail_connections SET initial_sync_history_id = $2, updated_at = NOW() WHERE id = $1',
        [connection.id, startingHistoryId]
      );
    }

    const response = await listInitialPage(gmail, connection.initial_sync_page_token);
    const messages = response.data.messages || [];
    const ids = messages.map((message) => message.id).filter(Boolean);
    const outcomes = [];
    for (const id of ids) {
      outcomes.push(await processMessage(connection, gmail, id));
    }

    const nextPageToken = response.data.nextPageToken || null;
    await pool.query(
      'UPDATE gmail_connections SET ' +
        'initial_sync_page_token = $2, ' +
        'initial_sync_history_id = CASE WHEN $2::text IS NULL THEN NULL ELSE initial_sync_history_id END, ' +
        'history_id = CASE WHEN $2::text IS NULL THEN $3 ELSE history_id END, ' +
        'last_sync_at = NOW(), last_sync_error = NULL, updated_at = NOW() ' +
      'WHERE id = $1',
      [connection.id, nextPageToken, startingHistoryId]
    );

    return { processed: ids.length, outcomes, initialSyncComplete: !nextPageToken };
  }

  async function syncHistory(connection, gmail) {
    let pageToken;
    const ids = new Set();
    let latestHistoryId = connection.history_id;

    do {
      const response = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: connection.history_id,
        historyTypes: ['messageAdded'],
        maxResults: HISTORY_PAGE_SIZE,
        pageToken,
      });
      latestHistoryId = response.data.historyId || latestHistoryId;
      for (const history of response.data.history || []) {
        for (const added of history.messagesAdded || []) {
          if (added.message?.id) ids.add(added.message.id);
        }
      }
      pageToken = response.data.nextPageToken;
    } while (pageToken);

    const orderedIds = Array.from(ids);
    const outcomes = [];
    for (const id of orderedIds) {
      outcomes.push(await processMessage(connection, gmail, id));
    }

    await pool.query(
      'UPDATE gmail_connections SET history_id = $2, last_sync_at = NOW(), ' +
        'last_sync_error = NULL, updated_at = NOW() WHERE id = $1',
      [connection.id, latestHistoryId]
    );
    return { processed: orderedIds.length, outcomes, initialSyncComplete: true };
  }

  async function syncConnection(connectionId) {
    const result = await pool.query(
      'SELECT * FROM gmail_connections WHERE id = $1 AND is_connected = TRUE',
      [connectionId]
    );
    const connection = result.rows[0];
    if (!connection) return { processed: 0, outcomes: [], disconnected: true };

    try {
      const gmail = await buildGmailClient(connection);
      const profileResult = await gmail.users.getProfile({ userId: 'me' });
      const profile = profileResult.data;
      const reviewed = await reprocessPendingReviews(connection, gmail);
      const refreshedConnection = {
        ...connection,
        initial_sync_history_id: connection.initial_sync_history_id,
      };

      let syncResult;
      if (connection.initial_sync_history_id || !connection.history_id) {
        syncResult = await syncInitialPage(refreshedConnection, gmail, profile);
      } else {
        try {
          syncResult = await syncHistory(connection, gmail);
        } catch (error) {
          if (error.code !== 404 && error.response?.status !== 404) throw error;
          await pool.query(
            'UPDATE gmail_connections SET history_id = NULL, initial_sync_history_id = NULL, ' +
              'initial_sync_page_token = NULL WHERE id = $1',
            [connection.id]
          );
          syncResult = await syncInitialPage({
            ...connection,
            history_id: null,
            initial_sync_history_id: null,
            initial_sync_page_token: null,
          }, gmail, profile);
        }
      }

      return {
        ...syncResult,
        processed: reviewed.processed + syncResult.processed,
        outcomes: [...reviewed.outcomes, ...syncResult.outcomes],
      };
    } catch (error) {
      await pool.query(
        'UPDATE gmail_connections SET last_sync_error = $2, updated_at = NOW() WHERE id = $1',
        [connection.id, String(error.message || 'Gmail sync failed').slice(0, 1000)]
      );
      throw error;
    }
  }

  async function syncUser(userId) {
    const result = await pool.query(
      'SELECT id FROM gmail_connections WHERE user_id = $1 AND is_connected = TRUE',
      [userId]
    );
    if (!result.rows.length) {
      throw new Error('No Gmail account is connected.');
    }
    return syncConnection(result.rows[0].id);
  }

  async function syncAllConnected() {
    const result = await pool.query(
      'SELECT id FROM gmail_connections WHERE is_connected = TRUE ORDER BY id'
    );
    const outcomes = [];
    for (const connection of result.rows) {
      try {
        outcomes.push(await syncConnection(connection.id));
      } catch (error) {
        console.error('Gmail sync failed for connection ' + connection.id + ': ' + error.message);
      }
    }
    return outcomes;
  }

  return { syncAllConnected, syncConnection, syncUser };
}

function startGmailSyncWorker(syncService, env = process.env) {
  const intervalMs = Math.max(30000, Number(env.GMAIL_SYNC_INTERVAL_MS || 120000));
  let isRunning = false;

  const run = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await syncService.syncAllConnected();
    } catch (error) {
      console.error('Gmail sync worker error:', error.message);
    } finally {
      isRunning = false;
    }
  };

  void run();
  return setInterval(run, intervalMs);
}

module.exports = { createGmailSyncService, startGmailSyncWorker };