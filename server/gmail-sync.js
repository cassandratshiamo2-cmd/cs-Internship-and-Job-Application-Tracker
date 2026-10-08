const { google } = require('googleapis');
const { simpleParser } = require('mailparser');
const {
  classifyApplicationEmail,
  extractInterviewDateTime,
  extractInterviewType,
  getInterviewDetailsToFill,
  getInterviewDetailsToUpdate,
} = require('./gmail-parser');
const { decideApplicationEmailUpdate, matchApplication } = require('./gmail-matcher');
const { createOAuthClient, decryptToken, encryptToken } = require('./gmail-oauth');
const { scheduleInterviewReminderIfReady } = require('./gmail-interview');

const INITIAL_SYNC_DAYS = 30;
const INITIAL_SYNC_PAGE_SIZE = 50;
const HISTORY_PAGE_SIZE = 100;
const MESSAGE_TEXT_LIMIT = 100000;
const GMAIL_SYNC_LOCK_NAMESPACE = 0x474d4149;
const MAX_QUOTA_RETRIES = 3;
const DEFAULT_QUOTA_RETRY_BASE_MS = 1000;
const MAX_QUOTA_RETRY_DELAY_MS = 30000;
const QUOTA_COOLDOWN_BASE_SECONDS = 60;
const QUOTA_COOLDOWN_MAX_SECONDS = 3600;

function asHeaderText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.text || '';
}

function emailAddress(value) {
  const match = String(value || '').match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].toLowerCase() : '';
}

function getGmailErrorStatus(error) {
  return Number(
    error?.response?.status ||
    error?.status ||
    error?.statusCode ||
    error?.cause?.response?.status ||
    error?.cause?.status ||
    error?.cause?.statusCode ||
    0
  );
}

function getSafeSyncErrorDetails(error) {
  const source = error?.cause || error;
  const message = String(source?.message || 'Unknown sync error')
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[redacted email]')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:ya29|1\/\/0)\.[a-z0-9._~+/-]+/gi, '[redacted token]')
    .slice(0, 500);
  const status = getGmailErrorStatus(source);
  const code = String(source?.code || '').slice(0, 80);
  const reasons = getGmailErrorReasons(source).slice(0, 5);

  return {
    name: String(source?.name || 'Error').slice(0, 80),
    ...(code ? { code } : {}),
    ...(status ? { status } : {}),
    ...(reasons.length ? { reasons } : {}),
    message,
  };
}

function getGmailErrorReasons(error) {
  const responseError = error?.response?.data?.error || error?.cause?.response?.data?.error;
  const errors = [
    ...(Array.isArray(error?.errors) ? error.errors : []),
    ...(Array.isArray(responseError?.errors) ? responseError.errors : []),
    ...(Array.isArray(error?.cause?.errors) ? error.cause.errors : []),
  ];
  return errors.map((item) => String(item?.reason || '').toLowerCase());
}

function isGmailQuotaError(error) {
  const status = getGmailErrorStatus(error);
  if (status === 429) return true;
  if (status !== 403) return false;

  const quotaReasons = new Set([
    'dailylimitexceeded',
    'quotaexceeded',
    'ratelimitexceeded',
    'userratelimitexceeded',
  ]);
  if (getGmailErrorReasons(error).some((reason) => quotaReasons.has(reason))) return true;

  return /quota exceeded|rate limit|units per minute/i.test(String(error?.message || ''));
}

function getRetryAfterMs(error, now = Date.now()) {
  const headers = error?.response?.headers;
  const value = typeof headers?.get === 'function'
    ? headers.get('retry-after')
    : headers?.['retry-after'] || headers?.['Retry-After'];
  if (value == null) return 0;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds * 1000);

  const retryAt = Date.parse(String(value));
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - now) : 0;
}

function createGmailSyncService({
  pool,
  scheduleInterviewReminder,
  env = process.env,
  parseMessage = simpleParser,
  oauthClientFactory = createOAuthClient,
  gmailClientFactory = (auth) => google.gmail({ version: 'v1', auth }),
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  random = Math.random,
  retryBaseMs = DEFAULT_QUOTA_RETRY_BASE_MS,
}) {
  const encryptionKey = env.GMAIL_TOKEN_ENCRYPTION_KEY;
  const baseDelayMs = Number.isFinite(retryBaseMs)
    ? Math.max(1, retryBaseMs)
    : DEFAULT_QUOTA_RETRY_BASE_MS;

  async function withQuotaRetry(operation) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!isGmailQuotaError(error) || attempt >= MAX_QUOTA_RETRIES) throw error;

        const exponentialDelay = Math.min(
          MAX_QUOTA_RETRY_DELAY_MS,
          baseDelayMs * (2 ** attempt)
        );
        const jitteredDelay = Math.round(exponentialDelay * (0.5 + random()));
        await wait(Math.max(jitteredDelay, getRetryAfterMs(error)));
      }
    }
  }

  async function buildGmailClient(connection) {
    const oauthClient = oauthClientFactory(env);
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

    return gmailClientFactory(oauthClient);
  }

  async function fetchMessage(gmail, messageId) {
    let result;
    try {
      result = await withQuotaRetry(() => gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'raw',
      }));
    } catch (error) {
      if (getGmailErrorStatus(error) === 404) {
        const missingMessageError = new Error('Gmail message no longer exists.');
        missingMessageError.code = 'GMAIL_MESSAGE_NOT_FOUND';
        missingMessageError.cause = error;
        throw missingMessageError;
      }
      error.gmailApiFailure = true;
      throw error;
    }
    if ((result.data.labelIds || []).includes('SENT')) return null;
    const raw = result.data.raw;
    if (!raw) return null;

    let parsed;
    try {
      parsed = await parseMessage(Buffer.from(raw, 'base64url'));
    } catch (error) {
      const parseError = new Error('Gmail message MIME could not be parsed.');
      parseError.code = 'GMAIL_MESSAGE_PARSE';
      parseError.cause = error;
      throw parseError;
    }
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
            'received_at, detected_status, detected_interview_date, detected_interview_time, detected_interview_type, ' +
          'confidence, candidate_application_ids, outcome' +
          ') VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::time, $11, $12, $13::jsonb, \'processing\') ' +
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
          interviewDetails?.interviewType || null,
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
            'detected_interview_type = $8, confidence = $9, candidate_application_ids = $10::jsonb, outcome = \'processing\', ' +
            'review_reason = NULL, processed_at = NULL WHERE id = $1',
          [
            messageRowId,
            email.from.slice(0, 998),
            email.subject,
            email.receivedAt,
            classification.status,
            interviewDetails?.interviewDate || null,
            interviewDetails?.interviewTime || null,
            interviewDetails?.interviewType || null,
            classification.confidence,
            JSON.stringify(match.candidateIds || []),
          ]
        );
      } else {
        messageRowId = inserted.rows[0].id;
      }

      if (!classification.status) {
        await client.query(
          "UPDATE gmail_processed_messages SET outcome = 'ignored', review_reason = $2, processed_at = NOW() WHERE id = $1",
          [messageRowId, classification.reason || 'No supported application status rule matched.']
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
        'SELECT id, company, position, status, updated_at, ' +
          'interview_date::text AS interview_date, interview_time::text AS interview_time, ' +
          'interview_type, notification_channels, application_link, interview_email ' +
          'FROM applications WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [match.application.id, connection.user_id]
      );
      const application = applicationResult.rows[0];
      const isExistingInterview = Boolean(
        classification.status === 'Interview' && application?.status === 'Interview'
      );
      const detailsToFill = isExistingInterview
        ? getInterviewDetailsToUpdate(application, interviewDetails)
        : getInterviewDetailsToFill(application, interviewDetails);
      const interviewDetailsWereDetected = Boolean(
        interviewDetails?.interviewDate ||
        interviewDetails?.interviewTime ||
        interviewDetails?.interviewType
      );
      const interviewDetailsChanged = Boolean(
        detailsToFill.interviewDate || detailsToFill.interviewTime || detailsToFill.interviewType
      );
      const updateDecision = decideApplicationEmailUpdate({
        currentStatus: application?.status,
        detectedStatus: classification.status,
        updatedAt: application?.updated_at,
        receivedAt: email.receivedAt,
        interviewDetailsDetected: interviewDetailsWereDetected,
        interviewDetailsChanged,
      });
      if (updateDecision.action === 'manual_review' || !application) {
        await client.query(
          'UPDATE gmail_processed_messages SET outcome = \'review\', application_id = $2, review_reason = $3, processed_at = NOW() WHERE id = $1',
          [messageRowId, application ? application.id : null, updateDecision.reason || 'No confident application match was found.']
        );
        await client.query('COMMIT');
        return 'review';
      }

      if (updateDecision.action === 'already_up_to_date') {
        await client.query(
          "UPDATE gmail_processed_messages SET outcome = 'updated', application_id = $2, previous_status = $3, new_status = $3, review_reason = NULL, processed_at = NOW() WHERE id = $1",
          [messageRowId, application.id, application.status]
        );
        await client.query('COMMIT');
        return 'already_up_to_date';
      }

      const updated = await client.query(
        'UPDATE applications SET status = CASE WHEN $8::boolean THEN $3 ELSE status END, updated_at = NOW() ' +
          ', interview_date = CASE WHEN $10::boolean THEN COALESCE($6::date, interview_date) ELSE COALESCE(interview_date, $6::date) END, ' +
          'interview_time = CASE WHEN $10::boolean THEN COALESCE($7::time, interview_time) ELSE COALESCE(interview_time, $7::time) END, ' +
          'interview_type = CASE WHEN $10::boolean THEN COALESCE($9, interview_type) ELSE COALESCE(interview_type, $9) END ' +
          'WHERE id = $1 AND user_id = $2 AND status = $4 ' +
          'AND (updated_at <= $5 OR NOT $8::boolean) ' +
          'RETURNING id, company, position, status, interview_date::text AS interview_date, ' +
          'interview_time::text AS interview_time, interview_type, notification_channels, application_link, interview_email',
        [
          application.id,
          connection.user_id,
          classification.status,
          application.status,
          email.receivedAt,
          classification.status === 'Interview' ? detailsToFill.interviewDate : null,
          classification.status === 'Interview' ? detailsToFill.interviewTime : null,
          updateDecision.applyStatus,
          classification.status === 'Interview' ? detailsToFill.interviewType : null,
          Boolean(updateDecision.applyInterviewDetails && isExistingInterview),
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
    const existing = await pool.query(
      'SELECT outcome FROM gmail_processed_messages WHERE connection_id = $1 AND gmail_message_id = $2',
      [connection.id, messageId]
    );
    if (existing.rowCount > 0 && existing.rows[0]?.outcome !== 'review') return 'duplicate';

    const email = await fetchMessage(gmail, messageId);
    if (!email) return 'ignored';

    if (emailAddress(email.from) === String(connection.gmail_address).toLowerCase()) {
      return 'ignored';
    }

    let classification;
    try {
      classification = classifyApplicationEmail(email);
    } catch (error) {
      const classificationError = new Error('Gmail message classification failed.');
      classificationError.code = 'GMAIL_MESSAGE_CLASSIFY';
      classificationError.cause = error;
      throw classificationError;
    }
    const applications = classification.status || classification.ignored
      ? (await pool.query(
          'SELECT id, company, position, status, updated_at FROM applications WHERE user_id = $1',
          [connection.user_id]
        )).rows
      : [];
    let match = { outcome: 'ignored', candidateIds: [] };
    if (classification.ignored && applications.length) {
      const strongMatch = matchApplication(email, applications, {
        minimumConfidence: 0.95,
        requirePositionMatch: true,
        allowMultiCompanyAlert: true,
      });
      const hasTransactionalApplicationContext =
        /\b(?:your\s+(?:application|interview)|application\s+(?:status|update|for)|update\s+(?:on|about)\s+your\s+application)\b/i.test(
          `${email.subject || ''}\n${email.text || ''}`
        );
      if (strongMatch.outcome === 'matched' && hasTransactionalApplicationContext) {
        classification = classifyApplicationEmail(email, { allowGenericJobAlert: true });
        match = classification.status ? strongMatch : { outcome: 'ignored', candidateIds: [] };
      }
    }

    const interviewDetails = classification.status === 'Interview'
      ? {
          ...extractInterviewDateTime(email),
          interviewType: extractInterviewType(email),
        }
      : null;
    if (classification.status) {
      try {
        match = matchApplication(email, applications);
      } catch (error) {
        const matchingError = new Error('Gmail message application matching failed.');
        matchingError.code = 'GMAIL_MESSAGE_MATCH';
        matchingError.cause = error;
        throw matchingError;
      }
    }

    return recordMessage(connection, email, classification, match, interviewDetails);
  }

  async function recordMessageProcessingWarning(connection, messageId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO gmail_processed_messages (' +
          'connection_id, user_id, gmail_message_id, sender, subject, received_at, ' +
          'confidence, candidate_application_ids, outcome, review_reason, processed_at' +
        ') VALUES ($1, $2, $3, \'\', \'\', NOW(), 0, \'[]\'::jsonb, \'review\', $4, NOW()) ' +
        'ON CONFLICT (connection_id, gmail_message_id) DO NOTHING',
        [
          connection.id,
          connection.user_id,
          messageId,
          'This email could not be processed automatically. Inspect the original email in Gmail.',
        ]
      );
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function processMessagesIndividually(connection, gmail, messageIds) {
    const outcomes = [];
    const warnings = [];
    let warningsPersisted = true;

    for (const messageId of messageIds) {
      try {
        outcomes.push(await processMessage(connection, gmail, messageId));
      } catch (error) {
        if (
          error.gmailApiFailure ||
          isGmailQuotaError(error) ||
          [401, 403].includes(getGmailErrorStatus(error)) ||
          !['GMAIL_MESSAGE_NOT_FOUND', 'GMAIL_MESSAGE_PARSE', 'GMAIL_MESSAGE_CLASSIFY', 'GMAIL_MESSAGE_MATCH'].includes(error.code)
        ) {
          throw error;
        }

        console.warn('Gmail message processing warning:', getSafeSyncErrorDetails(error));
        try {
          await recordMessageProcessingWarning(connection, messageId);
        } catch (warningError) {
          warningsPersisted = false;
          console.error('Gmail message warning could not be recorded:', getSafeSyncErrorDetails(warningError));
        }
        outcomes.push('warning');
        warnings.push('An email could not be processed automatically.');
      }
    }

    return { outcomes, warnings, warningsPersisted };
  }

  async function listInitialPage(gmail, pageToken) {
    return withQuotaRetry(() => gmail.users.messages.list({
      userId: 'me',
      maxResults: INITIAL_SYNC_PAGE_SIZE,
      pageToken: pageToken || undefined,
      q: `newer_than:${Number(env.GMAIL_INITIAL_SYNC_DAYS || INITIAL_SYNC_DAYS)}d -in:sent`,
    }));
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
    const batch = await processMessagesIndividually(connection, gmail, ids);

    const nextPageToken = response.data.nextPageToken || null;
    if (batch.warningsPersisted) {
      await pool.query(
        'UPDATE gmail_connections SET ' +
          'initial_sync_page_token = $2, ' +
          'initial_sync_history_id = CASE WHEN $2::text IS NULL THEN NULL ELSE initial_sync_history_id END, ' +
          'history_id = CASE WHEN $2::text IS NULL THEN $3 ELSE history_id END, ' +
          'last_sync_at = NOW(), last_sync_error = NULL, updated_at = NOW() ' +
        'WHERE id = $1',
        [connection.id, nextPageToken, startingHistoryId]
      );
    }

    return {
      processed: ids.length,
      outcomes: batch.outcomes,
      warnings: batch.warnings,
      initialSyncComplete: batch.warningsPersisted && !nextPageToken,
      cursorRetained: !batch.warningsPersisted,
    };
  }

  async function syncHistory(connection, gmail) {
    let pageToken;
    const ids = new Set();
    let latestHistoryId = connection.history_id;

    do {
      const response = await withQuotaRetry(() => gmail.users.history.list({
        userId: 'me',
        startHistoryId: connection.history_id,
        historyTypes: ['messageAdded'],
        maxResults: HISTORY_PAGE_SIZE,
        pageToken,
      }));
      latestHistoryId = response.data.historyId || latestHistoryId;
      for (const history of response.data.history || []) {
        for (const added of history.messagesAdded || []) {
          if (added.message?.id) ids.add(added.message.id);
        }
      }
      pageToken = response.data.nextPageToken;
    } while (pageToken);

    const orderedIds = Array.from(ids);
    const batch = await processMessagesIndividually(connection, gmail, orderedIds);

    if (batch.warningsPersisted) {
      await pool.query(
        'UPDATE gmail_connections SET history_id = $2, last_sync_at = NOW(), ' +
          'last_sync_error = NULL, updated_at = NOW() WHERE id = $1',
        [connection.id, latestHistoryId]
      );
    }
    return {
      processed: orderedIds.length,
      outcomes: batch.outcomes,
      warnings: batch.warnings,
      initialSyncComplete: batch.warningsPersisted,
      cursorRetained: !batch.warningsPersisted,
    };
  }

  async function syncConnection(connectionId) {
    let lockClient;
    let hasLock = false;
    try {
      lockClient = await pool.connect();
      const lockResult = await lockClient.query(
        'SELECT pg_try_advisory_lock($1, hashtext($2)) AS acquired',
        [GMAIL_SYNC_LOCK_NAMESPACE, String(connectionId)]
      );
      hasLock = Boolean(lockResult.rows[0]?.acquired);
      if (!hasLock) {
        return { processed: 0, outcomes: [], inProgress: true };
      }

      const result = await pool.query(
        'SELECT * FROM gmail_connections WHERE id = $1 AND is_connected = TRUE',
        [connectionId]
      );
      const connection = result.rows[0];
      if (!connection) return { processed: 0, outcomes: [], disconnected: true };

      const cooldownResult = await pool.query(
        'SELECT CEIL(EXTRACT(EPOCH FROM (quota_backoff_until - NOW()))) AS retry_after_seconds ' +
          'FROM gmail_connections WHERE id = $1 AND quota_backoff_until > NOW()',
        [connection.id]
      );
      if (cooldownResult.rows[0]) {
        return {
          processed: 0,
          outcomes: [],
          quotaLimited: true,
          retryAfterSeconds: Number(cooldownResult.rows[0].retry_after_seconds),
        };
      }

      try {
        const gmail = await buildGmailClient(connection);
        let syncResult;
        const needsInitialSync = Boolean(
          connection.initial_sync_history_id || !connection.history_id
        );

        if (needsInitialSync) {
          const profile = connection.initial_sync_history_id
            ? null
            : (await withQuotaRetry(() => gmail.users.getProfile({ userId: 'me' }))).data;
          syncResult = await syncInitialPage(connection, gmail, profile || {});
        } else {
          try {
            syncResult = await syncHistory(connection, gmail);
          } catch (error) {
            if (error.code !== 404 && error.response?.status !== 404) throw error;
            const profile = (await withQuotaRetry(() =>
              gmail.users.getProfile({ userId: 'me' })
            )).data;
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

        await pool.query(
          'UPDATE gmail_connections SET quota_backoff_until = NULL, quota_failure_count = 0, ' +
            'last_sync_error = NULL, updated_at = NOW() WHERE id = $1',
          [connection.id]
        );
        return syncResult;
      } catch (error) {
        if (isGmailQuotaError(error)) {
          const retryAfterSeconds = getRetryAfterMs(error) / 1000;
          const backoffResult = await pool.query(
            'UPDATE gmail_connections SET ' +
              'quota_failure_count = LEAST(quota_failure_count + 1, 12), ' +
              'quota_backoff_until = NOW() + (GREATEST($2::double precision, ' +
                'LEAST($3::double precision * POWER(2, LEAST(quota_failure_count, 6)), $4::double precision)) ' +
                '* INTERVAL \'1 second\'), ' +
              'last_sync_error = $5, updated_at = NOW() WHERE id = $1 ' +
              'RETURNING CEIL(EXTRACT(EPOCH FROM (quota_backoff_until - NOW()))) AS retry_after_seconds',
            [
              connection.id,
              retryAfterSeconds,
              QUOTA_COOLDOWN_BASE_SECONDS,
              QUOTA_COOLDOWN_MAX_SECONDS,
              'Gmail is temporarily rate-limited. Sync will retry after a cooldown.',
            ]
          );
          return {
            processed: 0,
            outcomes: [],
            quotaLimited: true,
            retryAfterSeconds: Number(
              backoffResult.rows[0]?.retry_after_seconds || QUOTA_COOLDOWN_BASE_SECONDS
            ),
          };
        }

        const errorStatus = getGmailErrorStatus(error);
        const safeMessage = errorStatus === 401 || errorStatus === 403
          ? 'Gmail access was denied or expired. Reconnect Gmail and try again.'
          : 'Gmail sync failed. Please try again later.';
        await pool.query(
          'UPDATE gmail_connections SET last_sync_error = $2, updated_at = NOW() WHERE id = $1',
          [connection.id, safeMessage]
        );
        const syncError = new Error(safeMessage);
        syncError.cause = error;
        throw syncError;
      }
    } catch (error) {
      console.error('Gmail sync failed:', getSafeSyncErrorDetails(error));
      throw error;
    } finally {
      let unlockError;
      try {
        if (lockClient && hasLock) {
          await lockClient.query(
            'SELECT pg_advisory_unlock($1, hashtext($2))',
            [GMAIL_SYNC_LOCK_NAMESPACE, String(connectionId)]
          );
        }
      } catch (error) {
        unlockError = error;
        console.error('Gmail advisory lock release failed:', getSafeSyncErrorDetails(error));
      } finally {
        if (lockClient) lockClient.release(unlockError);
      }
      if (unlockError) throw unlockError;
    }
  }

  async function syncUser(userId) {
    const result = await pool.query(
      'SELECT id FROM gmail_connections WHERE user_id = $1 AND is_connected = TRUE',
      [userId]
    );
    if (!result.rows.length) {
      const error = new Error('No Gmail account is connected.');
      error.code = 'GMAIL_NOT_CONNECTED';
      throw error;
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
        if (error.code !== 'GMAIL_QUOTA_LIMITED') {
          console.error('Gmail sync failed for connection ' + connection.id + ': ' + error.message);
        }
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

module.exports = {
  createGmailSyncService,
  getSafeSyncErrorDetails,
  getRetryAfterMs,
  isGmailQuotaError,
  startGmailSyncWorker,
};