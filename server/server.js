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

if (!DATABASE_URL) {
  console.error('DATABASE_URL is missing. Set it in server/.env before starting the server.');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error:', err);
});

async function ensureUserTable() {
  if (!DATABASE_URL) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value) {
  return typeof value === 'string' && /^\+[1-9]\d{7,14}$/.test(value);
}

async function sendInterviewEmail({ email, company, position, interviewDate, interviewTime }) {
  if (!process.env.RESEND_API_KEY || !process.env.NOTIFICATION_FROM_EMAIL) {
    return { channel: 'Email', sent: false, reason: 'Email provider is not configured.' };
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
    return { channel: 'Email', sent: false, reason: 'Email provider rejected the message.' };
  }

  return { channel: 'Email', sent: true };
}

async function sendInterviewSms({ phone, company, position, interviewDate, interviewTime }) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    return { channel: 'Phone', sent: false, reason: 'Phone provider is not configured.' };
  }

  const body = new URLSearchParams({
    From: TWILIO_FROM_NUMBER,
    To: phone,
    Body: `Interview reminder: ${position} at ${company} on ${interviewDate} at ${interviewTime}.`,
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    return { channel: 'Phone', sent: false, reason: 'Phone provider rejected the message.' };
  }

  return { channel: 'Phone', sent: true };
}

app.post('/api/notifications/interview', async (req, res) => {
  const {
    company,
    position,
    interviewDate,
    interviewTime,
    notificationChannels = [],
    email,
    phone,
  } = req.body || {};
  const channels = Array.isArray(notificationChannels) ? notificationChannels : [];

  if (!company || !position || !interviewDate || !interviewTime || !channels.some((channel) => channel === 'Email' || channel === 'Phone')) {
    return res.status(400).json({ message: 'Interview details and at least one external notification channel are required.' });
  }

  if (channels.includes('Email') && !isValidEmail(email)) {
    return res.status(400).json({ message: 'A valid email address is required for email reminders.' });
  }

  if (channels.includes('Phone') && !isValidPhone(phone)) {
    return res.status(400).json({ message: 'Use an international phone number such as +27123456789 for phone reminders.' });
  }

  try {
    const results = [];
    if (channels.includes('Email')) {
      results.push(await sendInterviewEmail({ email, company, position, interviewDate, interviewTime }));
    }
    if (channels.includes('Phone')) {
      results.push(await sendInterviewSms({ phone, company, position, interviewDate, interviewTime }));
    }

    return res.status(200).json({ results });
  } catch (error) {
    console.error('Interview notification delivery failed:', error.message);
    return res.status(502).json({ message: 'The notification provider could not be reached.' });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const { fullName, email, password } = req.body || {};

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'Please complete all required fields.' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);

    if (existingUser.rowCount > 0) {
      return res.status(409).json({ message: 'A user with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (full_name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, full_name AS "fullName", email',
      [String(fullName).trim(), normalizedEmail, passwordHash]
    );

    const user = result.rows[0];

    return res.status(201).json({
      message: 'User registered successfully.',
      user,
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ message: 'Registration failed. Please try again.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);

    if (result.rowCount === 0) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(String(password), user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'applyflow-dev-secret',
      { expiresIn: '1h' }
    );

    return res.status(200).json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Login failed. Please try again.' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

ensureUserTable()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`ApplyFlow server is running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });


