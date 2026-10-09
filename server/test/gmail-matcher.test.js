const test = require('node:test');
const assert = require('node:assert/strict');
const { canAdvanceStatus, decideApplicationEmailUpdate, matchApplication } = require('../gmail-matcher');
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

test('scenario 10: exact company and position match uniquely and confidently', () => {
  const result = matchApplication({
    from: 'recruiting@acme.com',
    subject: 'Interview invitation: Junior Software Engineer',
    text: 'Acme Technology would like to interview you for Junior Software Engineer.',
  }, applications);

  assert.equal(result.outcome, 'matched');
  assert.equal(result.application.id, '11');
});

test('matches punctuation variants and abbreviated position titles using exact tokens', () => {
  const result = matchApplication({
    from: 'careers@acme.com',
    subject: 'Interview invitation - ACME, Inc. - Sr. Software Engineer',
    text: 'Acme Inc. invites you to interview for the Sr Software Engineer position.',
  }, [
    { id: '16', company: 'Acme, Inc.', position: 'Senior Software Engineer', status: 'Applied' },
    { id: '17', company: 'Acme Inc', position: 'Junior Software Engineer', status: 'Applied' },
  ]);

  assert.equal(result.outcome, 'matched');
  assert.equal(result.application.id, '16');
});

test('matches company aliases with legal and holdings suffixes', () => {
  const result = matchApplication({
    subject: 'SHOPRITE interview invitation',
    text: 'Shoprite Holdings would like to interview you.',
    from: 'careers@shoprite.co.za',
  }, [
    { id: '18', company: 'Shoprite Holdings Ltd', position: 'Cashier', status: 'Applied' },
  ]);

  assert.equal(result.outcome, 'matched');
  assert.equal(result.application.id, '18');
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

test('a newer matched application email can correct a previous terminal status', () => {
  const decision = decideApplicationEmailUpdate({
    currentStatus: 'Rejected',
    detectedStatus: 'Interview',
    updatedAt: new Date('2026-10-07T08:00:00Z'),
    receivedAt: new Date('2026-10-08T08:00:00Z'),
    allowEmailStatusCorrection: true,
  });

  assert.equal(decision.action, 'apply');
  assert.equal(decision.applyStatus, true);
  assert.equal(decision.isBackward, true);
});

test('email status correction still requires a non-stale message', () => {
  const decision = decideApplicationEmailUpdate({
    currentStatus: 'Rejected',
    detectedStatus: 'Interview',
    updatedAt: new Date('2026-10-08T09:00:00Z'),
    receivedAt: new Date('2026-10-08T08:00:00Z'),
    allowEmailStatusCorrection: true,
  });

  assert.equal(decision.action, 'manual_review');
  assert.equal(decision.isStale, true);
});

const transitionScenarios = [
  ['scenario 1: Applied to Interview applies status and details', 'Applied', 'Interview', true, true, 'apply', true, false],
  ['scenario 2: Applied to Rejected applies status', 'Applied', 'Rejected', false, false, 'apply', true, false],
  ['scenario 3: Shortlisted to Interview applies status and details', 'Shortlisted', 'Interview', true, true, 'apply', true, false],
  ['scenario 4: Interview to Offer applies the forward status', 'Interview', 'Offer', false, false, 'apply', true, false],
  ['scenario 5: Interview to Interview applies changed details and preserves status', 'Interview', 'Interview', true, true, 'apply', false, false],
  ['scenario 6: Rejected to Interview requires review as backward', 'Rejected', 'Interview', true, true, 'manual_review', false, true],
  ['scenario 7: Offer to Interview requires review as backward', 'Offer', 'Interview', true, true, 'manual_review', false, true],
];

for (const [name, currentStatus, detectedStatus, detailsDetected, detailsChanged, action, applyStatus, isBackward] of transitionScenarios) {
  test(name, () => {
    const decision = decideApplicationEmailUpdate({
      currentStatus,
      detectedStatus,
      updatedAt: new Date('2026-10-07T08:00:00Z'),
      receivedAt: new Date('2026-10-08T08:00:00Z'),
      interviewDetailsDetected: detailsDetected,
      interviewDetailsChanged: detailsChanged,
    });

    assert.equal(decision.action, action);
    assert.equal(decision.applyStatus, applyStatus);
    assert.equal(decision.isBackward, isBackward);
    if (currentStatus === 'Interview' && detectedStatus === 'Interview' && action === 'apply') {
      assert.equal(decision.applyInterviewDetails, true);
    }
  });
}

test('scenario 5 repeat with no changed interview details is already up to date', () => {
  const decision = decideApplicationEmailUpdate({
    currentStatus: 'Interview',
    detectedStatus: 'Interview',
    interviewDetailsDetected: true,
    interviewDetailsChanged: false,
  });

  assert.equal(decision.action, 'already_up_to_date');
  assert.equal(decision.alreadyUpToDate, true);
  assert.equal(decision.requiresReview, false);
});

test('a stale same-status interview email cannot update changed interview details', () => {
  const decision = decideApplicationEmailUpdate({
    currentStatus: 'Interview',
    detectedStatus: 'Interview',
    updatedAt: new Date('2026-10-08T09:00:00Z'),
    receivedAt: new Date('2026-10-08T08:00:00Z'),
    interviewDetailsDetected: true,
    interviewDetailsChanged: true,
  });

  assert.equal(decision.action, 'manual_review');
  assert.equal(decision.applyInterviewDetails, false);
  assert.equal(decision.isStale, true);
  assert.match(decision.reason, /updated after this email/i);
});

test('a newer same-status interview email can update changed interview details', () => {
  const decision = decideApplicationEmailUpdate({
    currentStatus: 'Interview',
    detectedStatus: 'Interview',
    updatedAt: new Date('2026-10-08T07:00:00Z'),
    receivedAt: new Date('2026-10-08T08:00:00Z'),
    interviewDetailsDetected: true,
    interviewDetailsChanged: true,
  });

  assert.equal(decision.action, 'apply');
  assert.equal(decision.applyStatus, false);
  assert.equal(decision.applyInterviewDetails, true);
  assert.equal(decision.isStale, false);
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
    updated_at: new Date('2026-10-07T09:00:00Z'),
    interview_date: null,
    interview_time: null,
  };
  const classification = classifyApplicationEmail(email);
  const match = matchApplication(email, [application]);
  const extracted = extractInterviewDateTime(email);
  const fieldsToFill = getInterviewDetailsToFill(application, extracted);
  const decision = decideApplicationEmailUpdate({
    currentStatus: application.status,
    detectedStatus: classification.status,
    updatedAt: application.updated_at,
    receivedAt: new Date('2026-10-07T10:00:00Z'),
    interviewDetailsDetected: true,
    interviewDetailsChanged: true,
  });

  assert.equal(classification.status, 'Interview');
  assert.equal(match.outcome, 'matched');
  assert.equal(match.application.id, application.id);
  assert.deepEqual(fieldsToFill, { interviewDate: '2026-10-15', interviewTime: '10:00', interviewType: null });
  assert.equal(decision.action, 'apply');
  assert.equal(decision.applyStatus, false);
  assert.equal(decision.applyInterviewDetails, true);
  assert.equal(application.status, 'Interview');
});

test('does not relax stale-email or status transition safety for other statuses', () => {
  const staleAppliedUpdate = decideApplicationEmailUpdate({
    currentStatus: 'Applied',
    detectedStatus: 'Interview',
    updatedAt: new Date('2026-10-07T11:00:00Z'),
    receivedAt: new Date('2026-10-07T10:00:00Z'),
    interviewDetailsToFill: { interviewDate: '2026-10-15', interviewTime: '10:00' },
  });
  const interviewWithoutDetails = decideApplicationEmailUpdate({
    currentStatus: 'Interview',
    detectedStatus: 'Interview',
    updatedAt: new Date('2026-10-07T09:00:00Z'),
    receivedAt: new Date('2026-10-07T10:00:00Z'),
    interviewDetailsToFill: { interviewDate: null, interviewTime: null },
  });

  assert.equal(staleAppliedUpdate.action, 'manual_review');
  assert.equal(staleAppliedUpdate.isStale, true);
  assert.equal(interviewWithoutDetails.action, 'already_up_to_date');
});

test('prefers an exact longer company name over a shorter nested application name', () => {
  const email = {
    subject: 'Application Update - Rejected Test Company',
    text: 'We regret to inform you that your application was not selected.',
    from: '',
  };
  const applications = [
    { id: '21', company: 'Test Company', position: 'Software Developer', status: 'Applied' },
    { id: '22', company: 'Rejected Test Company', position: 'Software Developer', status: 'Applied' },
  ];
  const classification = classifyApplicationEmail(email);
  const match = matchApplication(email, applications);
  const decision = decideApplicationEmailUpdate({
    currentStatus: match.application.status,
    detectedStatus: classification.status,
    updatedAt: new Date('2026-10-06T09:00:00Z'),
    receivedAt: new Date('2026-10-07T09:00:00Z'),
  });

  assert.equal(classification.status, 'Rejected');
  assert.equal(match.outcome, 'matched');
  assert.equal(match.application.id, '22');
  assert.ok(match.confidence >= 0.75);
  assert.deepEqual(match.candidateIds, ['22']);
  assert.equal(decision.action, 'apply');
});

test('requires review when the subject and body name different plausible companies', () => {
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

  assert.equal(classification.status, 'Rejected');
  assert.equal(match.outcome, 'review');
  assert.equal(match.application, null);
  assert.deepEqual(match.candidateIds, ['23', '22']);
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
  assert.deepEqual(result.candidateIds, ['21', '23']);
});

test('scenario 11: multiple named company matches require manual review', () => {
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
    text: 'We regret to inform you that your application was not selected.',
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
  const decision = decideApplicationEmailUpdate({
    currentStatus: application.status,
    detectedStatus: classification.status,
    updatedAt: new Date('2026-10-06T09:00:00Z'),
    receivedAt: new Date('2026-10-07T09:00:00Z'),
  });

  assert.equal(match.outcome, 'matched');
  assert.equal(match.application.id, application.id);
  assert.equal(classification.status, 'Rejected');
  assert.equal(decision.action, 'manual_review');
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
  const decision = decideApplicationEmailUpdate({
    currentStatus: application.status,
    detectedStatus: classification.status,
    updatedAt: application.updated_at,
    receivedAt: new Date('2026-10-08T08:00:00Z'),
    interviewDetailsDetected: true,
    interviewDetailsChanged: true,
  });

  assert.equal(match.outcome, 'matched');
  assert.equal(match.application.id, '42');
  assert.equal(decision.action, 'apply');
  assert.equal(decision.applyStatus, true);
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