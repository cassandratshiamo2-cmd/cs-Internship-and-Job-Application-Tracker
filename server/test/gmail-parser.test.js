const test = require('node:test');
const assert = require('node:assert/strict');
const { simpleParser } = require('mailparser');
const {
  classifyApplicationEmail,
  extractInterviewDateTime,
  extractInterviewType,
  getInterviewDetailsToFill,
  getInterviewDetailsToUpdate,
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

test('scenario 8: generic Pnet job recommendations are ignored, not review actions', () => {
  const email = {
    from: 'alerts@pnet.co.za',
    subject: 'Pnet Job Alert: Interview opportunities',
    text: 'We regret to inform you about a recommended role. 6 other companies are looking for candidates like you.',
  };

  const classification = classifyApplicationEmail(email);
  assert.equal(classification.status, null);
  assert.equal(classification.ignored, true);
});

test('scenario 9: LinkedIn job alerts are ignored, not review actions', () => {
  const email = {
    from: 'jobs-noreply@linkedin.com',
    subject: 'LinkedIn Job Alerts',
    text: 'You have been shortlisted for these recommended roles.',
  };

  const classification = classifyApplicationEmail(email);
  assert.equal(classification.status, null);
  assert.equal(classification.ignored, true);
});

test('ignores newsletters and generic multi-company job recommendations', () => {
  for (const email of [
    { subject: 'Weekly careers newsletter', text: 'Interview invitation stories and job openings.' },
    { subject: 'Werkie and 6 other companies are looking for candidates like you', text: 'Your profile matches these roles.' },
  ]) {
    assert.equal(classifyApplicationEmail(email).status, null);
    assert.equal(classifyApplicationEmail(email).ignored, true);
  }
});

test('does not suppress a transactional interview email from a job platform', () => {
  const email = {
    from: 'recruiter@linkedin.com',
    subject: 'Interview invitation for your Shoprite application',
    text: 'Shoprite invites you to an interview for the Cashier position.',
  };

  assert.equal(classifyApplicationEmail(email).status, 'Interview');
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
    assert.deepEqual(extractInterviewDateTime({ text }), {
      interviewDate: expectedDate,
      interviewTime: expectedTime,
      ambiguous: false,
      hasUnsupportedTimezone: false,
    });
  }
});

test('extracts the date and time from the Shoprite interview invitation wording', () => {
  const email = {
    subject: 'INTERVIEW INVITATION',
    text: 'YOU ARE INVITED TO AN INTERVIEW ON THE 09 OCTOBER 2026 AT 08:30',
  };

  assert.deepEqual(extractInterviewDateTime(email), {
    interviewDate: '2026-10-09',
    interviewTime: '08:30',
    ambiguous: false,
    hasUnsupportedTimezone: false,
  });
});

test('extracts interview time when MIME line breaks separate the date and time phrase', () => {
  const variants = [
    'YOU ARE INVITED TO AN INTERVIEW ON THE 09 OCTOBER 2026\nAT 08:30',
    'YOU ARE INVITED TO AN INTERVIEW ON THE 09 OCTOBER 2026 AT\n08:30',
  ];

  for (const text of variants) {
    assert.equal(extractInterviewDateTime({ text }).interviewDate, '2026-10-09');
    assert.equal(extractInterviewDateTime({ text }).interviewTime, '08:30');
  }
});

test('does not treat a closing signature after a wrapped time as a timezone', () => {
  const extracted = extractInterviewDateTime({
    text: 'YOU ARE INVITED TO AN INTERVIEW ON THE 09 OCTOBER 2026 AT 08:30\n\nKind regards\n\nShoprite',
  });

  assert.equal(extracted.interviewDate, '2026-10-09');
  assert.equal(extracted.interviewTime, '08:30');
});

test('extracts interview time from hard-wrapped plain-text MIME', async () => {
  const rawEmail = [
    'From: recruiter@example.test',
    'To: candidate@example.test',
    'Subject: INTERVIEW INVITATION',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'YOU ARE INVITED TO AN INTERVIEW ON THE 09 OCTOBER 2026',
    'AT 08:30',
  ].join('\r\n');
  const parsed = await simpleParser(Buffer.from(rawEmail));
  const extracted = extractInterviewDateTime({ subject: parsed.subject, text: parsed.text });

  assert.equal(extracted.interviewDate, '2026-10-09');
  assert.equal(extracted.interviewTime, '08:30');
});

test('extracts interview time from HTML paragraph and break MIME formatting', async () => {
  const bodies = [
    '<p>YOU ARE INVITED TO AN INTERVIEW ON THE 09 OCTOBER 2026</p><p>AT 08:30</p>',
    'YOU ARE INVITED TO AN INTERVIEW ON THE 09 OCTOBER 2026<br>AT 08:30',
  ];

  for (const body of bodies) {
    const rawEmail = [
      'From: recruiter@example.test',
      'To: candidate@example.test',
      'Subject: INTERVIEW INVITATION',
      'Content-Type: text/html; charset=utf-8',
      '',
      body,
    ].join('\r\n');
    const parsed = await simpleParser(Buffer.from(rawEmail));
    const extracted = extractInterviewDateTime({ subject: parsed.subject, text: parsed.text });

    assert.equal(extracted.interviewDate, '2026-10-09');
    assert.equal(extracted.interviewTime, '08:30');
  }
});

test('does not capture a time from an unrelated later sentence', () => {
  const extracted = extractInterviewDateTime({
    text: 'The interview is scheduled for 09 October 2026. The office opens at 08:30.',
  });

  assert.equal(extracted.interviewDate, '2026-10-09');
  assert.equal(extracted.interviewTime, null);
});

test('saves an unambiguous date without inventing a time', () => {
  const result = extractInterviewDateTime({ text: 'Your interview is scheduled for 15 October 2026.' });
  assert.equal(result.interviewDate, '2026-10-15');
  assert.equal(result.interviewTime, null);
});

test('does not invent a date or save an unanchored time', () => {
  const result = extractInterviewDateTime({ text: 'Your interview is scheduled at 10:00 SAST.' });
  assert.equal(result.interviewDate, null);
  assert.equal(result.interviewTime, null);
});

test('supports 12-hour AM/PM values and normalizes to 24-hour time', () => {
  assert.equal(extractInterviewDateTime({ text: 'Interview: 15 October 2026 at 10:30 PM.' }).interviewTime, '22:30');
  assert.equal(extractInterviewDateTime({ text: 'Interview: 15 October 2026 at 10 AM.' }).interviewTime, '10:00');
  assert.equal(extractInterviewDateTime({ text: 'Interview: 15 October 2026 at 12:00 AM.' }).interviewTime, '00:00');
});

test('uses SAST by default and honors supported explicit timezones', () => {
  assert.equal(extractInterviewDateTime({ text: 'Interview: 15 October 2026 at 10:00.' }).interviewTime, '10:00');
  assert.equal(extractInterviewDateTime({ text: 'Interview: 15 October 2026 at 10:00 SAST.' }).interviewTime, '10:00');
  assert.equal(extractInterviewDateTime({ text: 'Interview: 15 October 2026 at 10:00 UTC.' }).interviewTime, '12:00');
});

test('rejects ambiguous numeric dates and unsupported explicit timezones', () => {
  assert.equal(extractInterviewDateTime({ text: 'Interview: 10/11/2026 at 10:00.' }).interviewDate, null);
  assert.equal(extractInterviewDateTime({ text: 'Interview: 15 October 2026 at 10:00 IST.' }).interviewTime, null);
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

test('extracts only explicitly stated supported interview types', () => {
  const examples = [
    ['We would like to invite you to a phone interview.', 'Phone'],
    ['Your video interview is scheduled for tomorrow.', 'Video'],
    ['Interview Type: Video', 'Video'],
    ['The in-person interview will take place at our office.', 'In-person'],
    ['You are invited to a technical interview.', 'Technical'],
    ['The panel interview will include three managers.', 'Panel'],
    ['We would like to interview you.', null],
  ];

  for (const [text, expectedType] of examples) {
    assert.equal(extractInterviewType({ text }), expectedType);
  }
});

test('does not replace existing interview details with extracted values', () => {
  assert.deepEqual(
    getInterviewDetailsToFill(
      { interview_date: '2026-10-15', interview_time: '10:00:00', interview_type: 'Panel' },
      { interviewDate: '2026-10-16', interviewTime: '11:00', interviewType: 'Video' }
    ),
    { interviewDate: null, interviewTime: null, interviewType: null }
  );
  assert.deepEqual(
    getInterviewDetailsToFill(
      { interview_date: '2026-10-15', interview_time: null, interview_type: null },
      { interviewDate: '2026-10-16', interviewTime: '11:00', interviewType: 'Video' }
    ),
    { interviewDate: null, interviewTime: '11:00', interviewType: 'Video' }
  );
});

test('identifies changed interview details without inventing or replacing absent values', () => {
  assert.deepEqual(
    getInterviewDetailsToUpdate(
      { interview_date: '2026-10-09', interview_time: '07:30:00', interview_type: 'Panel' },
      { interviewDate: '2026-10-09', interviewTime: '08:30', interviewType: null }
    ),
    { interviewDate: null, interviewTime: '08:30', interviewType: null }
  );
  assert.deepEqual(
    getInterviewDetailsToUpdate(
      { interview_date: '2026-10-09', interview_time: '08:30:00', interview_type: 'Panel' },
      { interviewDate: '2026-10-09', interviewTime: '08:30', interviewType: 'Video' }
    ),
    { interviewDate: null, interviewTime: null, interviewType: 'Video' }
  );
});