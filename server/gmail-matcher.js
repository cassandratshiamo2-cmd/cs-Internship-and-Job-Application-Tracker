const STOP_WORDS = new Set([
  'and', 'at', 'for', 'inc', 'job', 'jobs', 'ltd', 'limited', 'of', 'the',
  'company', 'corporation', 'corp', 'group', 'pty', 'llc', 'plc',
]);
const ROLE_WORD_ALIASES = {
  dev: 'developer',
  eng: 'engineer',
  jnr: 'junior',
  jr: 'junior',
  snr: 'senior',
  sr: 'senior',
};
const COMPANY_SUFFIXES = new Set([
  'inc', 'incorporated', 'corp', 'corporation', 'ltd', 'limited',
  'pty', 'proprietary', 'llc', 'plc', 'holdings', 'group',
]);

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function meaningfulWords(value) {
  return normalizeText(value)
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function normalizeRoleText(value) {
  return normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ROLE_WORD_ALIASES[word] || word)
    .join(' ');
}

function normalizeCompanyName(value) {
  const words = normalizeText(value).split(/\s+/).filter(Boolean);
  while (words.length && COMPANY_SUFFIXES.has(words[words.length - 1])) {
    words.pop();
  }
  return words.join(' ');
}

function senderDomain(from) {
  const address = String(from || '').match(/[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/i);
  if (!address) return '';
  const domain = address[1].toLowerCase();
  if (/\b(?:gmail|googlemail|outlook|hotmail|yahoo|live|linkedin|pnet)\./i.test(domain)) return '';
  return normalizeText(domain.split('.').slice(0, -1).join(' '));
}

function exactPhraseRanges(normalizedText, phrase) {
  const paddedText = ` ${normalizedText} `;
  const paddedPhrase = ` ${phrase} `;
  const ranges = [];
  let index = paddedText.indexOf(paddedPhrase);

  while (index !== -1) {
    const start = index + 1;
    ranges.push({ start, end: start + phrase.length });
    index = paddedText.indexOf(paddedPhrase, index + 1);
  }

  return ranges;
}

function companyMatchIsOnlyNested(application, applications, normalizedMessage) {
  const company = normalizeCompanyName(application.company);
  const companyRanges = exactPhraseRanges(normalizedMessage, company);
  if (!companyRanges.length) return false;

  return applications.some((otherApplication) => {
    const otherCompany = normalizeCompanyName(otherApplication.company);
    if (otherCompany.length <= company.length) return false;

    const otherRanges = exactPhraseRanges(normalizedMessage, otherCompany);
    return otherRanges.length > 0 && companyRanges.every((companyRange) =>
      otherRanges.some((otherRange) =>
        companyRange.start >= otherRange.start && companyRange.end <= otherRange.end
      )
    );
  });
}

function scoreApplicationMatch(email, application) {
  const normalizedSubject = normalizeText(email.subject || '');
  const normalizedBody = normalizeText(email.text || '');
  const normalizedMessage = `${normalizedSubject} ${normalizedBody}`.trim();
  const normalizedRoleMessage = normalizeRoleText(`${email.subject || ''} ${email.text || ''}`);
  const company = normalizeCompanyName(application.company);
  const companyWords = meaningfulWords(company);
  const domainWords = meaningfulWords(senderDomain(email.from));
  const companySubjectMatch = Boolean(company && exactPhraseRanges(normalizedSubject, company).length);
  const companyBodyMatch = Boolean(company && exactPhraseRanges(normalizedBody, company).length);
  const companyTextMatch = companySubjectMatch || companyBodyMatch;
  const messageWords = new Set(normalizedMessage.split(/\s+/).filter(Boolean));
  const companyWordMatches = companyWords.filter((word) => messageWords.has(word));
  const companyWordRatio = companyWords.length
    ? companyWordMatches.length / companyWords.length
    : 0;
  const domainMatch = companyWords.some((word) => domainWords.includes(word));
  const position = normalizeRoleText(application.position);
  const positionWords = meaningfulWords(application.position);
  const exactPositionMatch = Boolean(position && exactPhraseRanges(normalizedRoleMessage, position).length);
  const roleMessageWords = new Set(normalizedRoleMessage.split(/\s+/).filter(Boolean));
  const matchedPositionWords = positionWords.filter((word) => roleMessageWords.has(ROLE_WORD_ALIASES[word] || word));
  const positionRatio = positionWords.length
    ? matchedPositionWords.length / positionWords.length
    : 0;
  const positionMatch = exactPositionMatch || (positionWords.length > 0 && positionRatio >= 0.6);
  const companyEvidence = companySubjectMatch
    ? 0.79
    : companyBodyMatch
      ? 0.72
      : companyWordRatio >= 0.75
        ? 0.58
        : companyWordMatches.length
          ? 0.25
          : 0;
  const senderEvidence = domainMatch ? (companyTextMatch ? 0.04 : 0.75) : 0;
  const positionEvidence = exactPositionMatch ? 0.28 : positionMatch ? 0.14 : 0;
  const score = Math.min(companyEvidence + senderEvidence + positionEvidence, 1);

  return {
    score: Math.min(score, 1),
    companyMatch: companyTextMatch || companyWordMatches.length > 0 || domainMatch,
    companySubjectMatch,
    companyBodyMatch,
    positionMatch,
    exactPositionMatch,
  };
}

function matchApplication(email, applications, options = {}) {
  const minimumConfidence = options.minimumConfidence ?? 0.72;
  const minimumGap = options.minimumGap ?? 0.2;
  const normalizedMessage = normalizeText(`${email.subject || ''} ${email.text || ''}`);
  const normalizedSubject = normalizeText(email.subject || '');
  const candidates = applications
    .map((application) => {
      const match = scoreApplicationMatch(email, application);
      const shadowedCompanyMatch = companyMatchIsOnlyNested(
        application,
        applications,
        normalizedMessage
      );
      const sameCompanyApplications = applications.filter((candidate) =>
        normalizeCompanyName(candidate.company) === normalizeCompanyName(application.company)
      );
      const requiresRoleEvidence =
        sameCompanyApplications.length > 1 &&
        !match.exactPositionMatch;
      const requiresPositionMatch = options.requirePositionMatch && !match.positionMatch;
      const score = shadowedCompanyMatch || requiresRoleEvidence || requiresPositionMatch ? 0 : match.score;
      return {
        application,
        ...match,
        score,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  const top = candidates[0];
  const next = candidates[1];
  const unique = !next || top.score - next.score >= minimumGap;
  const genericMultiCompanyAlert = /\band\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|several|many)\s+(?:other|more)\s+companies\b/i.test(
    `${email.subject || ''} ${email.text || ''}`
  );

  if (top && top.score >= minimumConfidence && unique && (!genericMultiCompanyAlert || options.allowMultiCompanyAlert)) {
    return {
      outcome: 'matched',
      application: top.application,
      confidence: top.score,
      candidateIds: candidates.slice(0, 5).map(({ application }) => String(application.id)),
    };
  }

  return {
    outcome: 'review',
    application: null,
    confidence: top?.score || 0,
    candidateIds: candidates.slice(0, 5).map(({ application }) => String(application.id)),
  };
}

const STATUS_TRANSITIONS = {
  Saved: new Set(['Applied', 'Assessment', 'Shortlisted', 'Interview', 'Offer', 'Rejected']),
  Applied: new Set(['Assessment', 'Shortlisted', 'Interview', 'Offer', 'Rejected']),
  Assessment: new Set(['Shortlisted', 'Interview', 'Offer', 'Rejected']),
  Shortlisted: new Set(['Interview', 'Offer', 'Rejected']),
  Interview: new Set(['Offer', 'Rejected']),
  Offer: new Set(),
  Rejected: new Set(),
  Withdrawn: new Set(),
};

function canAdvanceStatus(currentStatus, nextStatus) {
  return STATUS_TRANSITIONS[currentStatus]?.has(nextStatus) || false;
}

const STATUS_ORDER = {
  Saved: 0,
  Applied: 1,
  Assessment: 2,
  Shortlisted: 3,
  Interview: 4,
  Offer: 5,
  Rejected: 5,
  Withdrawn: 6,
};

function decideApplicationEmailUpdate({
  currentStatus,
  detectedStatus,
  updatedAt,
  receivedAt,
  interviewDetailsDetected = false,
  interviewDetailsChanged = false,
  manual = false,
  allowEmailStatusCorrection = false,
}) {
  if (!detectedStatus) {
    return {
      action: 'ignore',
      applyStatus: false,
      applyInterviewDetails: false,
      alreadyUpToDate: false,
      requiresReview: false,
      isBackward: false,
      isStale: false,
      reason: 'No supported application status was detected.',
    };
  }

  if (currentStatus === detectedStatus) {
    const applyInterviewDetails = Boolean(
      detectedStatus === 'Interview' &&
      interviewDetailsDetected &&
      interviewDetailsChanged
    );
    return {
      action: applyInterviewDetails ? 'apply' : 'already_up_to_date',
      applyStatus: false,
      applyInterviewDetails,
      alreadyUpToDate: !applyInterviewDetails,
      requiresReview: false,
      isBackward: false,
      isStale: false,
      reason: null,
    };
  }

  const allowedTransition = canAdvanceStatus(currentStatus, detectedStatus);
  const isBackward = !allowedTransition &&
    STATUS_ORDER[detectedStatus] !== undefined &&
    STATUS_ORDER[currentStatus] !== undefined &&
    STATUS_ORDER[detectedStatus] < STATUS_ORDER[currentStatus];
  const isStale = Boolean(
    !manual &&
    updatedAt &&
    receivedAt &&
    new Date(updatedAt).getTime() > new Date(receivedAt).getTime()
  );

  if ((!allowedTransition && !allowEmailStatusCorrection) || isStale) {
    return {
      action: 'manual_review',
      applyStatus: false,
      applyInterviewDetails: false,
      alreadyUpToDate: false,
      requiresReview: true,
      isBackward,
      isStale,
      reason: isBackward
        ? 'The email would move the application to an earlier status.'
        : isStale
          ? 'The application was updated after this email arrived.'
          : 'The status transition is not allowed.',
    };
  }

  return {
    action: 'apply',
    applyStatus: true,
    applyInterviewDetails: detectedStatus === 'Interview' && interviewDetailsDetected,
    alreadyUpToDate: false,
    requiresReview: false,
    isBackward,
    isStale: false,
    reason: null,
  };
}

module.exports = {
  canAdvanceStatus,
  decideApplicationEmailUpdate,
  matchApplication,
  normalizeText,
  scoreApplicationMatch,
};