require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  family: 4,
});
(async () => {
  const email = 'debug-' + Date.now() + '@example.com';
  const fullName = 'Debug User';
  const password = 'Password123';
  const hash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    'INSERT INTO users (full_name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, full_name AS "fullName", email',
    [fullName, email, hash]
  );
  console.log('INSERT_RESULT', JSON.stringify(result.rows[0]));
  const check = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  console.log('CHECK_COUNT', check.rowCount);
  await pool.end();
})().catch((err) => {
  console.error('ERR', err.message);
  console.error(err.stack);
  process.exit(1);
});
