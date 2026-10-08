const test = require('node:test');
const assert = require('node:assert/strict');
const { canAdvanceStatus, getEmailUpdateDecision, matchApplication } = require('../gmail-matcher');
const {
  classifyApplicationEmail,
  extractInterviewDateTime,
  extractInterviewType,
  getInterviewDetailsToFill,
} = require('../gmail-parser');

const applications = [
  { id: '11', company: 'Acme Technology', position: 'Junior Software Engineer', status: 'Applied' },
  { id: '12', company: 'Acme Technology', position: 'Data Analyst Intern', status: 'Applied' },
];

test('matches a unique employer and role confidently', () => {
  const result = matchApplication({
    from: 'recruiting@acme.com',
    subject: 'Interview invitation: Junior Software Engineer',
    text: 'Acme Technology would like to interview you for Junior Software Engineer.',
  }, applications);

  assert.equal(result.outcome, 'matched');
  assert.equal(result.application.id, '11');
});

test('queues an email when multiple applications at the same company are plausible', () => {
  const result = matchApplication({
    from: 'recruiting@acme.com',
    subject: 'Application update',
    text: 'Acme Technology has an update about your application.',
  }, applications);

  assert.equal(result.outcome, 'review');
  assert.equal(result.application, null);
});

test('does not match a different role just because the employer is the same', () => {
  const result = matchApplication({
    from: 'recruiting@acme.com',
    subject: 'Interview invitation: Senior Accountant',
    text: 'Acme Technology invites you to interview for Senior Accountant.',
  }, applications);

  assert.equal(result.outcome, 'review');
  assert.equal(result.confidence, 0);
});

test('only permits forward status transitions', () => {
  assert.equal(canAdvanceStatus('Applied', 'Interview'), true);
  assert.equal(canAdvanceStatus('Interview', 'Assessment'), false);
  assert.equal(canAdvanceStatus('Offer', 'Rejected'), false);
  assert.equal(canAdvanceStatus('Withdrawn', 'Applied'), false);
});

test('fills a missing schedule on an existing Interview application without changing its status', () => {
  const email = {
    subject: 'Interview Invitation- Test Company',
    text: 'Test Company would like to invite you for an interview for the Software Developer position. Your interview is scheduled for 15 October 2026 at 10:00 SAST.',
  };
  const application = {
    id: '13',
    company: 'Test Company',
    position: 'Software Developer',
    status: 'Interview',
    updated_at: new Date('2026-10-07T11:00:00Z'),
    interview_date: null,
    interview_time: null,
  };
  const classification = classifyApplicationEmail(email);
  const match = matchApplication(email, [application]);
  const extracted = extractInterviewDateTime(email);
  const fieldsToFill = getInterviewDetailsToFill(application, extracted);
  const decision = getEmailUpdateDecision({
    currentStatus: application.status,
    nextStatus: classification.status,
    updatedAt: application.updated_at,
    receivedAt: new Date('2026-10-07T10:00:00Z'),
    interviewDetailsToFill: fieldsToFill,
  });

  assert.equal(classification.status, 'Interview');
  assert.equal(match.outcome, 'matched');
  assert.equal(match.application.id, application.id);
  assert.deepEqual(fieldsToFill, { interviewDate: '2026-10-15', interviewTime: '10:00', interviewType: null });
  assert.deepEqual(decision, { allowed: true, preserveStatus: true });
  assert.equal(application.status, 'Interview');
});

test('does not relax stale-email or status transition safety for other statuses', () => {
  const staleAppliedUpdate = getEmailUpdateDecision({
    currentStatus: 'Applied',
    nextStatus: 'Interview',
    updatedAt: new Date('2026-10-07T11:00:00Z'),
    receivedAt: new Date('2026-10-07T10:00:00Z'),
    interviewDetailsToFill: { interviewDate: '2026-10-15', interviewTime: '10:00' },
  });
  const interviewWithoutDetails = getEmailUpdateDecision({
    currentStatus: 'Interview',
    nextStatus: 'Interview',
    updatedAt: new Date('2026-10-07T09:00:00Z'),
    receivedAt: new Date('2026-10-07T10:00:00Z'),
    interviewDetailsToFill: { interviewDate: null, interviewTime: null },
  });

  assert.deepEqual(staleAppliedUpdate, { allowed: false, preserveStatus: false });
  assert.deepEqual(interviewWithoutDetails, { allowed: false, preserveStatus: false });
});

test('prefers an exact longer company name over a shorter nested application name', () => {
  const email = {
    subject: 'Application Update - Rejected Test Company',
    text: '',
    from: '',
  };
  const applications = [
    { id: '21', company: 'Test Company', position: 'Software Developer', status: 'Applied' },
    { id: '22', company: 'Rejected Test Company', position: 'Software Developer', status: 'Applied' },
  ];
  const classification = classifyApplicationEmail(email);
  const match = matchApplication(email, applications);
  const decision = getEmailUpdateDecision({
    currentStatus: match.application.status,
    nextStatus: classification.status,
    updatedAt: new Date('2026-10-06T09:00:00Z'),
    receivedAt: new Date('2026-10-07T09:00:00Z'),
  });

  assert.equal(classification.status, 'Rejected');
  assert.equal(match.outcome, 'matched');
  assert.equal(match.application.id, '22');
  assert.ok(match.confidence >= 0.75);
  assert.deepEqual(match.candidateIds, ['22']);
  assert.equal(decision.allowed, true);
});

test('subject exact company match beats unrelated exact company phrases in the email body', () => {
  const email = {
    subject: 'Rejected Test Company - Application Outcome',
    text: 'We regret to inform you about the outcome of your application. The position is no longer available. Valterra Platinum.',
    from: '"Tshiamo Malefo" <tshiamomalefo0@gmail.com>',
  };
  const applications = [
    { id: '21', company: 'Test Company', position: 'Software Developer', status: 'Interview' },
    { id: '22', company: 'Valterra Platinum', position: 'Developer', status: 'Applied' },
    { id: '23', company: 'Rejected Test Company', position: 'Software Developer', status: 'Applied' },
  ];
  const classification = classifyApplicationEmail(email);
  const match = matchApplication(email, applications);
  const decision = getEmailUpdateDecision({
    currentStatus: match.application.status,
    nextStatus: classification.status,
    updatedAt: new Date('2026-10-06T09:00:00Z'),
    receivedAt: new Date('2026-10-07T09:00:00Z'),
  });

  assert.equal(classification.status, 'Rejected');
  assert.equal(match.outcome, 'matched');
  assert.equal(match.application.id, '23');
  assert.equal(match.confidence, 0.8);
  assert.equal(decision.allowed, true);
});

test('keeps a shorter company as a candidate when it is separately mentioned', () => {
  const result = matchApplication({
    subject: 'Rejected Test Company - Application Outcome',
    text: 'Test Company is also mentioned separately in this message.',
    from: '',
  }, [
    { id: '21', company: 'Test Company', position: 'Software Developer' },
    { id: '23', company: 'Rejected Test Company', position: 'Software Developer' },
  ]);

  assert.equal(result.outcome, 'review');
  assert.deepEqual(result.candidateIds, ['23', '21']);
});

test('keeps emails that explicitly name multiple applications in review', () => {
  const result = matchApplication({
    subject: 'Application update for Acme Technology and Beta Systems',
    text: 'Both companies have sent an application update.',
    from: '',
  }, [
    { id: '31', company: 'Acme Technology', position: 'Data Analyst' },
    { id: '32', company: 'Beta Systems', position: 'Software Engineer' },
  ]);

  assert.equal(result.outcome, 'review');
  assert.equal(result.application, null);
  assert.deepEqual(result.candidateIds, ['31', '32']);
});

test('keeps generic Pnet multi-company alerts in review despite an exact listed company', () => {
  const result = matchApplication({
    subject: 'Werkie and 6 other companies are looking for candidates like you',
    text: 'We have shortlisted some roles for you.',
    from: 'alerts@example.com',
  }, [
    { id: '41', company: 'Werkie', position: 'Software Developer' },
  ]);

  assert.equal(result.outcome, 'review');
  assert.equal(result.application, null);
});

test('does not auto-match a status keyword when no company can be identified', () => {
  const email = {
    subject: 'Application update',
    text: 'We regret to inform you that your application was unsuccessful.',
    from: '',
  };
  const classification = classifyApplicationEmail(email);
  const match = matchApplication(email, [
    { id: '51', company: 'Northwind Labs', position: 'Engineer' },
  ]);

  assert.equal(classification.status, 'Rejected');
  assert.equal(match.outcome, 'review');
  assert.equal(match.application, null);
});

test('exact company matching does not bypass terminal status transition protection', () => {
  const email = {
    subject: 'Application Update - Rejected Test Company',
    text: 'Your application status has changed.',
    from: '',
  };
  const application = {
    id: '61',
    company: 'Rejected Test Company',
    position: 'Software Developer',
    status: 'Offer',
  };
  const classification = classifyApplicationEmail(email);
  const match = matchApplication(email, [application]);
  const decision = getEmailUpdateDecision({
    currentStatus: application.status,
    nextStatus: classification.status,
    updatedAt: new Date('2026-10-06T09:00:00Z'),
    receivedAt: new Date('2026-10-07T09:00:00Z'),
  });

  assert.equal(match.outcome, 'matched');
  assert.equal(match.application.id, application.id);
  assert.equal(classification.status, 'Rejected');
  assert.equal(decision.allowed, false);
});

test('matches the Shoprite interview invitation and fills status, date, and time', () => {
  const email = {
    from: 'careers@shoprite.co.za',
    subject: 'INTERVIEW INVITATION',
    text: 'YOU ARE INVITED TO AN INTERVIEW ON THE 09 OCTOBER 2026 AT 08:30',
  };
  const application = {
    id: '42',
    company: 'Shoprite',
    position: 'Graduate',
    status: 'Applied',
    updated_at: new Date('2026-10-07T08:00:00Z'),
    interview_date: null,
    interview_time: null,
    interview_type: null,
  };
  const classification = classifyApplicationEmail(email);
  const match = matchApplication(email, [application]);
  const interviewDetails = {
    ...extractInterviewDateTime(email),
    interviewType: extractInterviewType(email),
  };
  const detailsToFill = getInterviewDetailsToFill(application, interviewDetails);
  const decision = getEmailUpdateDecision({
    currentStatus: application.status,
    nextStatus: classification.status,
    updatedAt: application.updated_at,
    receivedAt: new Date('2026-10-08T08:00:00Z'),
    interviewDetailsToFill: detailsToFill,
  });

  assert.equal(match.outcome, 'matched');
  assert.equal(match.application.id, '42');
  assert.equal(decision.allowed, true);
  assert.equal(classification.status, 'Interview');
  assert.deepEqual(detailsToFill, {
    interviewDate: '2026-10-09',
    interviewTime: '08:30',
    interviewType: null,
  });
  Object.assign(application, {
    status: classification.status,
    interview_date: detailsToFill.interviewDate,
    interview_time: detailsToFill.interviewTime,
    interview_type: detailsToFill.interviewType,
  });
  assert.deepEqual(
    [application.status, application.interview_date, application.interview_time],
    ['Interview', '2026-10-09', '08:30']
  );
});