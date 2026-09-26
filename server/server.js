require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const DATABASE_URL = process.env.DATABASE_URL;

const WORKER_INTERVAL_MS = 30000;
const WORKER_BATCH_SIZE = 10;
const MAX_NOTIFICATION_ATTEMPTS = 3;
const WORKER_LEASE_MS = 5 * 60 * 1000;

const workerId = String(process.pid);

if (!DATABASE_URL) {
  console.error(
    'DATABASE_URL is missing. Set it in server/.env before starting the server.'
  );
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('error', function (err) {
  console.error('Unexpected PostgreSQL client error:', err);
});

const allowedOrigins = [
  CLIENT_URL,
  'http://localhost:3000',
  'https://my-app-kp67.vercel.app',
  'https://my-app-mu-ecru-96.vercel.app',
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function ensureDatabase() {
  if (!DATABASE_URL) {
    return;
  }

  await pool.query(
    'CREATE TABLE IF NOT EXISTS users (' +
      'id SERIAL PRIMARY KEY, ' +
      'full_name VARCHAR(255) NOT NULL, ' +
      'email VARCHAR(255) UNIQUE NOT NULL, ' +
      'password_hash VARCHAR(255) NOT NULL, ' +
      'phone_number VARCHAR(16), ' +
      'created_at TIMESTAMP DEFAULT NOW()' +
      ')'
  );

  await pool.query(
    'ALTER TABLE users ' +
      'ADD COLUMN IF NOT EXISTS phone_number VARCHAR(16)'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS applications (' +
      'id SERIAL PRIMARY KEY, ' +
      'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, ' +
      'company VARCHAR(255) NOT NULL, ' +
      'position VARCHAR(255) NOT NULL, ' +
      'application_date DATE NOT NULL, ' +
      'type VARCHAR(32) NOT NULL CHECK (type IN (\'Internship\', \'WIL\', \'Graduate Job\', \'Full-Time Job\', \'Job\')), ' +
      'status VARCHAR(32) NOT NULL DEFAULT \'Saved\' CHECK (status IN (\'Saved\', \'Applied\', \'Assessment\', \'Shortlisted\', \'Interview\', \'Offer\', \'Rejected\', \'Withdrawn\')), ' +
      'arrangement VARCHAR(16) NOT NULL CHECK (arrangement IN (\'Remote\', \'Hybrid\', \'Onsite\')), ' +
      'notes TEXT NOT NULL DEFAULT \'\', ' +
      'application_link TEXT, ' +
      'interview_date DATE, ' +
      'interview_time TIME, ' +
      'notification_channels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], ' +
      'interview_email VARCHAR(255), ' +
      'created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ' +
      'updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()' +
      ')'
  );

  await pool.query(
    'CREATE INDEX IF NOT EXISTS applications_user_idx ' +
      'ON applications (user_id, application_date DESC, created_at DESC)'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS notification_jobs (' +
      'id BIGSERIAL PRIMARY KEY, ' +
      'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, ' +
      'application_id VARCHAR(255) NOT NULL, ' +
      'notification_type VARCHAR(64) NOT NULL, ' +
      "channel VARCHAR(16) NOT NULL CHECK (channel IN ('Email', 'In-app')), " +
      'recipient_email VARCHAR(255), ' +
      'recipient_phone VARCHAR(16), ' +
      'company VARCHAR(255) NOT NULL, ' +
      'position VARCHAR(255) NOT NULL, ' +
      'interview_date DATE NOT NULL, ' +
      'interview_time TIME NOT NULL, ' +
      'application_link TEXT, ' +
      'scheduled_for TIMESTAMPTZ NOT NULL, ' +
      "status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (" +
        "status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')" +
      '), ' +
      'attempts INTEGER NOT NULL DEFAULT 0, ' +
      'next_attempt_at TIMESTAMPTZ, ' +
      'locked_at TIMESTAMPTZ, ' +
      'locked_by VARCHAR(255), ' +
      'processed_at TIMESTAMPTZ, ' +
      'last_error TEXT, ' +
      'read BOOLEAN NOT NULL DEFAULT FALSE, ' +
      'created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ' +
      'updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ' +
      'UNIQUE (' +
        'user_id, application_id, notification_type, channel' +
      ')' +
      ')'
  );

  await pool.query(
    "UPDATE notification_jobs SET status = 'cancelled', processed_at = NOW(), updated_at = NOW(), last_error = 'Legacy SMS notifications are no longer supported.' WHERE channel IN ('SMS', 'Phone') AND status IN ('pending', 'processing')"
  );

  await pool.query(
    'ALTER TABLE notification_jobs ' +
      'DROP CONSTRAINT IF EXISTS notification_jobs_channel_check'
  );

  await pool.query(
    'ALTER TABLE notification_jobs ' +
      'ADD CONSTRAINT notification_jobs_channel_check ' +
      "CHECK (channel IN ('Email', 'In-app'))"
  );

  await pool.query(
    'ALTER TABLE notification_jobs ' +
      'ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT FALSE'
  );

  await pool.query(
    'CREATE INDEX IF NOT EXISTS notification_jobs_due_idx ' +
      'ON notification_jobs (status, scheduled_for, next_attempt_at)'
  );

  await pool.query(
    'CREATE INDEX IF NOT EXISTS notification_jobs_user_idx ' +
      'ON notification_jobs (user_id, channel, status, scheduled_for)'
  );
}

app.get('/', function (req, res) {
  res.json({
    message: 'ApplyFlow backend is running.',
  });
});

app.get('/api/health', async function (req, res) {
  try {
    await pool.query('SELECT 1');

    res.status(200).json({
      status: 'UP',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(200).json({
      status: 'UP',
      database: 'disconnected',
      message: 'Database connection check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

function isValidEmail(value) {
  return (
    typeof value === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

function formatInterviewDate(value) {
  const date = String(value).slice(0, 10);
  const [year, month, day] = date.split('-');
  return year && month && day ? `${day}/${month}/${year}` : date;
}

function formatInterviewTime(value) {
  return String(value).slice(0, 5);
}

function authenticateRequest(req, res, next) {
  const authorization = req.headers.authorization || '';

  const token = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';

  if (!token) {
    return res.status(401).json({
      message: 'Authentication is required.',
    });
  }

  try {
    req.user = jwt.verify(
      token,
      process.env.JWT_SECRET || 'applyflow-dev-secret'
    );

    return next();
  } catch (error) {
    return res.status(401).json({
      message: 'Your session has expired. Please log in again.',
    });
  }
}

async function sendInterviewEmail(data) {
  const email = data.email;
  const company = data.company;
  const position = data.position;
  const interviewDate = data.interviewDate;
  const interviewTime = data.interviewTime;

  if (
    !process.env.RESEND_API_KEY ||
    !process.env.NOTIFICATION_FROM_EMAIL
  ) {
    return {
      channel: 'Email',
      sent: false,
      reason: 'Email provider is not configured.',
    };
  }

  const response = await fetch(
    'https://api.resend.com/emails',
    {
      method: 'POST',
      headers: {
        Authorization:
          'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.NOTIFICATION_FROM_EMAIL,
        to: [email],
        subject: 'Interview reminder: ' + company,
        text: `Your ${position} interview at ${company} is scheduled for ${formatInterviewDate(interviewDate)} at ${formatInterviewTime(interviewTime)}.`,
      }),
    }
  );

  if (!response.ok) {
    return {
      channel: 'Email',
      sent: false,
      reason: 'Email provider rejected the message.',
    };
  }

  return {
    channel: 'Email',
    sent: true,
  };
}

async function sendInterviewInApp() {
  return {
    channel: 'In-app',
    sent: true,
  };
}

function normalizeNotificationChannels(channels) {
  const normalized = [];

  if (channels.includes('In-app')) {
    normalized.push('In-app');
  }

  if (channels.includes('Email')) {
    normalized.push('Email');
  }

  return normalized;
}

async function replaceInterviewNotificationJobs(data) {
  const channels =
    normalizeNotificationChannels(
      data.notificationChannels
    );

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      'UPDATE notification_jobs ' +
        'SET ' +
        "status = 'cancelled', " +
        'processed_at = NOW(), ' +
        'updated_at = NOW(), ' +
        "last_error = 'Replaced by an updated interview schedule.' " +
        'WHERE ' +
        'user_id = $1 ' +
        'AND application_id = $2 ' +
        "AND status IN ('pending', 'processing') " +
        'AND NOT (channel = ANY($3::text[]))',
      [
        data.userId,
        data.applicationId,
        channels,
      ]
    );

    const jobs = [];

    for (const channel of channels) {
      const result = await client.query(
        'INSERT INTO notification_jobs (' +
          'user_id, ' +
          'application_id, ' +
          'notification_type, ' +
          'channel, ' +
          'recipient_email, ' +
          'recipient_phone, ' +
          'company, ' +
          'position, ' +
          'interview_date, ' +
          'interview_time, ' +
          'application_link, ' +
          'scheduled_for' +
        ') ' +
        'VALUES (' +
          "$1, $2, 'Interview Reminder', $3, " +
          '$4, $5, $6, $7, $8, $9, $10, $11' +
        ') ' +
        'ON CONFLICT (' +
          'user_id, application_id, notification_type, channel' +
        ') ' +
        'DO UPDATE SET ' +
          'recipient_email = EXCLUDED.recipient_email, ' +
          'recipient_phone = EXCLUDED.recipient_phone, ' +
          'company = EXCLUDED.company, ' +
          'position = EXCLUDED.position, ' +
          'interview_date = EXCLUDED.interview_date, ' +
          'interview_time = EXCLUDED.interview_time, ' +
          'application_link = EXCLUDED.application_link, ' +
          'scheduled_for = EXCLUDED.scheduled_for, ' +
          'read = FALSE, ' +
          'status = CASE ' +
            "WHEN notification_jobs.status = 'sent' " +
            'AND notification_jobs.scheduled_for = EXCLUDED.scheduled_for ' +
            "THEN 'sent' ELSE 'pending' END, " +
          'attempts = CASE ' +
            "WHEN notification_jobs.status = 'sent' " +
            'AND notification_jobs.scheduled_for = EXCLUDED.scheduled_for ' +
            'THEN notification_jobs.attempts ELSE 0 END, ' +
          'next_attempt_at = CASE ' +
            "WHEN notification_jobs.status = 'sent' " +
            'AND notification_jobs.scheduled_for = EXCLUDED.scheduled_for ' +
            'THEN notification_jobs.next_attempt_at ELSE NULL END, ' +
          'locked_at = NULL, ' +
          'locked_by = NULL, ' +
          'processed_at = CASE ' +
            "WHEN notification_jobs.status = 'sent' " +
            'AND notification_jobs.scheduled_for = EXCLUDED.scheduled_for ' +
            'THEN notification_jobs.processed_at ELSE NULL END, ' +
          'last_error = CASE ' +
            "WHEN notification_jobs.status = 'sent' " +
            'AND notification_jobs.scheduled_for = EXCLUDED.scheduled_for ' +
            'THEN notification_jobs.last_error ELSE NULL END, ' +
          'updated_at = NOW() ' +
        'RETURNING id, channel, status, scheduled_for',
        [
          data.userId,
          data.applicationId,
          channel,
          channel === 'Email'
            ? data.email
            : null,
          null,
          data.company,
          data.position,
          data.interviewDate,
          data.interviewTime,
          data.applicationLink || null,
          data.scheduledAt,
        ]
      );

      jobs.push(result.rows[0]);
    }

    await client.query('COMMIT');

    jobs.forEach(function (job) {
      console.log(
        'Notification job created: ' +
          job.id +
          ' (' +
          job.channel +
          ')'
      );
    });

    return jobs;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function claimDueNotificationJobs() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      'SELECT * ' +
        'FROM notification_jobs ' +
        'WHERE ' +
        '(' +
          "status = 'pending' " +
          'AND scheduled_for <= NOW() ' +
          'AND (' +
            'next_attempt_at IS NULL ' +
            'OR next_attempt_at <= NOW()' +
          ')' +
        ')' +
        ' OR ' +
        '(' +
          "status = 'processing' " +
          'AND locked_at < NOW() - ' +
          "($2::bigint * INTERVAL '1 millisecond')" +
        ')' +
        ' ORDER BY scheduled_for ASC ' +
        'LIMIT $1 ' +
        'FOR UPDATE SKIP LOCKED',
      [
        WORKER_BATCH_SIZE,
        WORKER_LEASE_MS,
      ]
    );

    const jobs = [];

    for (const job of result.rows) {
      const claimed = await client.query(
        'UPDATE notification_jobs ' +
          'SET ' +
          "status = 'processing', " +
          'attempts = attempts + 1, ' +
          'locked_at = NOW(), ' +
          'locked_by = $2, ' +
          'updated_at = NOW() ' +
          'WHERE id = $1 ' +
          'RETURNING *',
        [
          job.id,
          workerId,
        ]
      );

      jobs.push(claimed.rows[0]);
    }

    await client.query('COMMIT');

    jobs.forEach(function (job) {
      console.log(
        'Notification job claimed: ' +
          job.id +
          ' (' +
          job.channel +
          ')'
      );
    });

    return jobs;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function markNotificationJobSent(job) {
  await pool.query(
    'UPDATE notification_jobs ' +
      'SET ' +
        "status = 'sent', " +
        'processed_at = NOW(), ' +
        'locked_at = NULL, ' +
        'locked_by = NULL, ' +
        'last_error = NULL, ' +
        'updated_at = NOW() ' +
      'WHERE ' +
        'id = $1 ' +
        "AND status = 'processing' " +
        'AND locked_by = $2',
    [
      job.id,
      workerId,
    ]
  );

  console.log(
    'Notification job completed: ' +
      job.id
  );
}

async function markNotificationJobFailed(
  job,
  error
) {
  const exhausted =
    job.attempts >=
    MAX_NOTIFICATION_ATTEMPTS;

  const nextStatus =
    exhausted
      ? 'failed'
      : 'pending';

  const retryAt = exhausted
    ? null
    : new Date(
        Date.now() +
          Math.min(
            60 *
              Math.pow(
                2,
                job.attempts - 1
              ),
            3600
          ) *
          1000
      );

  await pool.query(
    'UPDATE notification_jobs ' +
      'SET ' +
        'status = $3::varchar, ' +
        'next_attempt_at = $4::timestamptz, ' +
        'processed_at = CASE ' +
          "WHEN $3::varchar = 'failed' " +
          'THEN NOW() ELSE NULL END, ' +
        'locked_at = NULL, ' +
        'locked_by = NULL, ' +
        'last_error = $5::text, ' +
        'updated_at = NOW() ' +
      'WHERE ' +
        'id = $1 ' +
        "AND status = 'processing' " +
        'AND locked_by = $2',
    [
      job.id,
      workerId,
      nextStatus,
      retryAt,
      error.message,
    ]
  );

  console.error(
    'Notification job failed: ' +
      job.id +
      ' (attempt ' +
      job.attempts +
      '/' +
      MAX_NOTIFICATION_ATTEMPTS +
      ')',
    error.message
  );
}

async function processNotificationJob(job) {
  try {
    let result;

    if (job.channel === 'Email') {
      result = await sendInterviewEmail({
        email: job.recipient_email,
        company: job.company,
        position: job.position,
        interviewDate: job.interview_date,
        interviewTime: job.interview_time,
        applicationLink: job.application_link,
      });
    } else if (job.channel === 'In-app') {
      result = await sendInterviewInApp();
    } else {
      throw new Error(
        'Unsupported notification channel: ' +
          job.channel
      );
    }

    if (!result.sent) {
      throw new Error(
        result.reason ||
          job.channel +
          ' provider rejected the notification.'
      );
    }

    await markNotificationJobSent(job);
  } catch (error) {
    await markNotificationJobFailed(
      job,
      error
    );
  }
}

let workerRunning = false;

async function processDueNotificationJobs() {
  if (workerRunning) {
    return;
  }

  workerRunning = true;

  try {
    const jobs =
      await claimDueNotificationJobs();

    for (const job of jobs) {
      await processNotificationJob(job);
    }
  } catch (error) {
    console.error(
      'Notification worker error:',
      error.message
    );
  } finally {
    workerRunning = false;
  }
}

function startNotificationWorker() {
  if (!DATABASE_URL) {
    return;
  }

  processDueNotificationJobs();

  setInterval(
    processDueNotificationJobs,
    WORKER_INTERVAL_MS
  );
}

app.post(
  '/api/notifications/interview',
  authenticateRequest,
  async function (req, res) {
    const body = req.body || {};

    const company = body.company;
    const position = body.position;
    const interviewDate = body.interviewDate;
    const interviewTime = body.interviewTime;
    const scheduledAt = body.scheduledAt;
    const applicationId = body.applicationId;
    const applicationLink = body.applicationLink;

    const notificationChannels =
      body.notificationChannels || [];

    const email = body.email;

    const channels =
      Array.isArray(notificationChannels)
        ? notificationChannels
        : [];

    const wantsInApp =
      channels.includes('In-app');

    const wantsEmail =
      channels.includes('Email');

    if (
      !applicationId ||
      !company ||
      !position ||
      !interviewDate ||
      !interviewTime ||
      !channels.some(function (channel) {
        return channel === 'In-app' || channel === 'Email';
      })
    ) {
      return res.status(400).json({
        message:
          'Interview details and at least one notification channel are required.',
      });
    }

    if (
      !scheduledAt ||
      Number.isNaN(
        new Date(scheduledAt).getTime()
      )
    ) {
      return res.status(400).json({
        message:
          'A valid scheduled interview time is required.',
      });
    }

    if (
      applicationLink &&
      !/^https?:\/\//i.test(
        applicationLink
      )
    ) {
      return res.status(400).json({
        message:
          'The application link must start with http:// or https://.',
      });
    }

    if (
      wantsEmail &&
      !isValidEmail(email)
    ) {
      return res.status(400).json({
        message:
          'A valid email address is required for email reminders.',
      });
    }

    try {
      const userResult =
        await pool.query(
          'SELECT email ' +
            'FROM users ' +
            'WHERE id = $1',
          [req.user.id]
        );

      if (userResult.rowCount === 0) {
        return res.status(401).json({
          message:
            'User account was not found.',
        });
      }

      const user =
        userResult.rows[0];

      const jobs =
        await replaceInterviewNotificationJobs({
          userId: req.user.id,
          applicationId: applicationId,
          company: company,
          position: position,
          interviewDate: interviewDate,
          interviewTime: interviewTime,
          applicationLink: applicationLink,
          scheduledAt: scheduledAt,
          email:
            email ||
            user.email,
          phone:
            user.phone_number,
          notificationChannels:
            channels,
        });

      const results =
        jobs.map(function (job) {
          return {
            channel:
              job.channel,
            sent: false,
            scheduled: true,
            scheduledFor:
              new Date(
                job.scheduled_for
              ).toISOString(),
            providerConfigured:
              job.channel === 'Email'
                ? Boolean(
                    process.env
                      .RESEND_API_KEY &&
                    process.env
                      .NOTIFICATION_FROM_EMAIL
                  )
                : true,
          };
        });

      return res.status(200).json({
        results: results,
      });
    } catch (error) {
      console.error(
        'Interview notification delivery failed:',
        error.message
      );

      return res.status(502).json({
        message:
          'The notification provider could not be reached.',
      });
    }
  }
);

app.get(
  '/api/notifications',
  authenticateRequest,
  async function (req, res) {
    try {
      const result =
        await pool.query(
          'SELECT ' +
            'id, ' +
            'notification_type, ' +
            'company, ' +
            'position, ' +
            'interview_date, ' +
            'interview_time, ' +
            'application_id, ' +
            'application_link, ' +
            'scheduled_for, ' +
            'read, ' +
            'status, ' +
            'created_at ' +
          'FROM notification_jobs ' +
          'WHERE ' +
            'user_id = $1 ' +
            "AND channel = 'In-app' " +
            "AND status <> 'cancelled' " +
          'ORDER BY scheduled_for ASC, created_at DESC',
          [req.user.id]
        );

      const notifications =
        result.rows.map(function (notification) {
          return {
            id: String(notification.id),
            title:
              'Interview coming up at ' +
              notification.company,
            type:
              notification.notification_type,
            message:
              notification.position +
              ' is scheduled for ' +
              notification.interview_date +
              ' at ' +
              String(
                notification.interview_time
              ).slice(0, 5) +
              '.',
            date:
              notification.interview_date,
            read:
              notification.read,
            applicationId:
              notification.application_id,
            applicationLink:
              notification.application_link,
            scheduledFor:
              notification.scheduled_for,
            status:
              notification.status,
          };
        });

      return res.status(200).json({
        notifications:
          notifications,
      });
    } catch (error) {
      console.error(
        'Loading in-app notifications failed:',
        error.message
      );

      return res.status(500).json({
        message:
          'Unable to load notifications.',
      });
    }
  }
);

app.patch(
  '/api/notifications/:notificationId/read',
  authenticateRequest,
  async function (req, res) {
    try {
      const result =
        await pool.query(
          'UPDATE notification_jobs ' +
            'SET ' +
              'read = TRUE, ' +
              'updated_at = NOW() ' +
            'WHERE ' +
              'id = $1 ' +
              'AND user_id = $2 ' +
              "AND channel = 'In-app' " +
            'RETURNING id',
          [
            req.params.notificationId,
            req.user.id,
          ]
        );

      if (result.rowCount === 0) {
        return res.status(404).json({
          message:
            'Notification was not found.',
        });
      }

      return res.status(200).json({
        message:
          'Notification marked as read.',
      });
    } catch (error) {
      console.error(
        'Mark notification as read failed:',
        error.message
      );

      return res.status(500).json({
        message:
          'Unable to update notification.',
      });
    }
  }
);

app.delete(
  '/api/notifications/interview/:applicationId',
  authenticateRequest,
  async function (req, res) {
    try {
      const result =
        await pool.query(
          'UPDATE notification_jobs ' +
            'SET ' +
              "status = 'cancelled', " +
              'processed_at = NOW(), ' +
              'locked_at = NULL, ' +
              'locked_by = NULL, ' +
              "last_error = 'Cancelled because the interview was removed or rescheduled.', " +
              'updated_at = NOW() ' +
            'WHERE ' +
              'user_id = $1 ' +
              'AND application_id = $2 ' +
              "AND status IN ('pending', 'processing') " +
            'RETURNING id',
          [
            req.user.id,
            req.params.applicationId,
          ]
        );

      result.rows.forEach(
        function (job) {
          console.log(
            'Notification job cancelled: ' +
              job.id
          );
        }
      );

      return res.status(200).json({
        cancelled:
          result.rowCount,
      });
    } catch (error) {
      console.error(
        'Notification cancellation failed:',
        error.message
      );

      return res.status(500).json({
        message:
          'Notification cancellation failed.',
      });
    }
  }
);

app.get(
  '/api/applications',
  authenticateRequest,
  async function (req, res) {
    try {
      const result = await pool.query(
        'SELECT ' +
          'id, ' +
          'company, ' +
          'position, ' +
          'application_date AS date, ' +
          'type, ' +
          'status, ' +
          'arrangement, ' +
          'notes, ' +
          'application_link AS "applicationLink", ' +
          'interview_date AS "interviewDate", ' +
          'interview_time AS "interviewTime", ' +
          'notification_channels AS "notificationChannels", ' +
          'interview_email AS "interviewEmail" ' +
        'FROM applications ' +
        'WHERE user_id = $1 ' +
        'ORDER BY application_date DESC, created_at DESC',
        [req.user.id]
      );

      const applications = result.rows.map(function (application) {
        return {
          id: String(application.id),
          company: application.company,
          position: application.position,
          date: application.date ? application.date.toISOString().slice(0, 10) : '',
          type: application.type,
          status: application.status,
          arrangement: application.arrangement,
          notes: application.notes || '',
          applicationLink: application.applicationLink || undefined,
          interviewDate: application.interviewDate ? application.interviewDate.toISOString().slice(0, 10) : undefined,
          interviewTime: application.interviewTime ? application.interviewTime.slice(0, 5) : undefined,
          notificationChannels: Array.isArray(application.notificationChannels) ? application.notificationChannels : [],
          interviewEmail: application.interviewEmail || undefined,
        };
      });

      return res.status(200).json({ applications: applications });
    } catch (error) {
      console.error('Loading applications failed:', error.message);
      return res.status(500).json({
        message: 'Unable to load applications.',
      });
    }
  }
);

app.post(
  '/api/register',
  async function (req, res) {
    try {
      const body = req.body || {};

      const fullName = body.fullName;
      const email = body.email;
      const password = body.password;

      if (
        !fullName ||
        !email ||
        !password
      ) {
        return res.status(400).json({
          message:
            'Please complete all required fields.',
        });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({
          message:
            'Please enter a valid email address.',
        });
      }

      if (password.length < 8) {
        return res.status(400).json({
          message:
            'Password must be at least 8 characters long.',
        });
      }

      const normalizedEmail =
        String(email)
          .trim()
          .toLowerCase();

      const existingUser =
        await pool.query(
          'SELECT id ' +
            'FROM users ' +
            'WHERE email = $1',
          [normalizedEmail]
        );

      if (
        existingUser.rowCount > 0
      ) {
        return res.status(409).json({
          message:
            'A user with this email already exists.',
        });
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          10
        );

      const result =
        await pool.query(
          'INSERT INTO users (' +
            'full_name, ' +
            'email, ' +
            'password_hash' +
          ') ' +
          'VALUES ($1, $2, $3) ' +
          'RETURNING ' +
            'id, ' +
            'full_name AS "fullName", ' +
            'email',
          [
            String(
              fullName
            ).trim(),
            normalizedEmail,
            passwordHash,
          ]
        );

      const user =
        result.rows[0];

      return res.status(201).json({
        message:
          'User registered successfully.',
        user: user,
      });
    } catch (error) {
      console.error(
        'Register error:',
        error
      );

      return res.status(500).json({
        message:
          'Registration failed. Please try again.',
      });
    }
  }
);

app.post(
  '/api/login',
  async function (req, res) {
    try {
      const body = req.body || {};

      const email = body.email;
      const password = body.password;

      if (
        !email ||
        !password
      ) {
        return res.status(400).json({
          message:
            'Email and password are required.',
        });
      }

      const normalizedEmail =
        String(email)
          .trim()
          .toLowerCase();

      const result =
        await pool.query(
          'SELECT * ' +
            'FROM users ' +
            'WHERE email = $1',
          [normalizedEmail]
        );

      if (result.rowCount === 0) {
        return res.status(401).json({
          message:
            'Invalid email or password.',
        });
      }

      const user =
        result.rows[0];

      const isValidPassword =
        await bcrypt.compare(
          String(password),
          user.password_hash
        );

      if (!isValidPassword) {
        return res.status(401).json({
          message:
            'Invalid email or password.',
        });
      }

      const token =
        jwt.sign(
          {
            id: user.id,
            email: user.email,
          },
          process.env.JWT_SECRET ||
            'applyflow-dev-secret',
          {
            expiresIn: '1h',
          }
        );

      return res.status(200).json({
        message:
          'Login successful.',
        token: token,
        user: {
          id: user.id,
          fullName:
            user.full_name,
          email:
            user.email,
        },
      });
    } catch (error) {
      console.error(
        'Login error:',
        error
      );

      return res.status(500).json({
        message:
          'Login failed. Please try again.',
      });
    }
  }
);

app.use(
  function (req, res) {
    res.status(404).json({
      error: 'Route not found',
    });
  }
);

app.use(
  function (err, req, res, next) {
    console.error(err.stack);

    res.status(500).json({
      error:
        'Something went wrong on the server',
    });
  }
);

ensureDatabase()
  .then(function () {
    app.listen(
      PORT,
      function () {
        console.log(
          'ApplyFlow server is running on http://localhost:' +
            PORT
        );

        startNotificationWorker();
      }
    );
  })
  .catch(function (error) {
    console.error(
      'Failed to initialize database:',
      error
    );

    process.exit(1);
  });