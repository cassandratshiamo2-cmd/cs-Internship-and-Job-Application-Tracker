const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApplicationUpdateQuery } = require('../application-update-query');

const baseApplicationUpdate = {
  applicationId: 37,
  userId: 7,
  company: 'Spar',
  position: 'Cashier',
  date: '2026-10-01',
  type: 'Internship',
  status: 'Interview',
  arrangement: 'Onsite',
  notes: 'Bring identification',
  applicationLink: 'https://jobs.example.test/spar',
  interviewDate: '2026-10-13',
  interviewTime: '08:30',
  interviewType: 'In-person',
  notificationChannels: ['In-app'],
  interviewEmail: 'recruiter@example.test',
  hasInterviewLocation: true,
  interviewLocation: 'Spar Sandton',
  hasInterviewMeetingUrl: true,
  interviewMeetingUrl: 'https://meet.example.test/interview',
};

test('Interview application update binds schedule, optional details, and existing application fields', () => {
  const { text, values } = buildApplicationUpdateQuery(baseApplicationUpdate);

  assert.match(text, /status = \$7::varchar\(32\)/);
  assert.equal((text.match(/\$7::varchar\(32\)/g) || []).length, 3);
  assert.equal(values[0], 37);
  assert.equal(values[1], 7);
  assert.deepEqual(values.slice(2, 10), [
    'Spar',
    'Cashier',
    '2026-10-01',
    'Internship',
    'Interview',
    'Onsite',
    'Bring identification',
    'https://jobs.example.test/spar',
  ]);
  assert.deepEqual(values.slice(10, 15), [
    '2026-10-13',
    '08:30',
    'In-person',
    ['In-app'],
    'recruiter@example.test',
  ]);
  assert.deepEqual(values.slice(15), [
    true,
    'Spar Sandton',
    true,
    'https://meet.example.test/interview',
  ]);
  assert.match(text, /ELSE interview_location END/);
  assert.match(text, /ELSE interview_meeting_url END/);
  assert.match(text, /WHERE id = \$1 AND user_id = \$2/);
  assert.doesNotMatch(text, /SET[^]*?created_at\s*=/);
});

test('omitted location and meeting link preserve existing optional details', () => {
  const { text, values } = buildApplicationUpdateQuery({
    ...baseApplicationUpdate,
    hasInterviewLocation: false,
    interviewLocation: '',
    hasInterviewMeetingUrl: false,
    interviewMeetingUrl: '',
  });

  assert.deepEqual(values.slice(15), [false, '', false, '']);
  assert.match(text, /WHEN \$16::boolean THEN NULLIF\(\$17, ''\) ELSE interview_location END/);
  assert.match(text, /WHEN \$18::boolean THEN NULLIF\(\$19, ''\) ELSE interview_meeting_url END/);
});
