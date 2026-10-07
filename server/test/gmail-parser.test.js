const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyApplicationEmail,
  extractInterviewDateTime,
  getInterviewDetailsToFill,
} = require('../gmail-parser');

test('classifies supported application status email language', () => {
  const cases = [
    ['Application received', 'Thank you for applying for the role.', 'Applied'],
    ['Online assessment invitation', 'Please complete the coding challenge.', 'Assessment'],
    ['You have been shortlisted', 'Your application was shortlisted.', 'Shortlisted'],
    ['Interview invitation', 'We would like to interview you.', 'Interview'],
    ['Offer of employment', 'We are pleased to offer you the position.', 'Offer'],
    ['Application update', 'We regret to inform you that you were not selected.', 'Rejected'],
  ];

  for (const [subject, text, expectedStatus] of cases) {
    assert.equal(classifyApplicationEmail({ subject, text }).status, expectedStatus);
  }
});

test('does not classify unrelated email content', () => {
  assert.equal(
    classifyApplicationEmail({ subject: 'Monthly newsletter', text: 'Here are this month updates.' }).status,
    null
  );
});

test('extracts a clearly associated date and time in supported formats', () => {
  const examples = [
    ['Your interview is scheduled for 15 October 2026 at 10:00.', '2026-10-15', '10:00'],
    ['Your interview is scheduled for October 15, 2026 at 10:00.', '2026-10-15', '10:00'],
    ['Interview: 15/10/2026 at 10:00.', '2026-10-15', '10:00'],
    ['Interview: 2026-10-15 at 10:00.', '2026-10-15', '10:00'],
    ['Your interview is scheduled for 15 October 2026, 10:00.', '2026-10-15', '10:00'],
    ['Your interview is scheduled for 15 October 2026 from 10:00.', '2026-10-15', '10:00'],
    ['Your interview is scheduled for 15 October 2026 @ 10:00.', '2026-10-15', '10:00'],
  ];

  for (const [text, expectedDate, expectedTime] of examples) {
    assert.deepEqual(
      extractInterviewDateTime({ text }),
      {
        interviewDate: expectedDate,
        interviewTime: expectedTime,
        ambiguous: false,
        hasUnsupportedTimezone: false,
      }
    );
  }
});

test('saves an unambiguous date without inventing a time', () => {
  assert.equal(
    extractInterviewDateTime({ text: 'Your interview is scheduled for 15 October 2026.' }).interviewDate,
    '2026-10-15'
  );
  assert.equal(
    extractInterviewDateTime({ text: 'Your interview is scheduled for 15 October 2026.' }).interviewTime,
    null
  );
});

test('does not invent a date or save an unanchored time', () => {
  const result = extractInterviewDateTime({ text: 'Your interview is scheduled at 10:00 SAST.' });
  assert.equal(result.interviewDate, null);
  assert.equal(result.interviewTime, null);
});

test('supports 12-hour AM/PM values and normalizes to 24-hour time', () => {
  assert.equal(
    extractInterviewDateTime({ text: 'Interview: 15 October 2026 at 10:30 PM.' }).interviewTime,
    '22:30'
  );
  assert.equal(
    extractInterviewDateTime({ text: 'Interview: 15 October 2026 at 10 AM.' }).interviewTime,
    '10:00'
  );
  assert.equal(
    extractInterviewDateTime({ text: 'Interview: 15 October 2026 at 12:00 AM.' }).interviewTime,
    '00:00'
  );
});

test('uses SAST by default and honors supported explicit timezones', () => {
  assert.equal(
    extractInterviewDateTime({ text: 'Interview: 15 October 2026 at 10:00.' }).interviewTime,
    '10:00'
  );
  assert.equal(
    extractInterviewDateTime({ text: 'Interview: 15 October 2026 at 10:00 SAST.' }).interviewTime,
    '10:00'
  );
  assert.equal(
    extractInterviewDateTime({ text: 'Interview: 15 October 2026 at 10:00 UTC.' }).interviewTime,
    '12:00'
  );
});

test('rejects ambiguous numeric dates and unsupported explicit timezones', () => {
  assert.equal(
    extractInterviewDateTime({ text: 'Interview: 10/11/2026 at 10:00.' }).interviewDate,
    null
  );
  assert.equal(
    extractInterviewDateTime({ text: 'Interview: 15 October 2026 at 10:00 IST.' }).interviewTime,
    null
  );
});

test('ignores unrelated dates and date ranges not precisely scheduled for an interview', () => {
  const closingDate = extractInterviewDateTime({
    text: 'Applications close on 20 October 2026. Interviews will be scheduled later.',
  });
  const weekRange = extractInterviewDateTime({
    text: 'We received your application. Interviews will take place during the week of 15 October.',
  });
  const receivedDate = extractInterviewDateTime({
    text: 'We received your application on 15 October 2026. An interview may be scheduled later.',
  });

  assert.equal(closingDate.interviewDate, null);
  assert.equal(weekRange.interviewDate, null);
  assert.equal(receivedDate.interviewDate, null);
});

test('keeps interview status classification when the invitation has no schedule', () => {
  const email = {
    subject: 'Interview invitation',
    text: 'Test Company would like to invite you to an interview. We will arrange a time later.',
  };
  assert.equal(classifyApplicationEmail(email).status, 'Interview');
  assert.deepEqual(extractInterviewDateTime(email), {
    interviewDate: null,
    interviewTime: null,
    ambiguous: false,
  });
});

test('does not replace existing interview date or time with extracted values', () => {
  assert.deepEqual(
    getInterviewDetailsToFill(
      { interview_date: '2026-10-15', interview_time: '10:00:00' },
      { interviewDate: '2026-10-16', interviewTime: '11:00' }
    ),
    { interviewDate: null, interviewTime: null }
  );
  assert.deepEqual(
    getInterviewDetailsToFill(
      { interview_date: '2026-10-15', interview_time: null },
      { interviewDate: '2026-10-16', interviewTime: '11:00' }
    ),
    { interviewDate: null, interviewTime: '11:00' }
  );
});