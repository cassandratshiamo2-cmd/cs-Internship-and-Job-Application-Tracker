const test = require('node:test');
const assert = require('node:assert/strict');
const { simpleParser } = require('mailparser');
const {
  classifyApplicationEmail,
  extractInterviewDetails,
  extractInterviewDateTime,
  extractInterviewLocation,
  extractInterviewMeetingUrl,
  extractInterviewType,
  getInterviewDetailsToFill,
  getInterviewDetailsToUpdate,
} = require('../gmail-parser');

test('classifies supported application status email language', () => {
  const cases = [
    ['Application received', 'Thank you for applying for the role.', 'Applied'],
    ['Online assessment invitation', 'Please complete the coding challenge.', 'Assessment'],
    ['Nova application', 'Dear Cassandra\nYou are invited for an assesment\nKind regard\nNova recruitment team', 'Assessment'],
    ['Nova application', 'You are invited for an assessment.', 'Assessment'],
    ['Nova application', 'Please complete an assessment for the role.', 'Assessment'],
    ['You have been shortlisted', 'Your application was shortlisted.', 'Shortlisted'],
    ['Interview invitation', 'We would like to interview you.', 'Interview'],
    ['Interview update', 'Your interview has been rescheduled for October 14, 2026 at 9:00 AM.', 'Interview'],
    ['Interview invitation', 'You have been shortlisted for an interview. Please confirm your availability.', 'Interview'],
    ['Offer of employment', 'We are pleased to offer you the position.', 'Offer'],
    ['Job offer', 'Dear candidate, you are offered a position at Microsoft. Kind regards, Microsoft recruitment team', 'Offer'],
    ['Position selected', 'You have been selected for the position of Analyst.', 'Offer'],
    ['Application update', 'We regret to inform you that you were not selected.', 'Rejected'],
    ['Application saved', 'Your application has been saved.', 'Saved'],
    ['Application withdrawal confirmed', 'Your application has been withdrawn.', 'Withdrawn'],
  ];

  for (const [subject, text, expectedStatus] of cases) {
    assert.equal(classifyApplicationEmail({ subject, text }).status, expectedStatus);
  }
});

test('does not classify an isolated assessment mention as an application outcome', () => {
  assert.equal(classifyApplicationEmail({
    subject: 'Monthly newsletter',
    text: 'Our assessment of the job market will be in next month newsletter.',
  }).status, null);
});

test('status wording in a subject alone is not enough to classify a message', () => {
  const cases = [
    ['Interview invitation', 'Here is our quarterly careers newsletter.'],
    ['Offer of employment', 'Please see the company news update below.'],
    ['Job offer', 'We are excited to announce company news.'],
    ['Application received', 'This is a general account notification.'],
    ['You have been shortlisted', 'We are sharing this months opportunities.'],
    ['Application rejected', 'Please review the attached company update.'],
    ['Application withdrawn', 'This is an automated mailbox notification.'],
    ['Assessment invitation', 'Our assessment of industry trends is attached.'],
    ['Application saved', 'This email confirms your preference settings.'],
  ];

  for (const [subject, text] of cases) {
    assert.equal(classifyApplicationEmail({ subject, text }).status, null, subject);
  }
});

test('assessment invitation subject disambiguates a generic application confirmation', () => {
  const classification = classifyApplicationEmail({
    subject: 'Assessment Invitation – Test Company Alpha',
    text: 'Dear applicant, we have received your application for the Software Developer Intern position. Please keep this confirmation for your records.',
  });

  assert.equal(classification.status, 'Assessment');
});

test('assessment invitation subject with unrelated body content is not enough to classify a message', () => {
  const classification = classifyApplicationEmail({
    subject: 'Assessment Invitation – Test Company Alpha',
    text: 'Our assessment of industry trends is attached to this monthly newsletter.',
  });

  assert.equal(classification.status, null);
});

test('interview invitation subject contributes when the body has no interview wording', () => {
  const classification = classifyApplicationEmail({
    subject: 'Interview Invitation – Test Company Alpha',
    text: 'Dear applicant, please review the schedule details below.',
  });

  assert.equal(classification.status, 'Interview');
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

test('ignores generic promotions and recommendations even when they contain status words', () => {
  const emails = [
    {
      subject: 'Weekly job offers',
      text: 'Browse our latest job offers, with interview and assessment tips for job seekers.',
    },
    {
      subject: 'Recommended roles for you',
      text: 'These jobs match your profile. You have been shortlisted for these roles.',
    },
    {
      subject: 'Featured job opportunities',
      text: 'Explore our featured jobs. Read about interview invitations, assessments, and employment offers.',
    },
  ];

  for (const email of emails) {
    const result = classifyApplicationEmail(email);
    assert.equal(result.status, null, email.subject);
    assert.equal(result.ignored, true, email.subject);
  }
});

test('ignores unrelated account notifications without interpreting recruitment-like terms', () => {
  const email = {
    subject: 'Security alert: new sign-in',
    text: 'We detected a new sign-in. Review your account security assessment and offer settings.',
  };
  const result = classifyApplicationEmail(email);

  assert.equal(result.status, null);
  assert.equal(result.ignored, true);
  assert.equal(classifyApplicationEmail(email, { allowGenericJobAlert: true }).ignored, true);
});

test('does not classify unrelated mentions of offer, interview, or assessment', () => {
  const emails = [
    { subject: 'Company update', text: 'Our offer includes an interview guide and assessment of market trends.' },
    { subject: 'Account notice', text: 'The interview feature and assessment settings are available in your account.' },
    { subject: 'Benefits', text: 'This offer describes our employee benefits and training assessment process.' },
  ];

  for (const email of emails) {
    const result = classifyApplicationEmail(email);
    assert.equal(result.status, null, email.subject);
  }
});

test('keeps a personalized application confirmation even if the subject recommends jobs', () => {
  const email = {
    subject: 'Recommended jobs',
    text: 'Your application for the Cashier position at Shoprite has been received. Thank you for applying.',
  };
  const initialClassification = classifyApplicationEmail(email);
  const result = classifyApplicationEmail(email, { allowGenericJobAlert: true });

  assert.equal(initialClassification.ignored, true);
  assert.equal(result.status, 'Applied');
  assert.equal(result.ignored, undefined);
});

test('keeps genuine personalized recruitment updates despite promotional-looking context', () => {
  const cases = [
    ['Recommended roles', 'You are invited for an interview at Shoprite for the Cashier role after your application was reviewed.', 'Interview'],
    ['Featured jobs', 'Please complete the assessment for your Shoprite Cashier application.', 'Assessment'],
    ['Weekly job offers', 'We are pleased to offer you the Cashier position at Shoprite following your application.', 'Offer'],
    ['Career newsletter', 'We regret to inform you that your application for the Shoprite Cashier position was unsuccessful.', 'Rejected'],
  ];

  for (const [subject, text, expectedStatus] of cases) {
    const result = classifyApplicationEmail({ subject, text }, { allowGenericJobAlert: true });
    assert.equal(result.status, expectedStatus, subject);
    assert.equal(result.ignored, undefined, subject);
  }
});

test('retains personalized outcomes in job-alert contexts but ignores generic promotions', () => {
  const outcomes = [
    ['Thank you for applying for the Shoprite Cashier position.', 'Applied'],
    ['You are invited to an interview for the Shoprite Cashier position.', 'Interview'],
    ['Please complete the assessment for your Shoprite Cashier application.', 'Assessment'],
    ['We are pleased to offer you the Cashier position at Shoprite.', 'Offer'],
    ['We regret to inform you that your Shoprite Cashier application was unsuccessful.', 'Rejected'],
  ];

  for (const [text, expectedStatus] of outcomes) {
    const email = { subject: 'Weekly job offers', text };
    const normalClassification = classifyApplicationEmail(email);
    const alertOverrideClassification = classifyApplicationEmail(email, {
      allowGenericJobAlert: true,
    });

    assert.equal(normalClassification.ignored, true, expectedStatus);
    assert.equal(alertOverrideClassification.status, expectedStatus, expectedStatus);
    assert.equal(alertOverrideClassification.ignored, undefined, expectedStatus);
  }

  const genericPromotion = classifyApplicationEmail({
    subject: 'Weekly job offers',
    text: 'Browse our latest job offers and read interview and assessment tips for job seekers.',
  }, { allowGenericJobAlert: true });

  assert.equal(genericPromotion.status, null);
  assert.equal(genericPromotion.ignored, true);
});

test('generic Pnet newsletters remain ignored when promotional copy contains offer language', () => {
  const email = {
    from: 'alerts@pnet.co.za',
    subject: 'Pnet Job Alert: Shoprite Cashier opportunities',
    text: 'Your application profile matches Shoprite Cashier vacancies, and we are pleased to offer you access to these recommended roles and interview tips.',
  };
  const result = classifyApplicationEmail(email);
  const explicitAlertRetry = classifyApplicationEmail(email, { allowGenericJobAlert: true });

  assert.equal(result.status, null);
  assert.equal(result.ignored, true);
  assert.equal(explicitAlertRetry.status, null);
  assert.equal(explicitAlertRetry.ignored, true);
});

test('Pnet alerts preserve explicit offers of a matched job position', () => {
  const result = classifyApplicationEmail({
    from: 'alerts@pnet.co.za',
    subject: 'Pnet Job Alert - update on your application',
    text: 'Shoprite Cashier: We are pleased to offer you the Cashier position following your application.',
  }, { allowGenericJobAlert: true });

  assert.equal(result.status, 'Offer');
  assert.equal(result.ignored, undefined);
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

test('extracts interview schedule from a natural invitation mentioning a company and position', () => {
  const email = {
    subject: 'Interview invitation',
    text: 'You are invited for an interview at Spar on 13 October 2026 at 08:30',
  };

  assert.equal(classifyApplicationEmail(email).status, 'Interview');
  assert.deepEqual(extractInterviewDateTime(email), {
    interviewDate: '2026-10-13',
    interviewTime: '08:30',
    ambiguous: false,
    hasUnsupportedTimezone: false,
  });
});

test('extracts date and time from a generic interview reschedule notice', () => {
  const email = {
    subject: 'Interview update',
    text: 'Your interview has been rescheduled for October 14, 2026 at 9:00 AM.',
  };

  assert.equal(classifyApplicationEmail(email).status, 'Interview');
  assert.deepEqual(extractInterviewDateTime(email), {
    interviewDate: '2026-10-14',
    interviewTime: '09:00',
    ambiguous: false,
    hasUnsupportedTimezone: false,
  });
});

test('supports invitation date and time wording variants without inventing details', () => {
  const examples = [
    ['You are invited to interview on October 13, 2026 at 8:30 AM.', '2026-10-13', '08:30'],
    ['You are invited to interview on October 13, 2026, at 8:30 AM.', '2026-10-13', '08:30'],
    ['Your interview is scheduled for 13 October 2026 at 08:30.', '2026-10-13', '08:30'],
    ['We would like to invite you for an interview on 2026-10-13 at 14:00.', '2026-10-13', '14:00'],
    ['Your interview will take place on 13 October 2026.', '2026-10-13', null],
  ];

  for (const [text, expectedDate, expectedTime] of examples) {
    const result = extractInterviewDateTime({ text });
    assert.equal(result.interviewDate, expectedDate, text);
    assert.equal(result.interviewTime, expectedTime, text);
  }

  assert.deepEqual(extractInterviewDateTime({
    text: 'We would like to interview you. The office opens at 08:30.',
  }).interviewDate, null);
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

  assert.equal(classifyApplicationEmail({ subject: parsed.subject, text: parsed.text }).status, 'Interview');
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

    assert.equal(classifyApplicationEmail({ subject: parsed.subject, text: parsed.text }).status, 'Interview');
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

test('rejects invalid interview times and converts UTC across midnight into SAST', () => {
  for (const time of ['25:00', '10:60']) {
    assert.deepEqual(
      extractInterviewDateTime({ text: `Interview: 15 October 2026 at ${time}.` }),
      {
        interviewDate: '2026-10-15',
        interviewTime: null,
        ambiguous: false,
        hasUnsupportedTimezone: false,
      },
    );
  }

  assert.deepEqual(
    extractInterviewDateTime({
      text: 'Interview: 15 October 2026 at 23:30 UTC.',
    }),
    {
      interviewDate: '2026-10-16',
      interviewTime: '01:30',
      ambiguous: false,
      hasUnsupportedTimezone: false,
    },
  );
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

test('extracts explicit interview location, street addresses, and one meeting URL', () => {
  assert.equal(
    extractInterviewLocation({ text: 'Interview location: Spar Sandton office, Johannesburg.' }),
    'Spar Sandton office, Johannesburg'
  );
  assert.equal(
    extractInterviewLocation({ text: 'Please attend at 123 Main Street, Johannesburg.' }),
    '123 Main Street, Johannesburg'
  );
  assert.equal(extractInterviewLocation({ text: 'You are invited to an interview at Spar on 13 October 2026.' }), null);
  assert.equal(
    extractInterviewMeetingUrl({ text: 'Join the video interview: https://meet.google.com/abc-defg-hij' }),
    'https://meet.google.com/abc-defg-hij'
  );
  assert.equal(
    extractInterviewMeetingUrl({ text: 'Please read our privacy policy at https://example.com/privacy.' }),
    null
  );
  assert.equal(
    extractInterviewMeetingUrl({ text: 'Join meeting: https://meet.example.test/one or https://meet.example.test/two' }),
    null
  );
});

test('extracts meeting URLs from HTML anchor targets without inventing an interview type', () => {
  const details = extractInterviewDetails({
    text: 'You are invited for an interview at Spar on 13 October 2026 at 08:30.',
    html: '<p>Join the interview</p><a href="https://meet.example.test/room?a=1&amp;b=2">Join meeting</a>',
  });

  assert.equal(details.interviewDate, '2026-10-13');
  assert.equal(details.interviewTime, '08:30');
  assert.equal(details.interviewType, null);
  assert.equal(details.interviewLocation, null);
  assert.equal(details.interviewMeetingUrl, 'https://meet.example.test/room?a=1&b=2');
});

test('does not replace existing interview details with extracted values', () => {
  assert.deepEqual(
    getInterviewDetailsToFill(
      { interview_date: '2026-10-15', interview_time: '10:00:00', interview_type: 'Panel' },
      { interviewDate: '2026-10-16', interviewTime: '11:00', interviewType: 'Video' }
    ),
    {
      interviewDate: null,
      interviewTime: null,
      interviewType: null,
      interviewLocation: null,
      interviewMeetingUrl: null,
    }
  );
  assert.deepEqual(
    getInterviewDetailsToFill(
      {
        interview_date: '2026-10-15',
        interview_time: null,
        interview_type: null,
        interview_location: 'Existing office',
        interview_meeting_url: 'https://meet.example.test/existing',
      },
      { interviewDate: '2026-10-16', interviewTime: '11:00', interviewType: 'Video' }
    ),
    {
      interviewDate: null,
      interviewTime: '11:00',
      interviewType: 'Video',
      interviewLocation: null,
      interviewMeetingUrl: null,
    }
  );
});

test('identifies changed interview details without inventing or replacing absent values', () => {
  assert.deepEqual(
    getInterviewDetailsToUpdate(
      { interview_date: '2026-10-09', interview_time: '07:30:00', interview_type: 'Panel' },
      { interviewDate: '2026-10-09', interviewTime: '08:30', interviewType: null }
    ),
    {
      interviewDate: null,
      interviewTime: '08:30',
      interviewType: null,
      interviewLocation: null,
      interviewMeetingUrl: null,
    }
  );
  assert.deepEqual(
    getInterviewDetailsToUpdate(
      { interview_date: '2026-10-09', interview_time: '08:30:00', interview_type: 'Panel' },
      { interviewDate: '2026-10-09', interviewTime: '08:30', interviewType: 'Video' }
    ),
    {
      interviewDate: null,
      interviewTime: null,
      interviewType: 'Video',
      interviewLocation: null,
      interviewMeetingUrl: null,
    }
  );
});

test('updates reliable rescheduled location and meeting link without clearing existing values when absent', () => {
  const current = {
    interview_date: '2026-10-13',
    interview_time: '08:30:00',
    interview_type: 'Video',
    interview_location: 'Existing office',
    interview_meeting_url: 'https://meet.example.test/old',
  };

  assert.deepEqual(
    getInterviewDetailsToUpdate(current, {
      interviewDate: '2026-10-14',
      interviewTime: '09:00',
      interviewType: null,
      interviewLocation: 'Updated office, Johannesburg',
      interviewMeetingUrl: 'https://meet.example.test/new',
    }),
    {
      interviewDate: '2026-10-14',
      interviewTime: '09:00',
      interviewType: null,
      interviewLocation: 'Updated office, Johannesburg',
      interviewMeetingUrl: 'https://meet.example.test/new',
    }
  );
});