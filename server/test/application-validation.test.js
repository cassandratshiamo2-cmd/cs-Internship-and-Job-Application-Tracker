const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidDateOnly, isValidTime, validateApplicationInput } = require('../application-validation');
const { checkDatabaseHealth } = require('../health-check');

const validApplication = {
  company: 'Example Ltd',
  position: 'Graduate Engineer',
  date: '2026-10-09',
  type: 'Graduate Job',
  status: 'Applied',
  arrangement: 'Hybrid',
  notes: 'Applied through company website',
  applicationLink: '',
  interviewDate: '',
  interviewTime: '',
  interviewType: '',
  interviewEmail: '',
};

test('application payload validation accepts supported values and the legacy Job type', () => {
  assert.equal(validateApplicationInput(validApplication), null);
  assert.equal(validateApplicationInput({ ...validApplication, type: 'Job' }), null);
  assert.equal(validateApplicationInput({
    ...validApplication,
    status: 'Interview',
    interviewDate: '2026-10-09',
    interviewTime: '10:00',
    interviewType: 'In-person',
    interviewLocation: '',
  }), null);
});

test('application payload validation rejects invalid enums, dates, links, and interview fields', () => {
  assert.match(validateApplicationInput({ ...validApplication, status: 'Hired' }), /status/i);
  assert.match(validateApplicationInput({ ...validApplication, type: 'Other' }), /type/i);
  assert.match(validateApplicationInput({ ...validApplication, arrangement: 'Flexible' }), /arrangement/i);
  assert.match(validateApplicationInput({ ...validApplication, date: '2026-02-30' }), /date/i);
  assert.match(validateApplicationInput({ ...validApplication, applicationLink: 'javascript:alert(1)' }), /http/i);
  assert.match(validateApplicationInput({
    ...validApplication,
    status: 'Interview',
    interviewDate: '2026-10-09',
    interviewTime: '25:90',
    interviewType: 'Video',
  }), /date and time/i);
});

test('date and time validation is strict and date-only safe', () => {
  assert.equal(isValidDateOnly('2024-02-29'), true);
  assert.equal(isValidDateOnly('2025-02-29'), false);
  assert.equal(isValidDateOnly('2026-10-09T00:00:00Z'), false);
  assert.equal(isValidTime('23:59'), true);
  assert.equal(isValidTime('09:30:00'), true);
  assert.equal(isValidTime('24:00'), false);
});

test('database health reports unavailable and unconfigured databases as unhealthy', async () => {
  const healthy = await checkDatabaseHealth({ async query() { return { rows: [{ '?column?': 1 }] }; } }, true);
  const failed = await checkDatabaseHealth({ async query() { throw new Error('database offline'); } }, true);
  const missing = await checkDatabaseHealth({ async query() { assert.fail('Must not query when unconfigured'); } }, false);

  assert.equal(healthy.httpStatus, 200);
  assert.equal(healthy.body.status, 'UP');
  assert.equal(failed.httpStatus, 503);
  assert.equal(failed.body.status, 'DOWN');
  assert.equal(missing.httpStatus, 503);
  assert.equal(missing.body.database, 'not_configured');
});
