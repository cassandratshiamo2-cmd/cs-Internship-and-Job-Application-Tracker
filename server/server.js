require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const twilio = require('twilio');

const app = express();

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const DATABASE_URL = process.env.DATABASE_URL;

const WORKER_INTERVAL_MS = 30_000;
const WORKER_BATCH_SIZE = 10;
const MAX_NOTIFICATION_ATTEMPTS = 3;
const WORKER_LEASE_MS = 5 * 60 * 1000;

const workerId = `${process.pid}-${Math.random().toString(36).slice(2)}`;

if (!DATABASE_URL) {
  console.error(
    'DATABASE_URL is missing. Set it in server/.env before starting the server.'
  );
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error:', err);
});

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/

const allowedOrigins = [
  CLIENT_URL,
  'https://my-app-kp67.vercel.app',
  'https://my-app-mu-ecru-96.vercel.app',
];

app.use(
  cors({
    origin: (origin, callback) => {
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

/*
|--------------------------------------------------------------------------
| Database setup
|--------------------------------------------------------------------------
*/

async function ensureDatabase() {
  if (!DATABASE_URL) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      phone_number VARCHAR(16),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(16)'
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_jobs (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      application_id VARCHAR(255) NOT NULL,
      notification_type VARCHAR(64) NOT NULL,
      channel VARCHAR(16) NOT NULL CHECK (channel IN ('Email', 'SMS')),
      recipient_email VARCHAR(255),
      recipient_phone VARCHAR(16),
      company VARCHAR(255) NOT NULL,
      position VARCHAR(255) NOT NULL,
      interview_date DATE NOT NULL,
      interview_time TIME NOT NULL,
      application_link TEXT,
      scheduled_for TIMESTAMPTZ NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ,
      locked_at TIMESTAMPTZ,
      locked_by VARCHAR(255),
      processed_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, application_id, notification_type, channel)
    );
  `);

  await pool.query(
    'CREATE INDEX IF NOT EXISTS notification_jobs_due_idx ON notification_jobs (status, scheduled_for, next_attempt_at)'
  );
}

/*
|--------------------------------------------------------------------------
| Basic routes
|--------------------------------------------------------------------------
*/

app.get('/', (req, res) => {
  res.json({ message: 'ApplyFlow backend is running.' });
});

app.get('/api/health', async (req, res) => {
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

/*
|--------------------------------------------------------------------------
| Validation helpers
|--------------------------------------------------------------------------
*/

function isValidEmail(value) {
  return (
    typeof value === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

function isValidPhone(value) {
  return (
    typeof value === 'string' &&
    /^\+[1-9]\d{7,14}$/.test(value)
  );
}

function isSmsChannel(channel) {
  return channel === 'SMS' || channel === 'Phone';
}

/*
|--------------------------------------------------------------------------
| Authentication
|--------------------------------------------------------------------------
*/

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
  } catch {
    return res.status(401).json({
      message: 'Your session has expired. Please log in again.',
    });
  }
}

/*
|--------------------------------------------------------------------------
| Email notification
|--------------------------------------------------------------------------
*/

async function sendInterviewEmail({
  email,
  company,
  position,
  interviewDate,
  interviewTime,
}) {
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

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.NOTIFICATION_FROM_EMAIL,
      to: [email],
      subject: `Interview reminder: ${company}`,
      text: `Your ${position} interview at ${company} is scheduled for ${interviewDate} at ${interviewTime}.`,
    }),
  });

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

/*
|--------------------------------------------------------------------------
| SMS notification
|--------------------------------------------------------------------------
*/

async function sendInterviewSms({
  phone,
  company,
  position,
  interviewDate,
  interviewTime,
  applicationLink,
}) {
  const {
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_FROM_NUMBER,
  } = process.env;

  if (
    !TWILIO_ACCOUNT_SID ||
    !TWILIO_AUTH_TOKEN ||
    !TWILIO_FROM_NUMBER
  ) {
    return {
      channel: 'SMS',
      sent: false,
      reason: 'SMS provider is not configured.',
    };
  }

  const twilioClient = twilio(
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN
  );

  await twilioClient.messages.create({
    from: TWILIO_FROM_NUMBER,
    to: phone,
    body: `Interview reminder: ${position} at ${company} on ${interviewDate} at ${interviewTime}.${applicationLink ? ` Job post: ${applicationLink}` : ''}`,
  });

  return {
    channel: 'SMS',
    sent: true,
  };
}

/*
|--------------------------------------------------------------------------
| Notification helpers
|--------------------------------------------------------------------------
*/

function normalizeNotificationChannels(channels) {
  const normalized = [];

  if (channels.includes('Email')) {
    normalized.push('Email');
  }

  if (channels.some(isSmsChannel)) {
    normalized.push('SMS');
  }

  return normalized;
}

async function replaceInterviewNotificationJobs({
  userId,
  applicationId,
  company,
  position,
  interviewDate,
  interviewTime,
  applicationLink,
  scheduledAt,
  email,
  phone,
  notificationChannels,
}) {
  const channels = normalizeNotificationChannels(
    notificationChannels
  );

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `
        UPDATE notification_jobs
        SET
          status = 'cancelled',
          processed_at = NOW(),
          updated_at = NOW(),
          last_error = 'Replaced by an updated interview schedule.'
        WHERE
          user_id = $1
          AND application_id = $2
          AND status IN ('pending', 'processing')
          AND NOT (channel = ANY($3::text[]))
      `,
      [userId, applicationId, channels]
    );

    const jobs = [];

    for (const channel of channels) {
      const result = await client.query(
        `
          INSERT INTO notification_jobs (
            user_id,
            application_id,
            notification_type,
            channel,
            recipient_email,
            recipient_phone,
            company,
            position,
            interview_date,
            interview_time,
            application_link,
            scheduled_for
          )
          VALUES (
            $1, $2, 'Interview Reminder', $3, $4, $5,
            $6, $7, $8, $9, $10, $11
          )
          ON CONFLICT (
            user_id,
            application_id,
            notification_type,
            channel
          )
          DO UPDATE SET
            recipient_email = EXCLUDED.recipient_email,
            recipient_phone = EXCLUDED.recipient_phone,
            company = EXCLUDED.company,
            position = EXCLUDED.position,
            interview_date = EXCLUDED.interview_date,
            interview_time = EXCLUDED.interview_time,
            application_link = EXCLUDED.application_link,
            scheduled_for = EXCLUDED.scheduled_for,

            status = CASE
              WHEN notification_jobs.status = 'sent'
                AND notification_jobs.scheduled_for = EXCLUDED.scheduled_for
              THEN 'sent'
              ELSE 'pending'
            END,

            attempts = CASE
              WHEN notification_jobs.status = 'sent'
                AND notification_jobs.scheduled_for = EXCLUDED.scheduled_for
              THEN notification_jobs.attempts
              ELSE 0
            END,

            next_attempt_at = CASE
              WHEN notification_jobs.status = 'sent'
                AND notification_jobs.scheduled_for = EXCLUDED.scheduled_for
              THEN notification_jobs.next_attempt_at
              ELSE NULL
            END,

            locked_at = NULL,
            locked_by = NULL,

            processed_at = CASE
              WHEN notification_jobs.status = 'sent'
                AND notification_jobs.scheduled_for = EXCLUDED.scheduled_for
              THEN notification_jobs.processed_at
              ELSE NULL
            END,

            last_error = CASE
              WHEN notification_jobs.status = 'sent'
                AND notification_jobs.scheduled_for = EXCLUDED.scheduled_for
              THEN notification_jobs.last_error
              ELSE NULL
            END,

            updated_at = NOW()

          RETURNING id, channel, status, scheduled_for
        `,
        [
          userId,
          applicationId,
          channel,
          channel === 'Email' ? email : null,
          channel === 'SMS' ? phone : null,
          company,
          position,
          interviewDate,
          interviewTime,
          applicationLink || null,
          scheduledAt,
        ]
      );

      jobs.push(result.rows[0]);
    }

    await client.query('COMMIT');

    jobs.forEach((job) => {
      console.log(
        `Notification job created: ${job.id} (${job.channel})`
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

/*
|--------------------------------------------------------------------------
| Notification worker
|--------------------------------------------------------------------------
*/

async function claimDueNotificationJobs() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        SELECT *
        FROM notification_jobs
        WHERE (
          status = 'pending'
          AND scheduled_for <= NOW()
          AND (
            next_attempt_at IS NULL
            OR next_attempt_at <= NOW()
          )
        )
        OR (
          status = 'processing'
          AND locked_at < NOW() -
            ($2 * INTERVAL '1 millisecond')
        )
        ORDER BY scheduled_for ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      `,
      [WORKER_BATCH_SIZE, WORKER_LEASE_MS]
    );

    const jobs = [];

    for (const job of result.rows) {
      const claimed = await client.query(
        `
          UPDATE notification_jobs
          SET
            status = 'processing',
            attempts = attempts + 1,
            locked_at = NOW(),
            locked_by = $2,
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [job.id, workerId]
      );

      jobs.push(claimed.rows[0]);
    }

    await client.query('COMMIT');

    jobs.forEach((job) => {
      console.log(
        `Notification job claimed: ${job.id} (${job.channel})`
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
    `
      UPDATE notification_jobs
      SET
        status = 'sent',
        processed_at = NOW(),
        locked_at = NULL,
        locked_by = NULL,
        last_error = NULL,
        updated_at = NOW()
      WHERE
        id = $1
        AND status = 'processing'
        AND locked_by = $2
    `,
    [job.id, workerId]
  );

  console.log(`Notification job completed: ${job.id}`);
}

async function markNotificationJobFailed(job, error) {
  const exhausted =
    job.attempts >= MAX_NOTIFICATION_ATTEMPTS;

  const retryAt = new Date(
    Date.now() +
      Math.min(
        60 * 2 ** (job.attempts - 1),
        3600
      ) *
        1000
  );

  await pool.query(
    `
      UPDATE notification_jobs
      SET
        status = $3,
        next_attempt_at = $4,
        processed_at = CASE
          WHEN $3 = 'failed' THEN NOW()
          ELSE NULL
        END,
        locked_at = NULL,
        locked_by = NULL,
        last_error = $5,
        updated_at = NOW()
      WHERE
        id = $1
        AND status = 'processing'
        AND locked_by = $2
    `,
    [
      job.id,
      workerId,
      exhausted ? 'failed' : 'pending',
      exhausted ? null : retryAt,
      error.message,
    ]
  );

  console.error(
    `Notification job failed: ${job.id} ` +
      `(attempt ${job.attempts}/${MAX_NOTIFICATION_ATTEMPTS})`,
    error.message
  );
}

async function processNotificationJob(job) {
  try {
    const result =
      job.channel === 'SMS'
        ? await sendInterviewSms({
            phone: job.recipient_phone,
            company: job.company,
            position: job.position,
            interviewDate: job.interview_date,
            interviewTime: job.interview_time,
            applicationLink: job.application_link,
          })
        : await sendInterviewEmail({
            email: job.recipient_email,
            company: job.company,
            position: job.position,
            interviewDate: job.interview_date,
            interviewTime: job.interview_time,
          });

    if (!result.sent) {
      throw new Error(
        result.reason ||
          `${job.channel} provider rejected the notification.`
      );
    }

    await markNotificationJobSent(job);
  } catch (error) {
    await markNotificationJobFailed(job, error);
  }
}

let workerRunning = false;

async function processDueNotificationJobs() {
  if (workerRunning) {
    return;
  }

  workerRunning = true;

  try {
    const jobs = await claimDueNotificationJobs();

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

/*
|--------------------------------------------------------------------------
| Interview notification API
|--------------------------------------------------------------------------
*/

app.post(
  '/api/notifications/interview',
  authenticateRequest,
  async (req, res) => {
    const {
      company,
      position,
      interviewDate,
      interviewTime,
      scheduledAt,
      applicationId,
      applicationLink,
      notificationChannels = [],
      email,
      phoneNumber,
    } = req.body || {};

    const channels = Array.isArray(notificationChannels)
      ? notificationChannels
      : [];

    const wantsSms = channels.some(isSmsChannel);

    if (
      !applicationId ||
      !company ||
      !position ||
      !interviewDate ||
      !interviewTime ||
      !channels.some(
        (channel) =>
          channel === 'Email' ||
          isSmsChannel(channel)
      )
    ) {
      return res.status(400).json({
        message:
          'Interview details and at least one external notification channel are required.',
      });
    }

    if (
      !scheduledAt ||
      Number.isNaN(new Date(scheduledAt).getTime())
    ) {
      return res.status(400).json({
        message:
          'A valid scheduled interview time is required.',
      });
    }

    if (
      applicationLink &&
      !/^https?:\/\//i.test(applicationLink)
    ) {
      return res.status(400).json({
        message:
          'The application link must start with http:// or https://.',
      });
    }

    if (
      channels.includes('Email') &&
      !isValidEmail(email)
    ) {
      return res.status(400).json({
        message:
          'A valid email address is required for email reminders.',
      });
    }

    try {
      const userResult = await pool.query(
        'SELECT email, phone_number FROM users WHERE id = $1',
        [req.user.id]
      );

      if (userResult.rowCount === 0) {
        return res.status(401).json({
          message: 'User account was not found.',
        });
      }

      const user = userResult.rows[0];

      if (wantsSms && phoneNumber) {
        const normalizedPhone = String(phoneNumber).trim();

        if (!isValidPhone(normalizedPhone)) {
          return res.status(400).json({
            message:
              'Use an international phone number such as +27123456789 for SMS reminders.',
          });
        }

        await pool.query(
          'UPDATE users SET phone_number = $1 WHERE id = $2',
          [normalizedPhone, req.user.id]
        );

        user.phone_number = normalizedPhone;
      }

      if (
        wantsSms &&
        !isValidPhone(user.phone_number)
      ) {
        return res.status(400).json({
          message:
            'Add a valid international phone number to your account before selecting SMS reminders.',
        });
      }

      const jobs =
        await replaceInterviewNotificationJobs({
          userId: req.user.id,
          applicationId,
          company,
          position,
          interviewDate,
          interviewTime,
          applicationLink,
          scheduledAt,
          email: email || user.email,
          phone: user.phone_number,
          notificationChannels: channels,
        });

      const results = jobs.map((job) => ({
        channel: job.channel,
        sent: false,
        scheduled: true,
        scheduledFor: new Date(
          job.scheduled_for
        ).toISOString(),
        providerConfigured:
          job.channel !== 'SMS' ||
          Boolean(
            process.env.TWILIO_ACCOUNT_SID &&
              process.env.TWILIO_AUTH_TOKEN &&
              process.env.TWILIO_FROM_NUMBER
          ),
      }));

      return res.status(200).json({
        results,
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

app.delete(
  '/api/notifications/interview/:applicationId',
  authenticateRequest,
  async (req, res) => {
    try {
      const result = await pool.query(
        `
          UPDATE notification_jobs
          SET
            status = 'cancelled',
            processed_at = NOW(),
            locked_at = NULL,
            locked_by = NULL,
            last_error =
              'Cancelled because the interview was removed or rescheduled.',
            updated_at = NOW()
          WHERE
            user_id = $1
            AND application_id = $2
            AND status IN ('pending', 'processing')
          RETURNING id
        `,
        [
          req.user.id,
          req.params.applicationId,
        ]
      );

      result.rows.forEach((job) => {
        console.log(
          `Notification job cancelled: ${job.id}`
        );
      });

      return res.status(200).json({
        cancelled: result.rowCount,
      });
    } catch (error) {
      console.error(
        'Notification cancellation failed:',
        error.message
      );

      return res.status(500).json({
        message: 'Notification cancellation failed.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| Register
|--------------------------------------------------------------------------
*/

app.post('/api/register', async (req, res) => {
  try {
    const {
      fullName,
      email,
      password,
      phoneNumber,
    } = req.body || {};

    if (!fullName || !email || !password) {
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

    const normalizedPhone = phoneNumber
      ? String(phoneNumber).trim()
      : null;

    if (
      normalizedPhone &&
      !isValidPhone(normalizedPhone)
    ) {
      return res.status(400).json({
        message:
          'Use an international phone number such as +27123456789.',
      });
    }

    const normalizedEmail = String(email)
      .trim()
      .toLowerCase();

    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (existingUser.rowCount > 0) {
      return res.status(409).json({
        message:
          'A user with this email already exists.',
      });
    }

    const passwordHash = await bcrypt.hash(
      password,
      10
    );

    const result = await pool.query(
      `
        INSERT INTO users (
          full_name,
          email,
          password_hash,
          phone_number
        )
        VALUES ($1, $2, $3, $4)
        RETURNING
          id,
          full_name AS "fullName",
          email,
          phone_number AS "phoneNumber"
      `,
      [
        String(fullName).trim(),
        normalizedEmail,
        passwordHash,
        normalizedPhone,
      ]
    );

    const user = result.rows[0];

    return res.status(201).json({
      message: 'User registered successfully.',
      user,
    });
  } catch (error) {
    console.error('Register error:', error);

    return res.status(500).json({
      message:
        'Registration failed. Please try again.',
    });
  }
});

/*
|--------------------------------------------------------------------------
| Login
|--------------------------------------------------------------------------
*/

app.post('/api/login', async (req, res) => {
  try {
    const {
      email,
      password,
    } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        message:
          'Email and password are required.',
      });
    }

    const normalizedEmail = String(email)
      .trim()
      .toLowerCase();

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        message:
          'Invalid email or password.',
      });
    }

    const user = result.rows[0];

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

    const token = jwt.sign(
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
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        phoneNumber: user.phone_number,
      },
    });
  } catch (error) {
    console.error('Login error:', error);

    return res.status(500).json({
      message:
        'Login failed. Please try again.',
    });
  }
});

/*
|--------------------------------------------------------------------------
| 404 and error handling
|--------------------------------------------------------------------------
*/

app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);

  res.status(500).json({
    error: 'Something went wrong on the server',
  });
});

/*
|--------------------------------------------------------------------------
| Start server
|--------------------------------------------------------------------------
*/

ensureDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(
        `ApplyFlow server is running on http://localhost:${PORT}`
      );

      startNotificationWorker();
    });
  })
  .catch((error) => {
    console.error(
      'Failed to initialize database:',
      error
    );

    process.exit(1);
  });