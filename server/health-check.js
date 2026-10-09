async function checkDatabaseHealth(pool, databaseConfigured) {
  if (!databaseConfigured) {
    return {
      httpStatus: 503,
      body: { status: 'DOWN', database: 'not_configured' },
    };
  }

  try {
    await pool.query('SELECT 1');
    return {
      httpStatus: 200,
      body: { status: 'UP', database: 'connected' },
    };
  } catch {
    return {
      httpStatus: 503,
      body: { status: 'DOWN', database: 'disconnected' },
    };
  }
}

module.exports = { checkDatabaseHealth };
