const STOP_WORDS = new Set([
  'and', 'at', 'for', 'inc', 'job', 'jobs', 'ltd', 'limited', 'of', 'the',
  'company', 'corporation', 'corp', 'group', 'pty', 'llc', 'plc',
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

function senderDomain(from) {
  const address = String(from || '').match(/[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/i);
  return address ? normalizeText(address[1].split('.').slice(0, -1).join(' ')) : '';
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
  const company = normalizeText(application.company);
  const companyRanges = exactPhraseRanges(normalizedMessage, company);
  if (!companyRanges.length) return false;

  return applications.some((otherApplication) => {
    const otherCompany = normalizeText(otherApplication.company);
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
  const normalizedMessage = normalizeText(
    `${email.subject || ''} ${email.text || ''} ${email.from || ''}`
  );
  const company = normalizeText(application.company);
  const companyWords = meaningfulWords(application.company);
  const domain = senderDomain(email.from);
  const companyTextMatch = Boolean(company && exactPhraseRanges(normalizedMessage, company).length);
  const companyWordMatches = companyWords.filter((word) => normalizedMessage.includes(word));
  const domainMatch = companyWords.some((word) => domain.includes(word));
  const position = normalizeText(application.position);
  const positionWords = meaningfulWords(application.position);
  const exactPositionMatch = Boolean(position && normalizedMessage.includes(position));
  const matchedPositionWords = positionWords.filter((word) => normalizedMessage.includes(word));
  const positionRatio = positionWords.length
    ? matchedPositionWords.length / positionWords.length
    : 0;
  const positionMatch = exactPositionMatch || (positionWords.length > 0 && positionRatio >= 0.6);

  if (!companyTextMatch && companyWordMatches.length === 0 && !domainMatch) {
    return { score: 0, companyMatch: false, positionMatch: false };
  }

  if (positionWords.length >= 2 && positionRatio === 0 && !exactPositionMatch) {
    return { score: 0, companyMatch: true, positionMatch: false };
  }

  const companyPhraseScore = companyTextMatch
    ? 0.75 + Math.min(Math.max(companyWords.length - 1, 0) * 0.05, 0.15)
    : companyWordMatches.length
      ? 0.3
      : 0;
  const score =
    companyPhraseScore +
    (domainMatch ? 0.35 : 0) +
    (exactPositionMatch ? 0.4 : positionMatch ? 0.25 : 0);

  return {
    score: Math.min(score, 1),
    companyMatch: companyTextMatch || companyWordMatches.length > 0 || domainMatch,
    positionMatch,
  };
}

function matchApplication(email, applications, options = {}) {
  const minimumConfidence = options.minimumConfidence ?? 0.75;
  const minimumGap = options.minimumGap ?? 0.2;
  const normalizedMessage = normalizeText(
    `${email.subject || ''} ${email.text || ''} ${email.from || ''}`
  );
  const sourceText = `${email.subject || ''} ${email.text || ''}`;
  const hasExplicitRoleContext = /\b(?:interview|position|role|job title)\b/i.test(sourceText);
  const candidates = applications
    .map((application) => {
      const match = scoreApplicationMatch(email, application);
      const shadowedCompanyMatch = companyMatchIsOnlyNested(
        application,
        applications,
        normalizedMessage
      );
      const company = normalizeText(application.company);
      const hasExactCompanyPhrase = exactPhraseRanges(normalizedMessage, company).length > 0;
      const exactSubjectCompanyMatch = exactPhraseRanges(
        normalizeText(email.subject || ''),
        company
      ).length > 0;
      const companyWords = meaningfulWords(application.company);
      const companyOnlyConfidence =
        0.75 + Math.min(Math.max(companyWords.length - 1, 0) * 0.05, 0.15);
      const score = shadowedCompanyMatch
        ? 0
        : match.score || (hasExactCompanyPhrase && !hasExplicitRoleContext
          ? companyOnlyConfidence
          : exactSubjectCompanyMatch
            ? companyOnlyConfidence
            : 0);
      return {
        application,
        ...match,
        score,
        rankingScore: score + (exactSubjectCompanyMatch ? 0.3 : 0),
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.rankingScore - left.rankingScore);

  const top = candidates[0];
  const next = candidates[1];
  const unique = !next || top.rankingScore - next.rankingScore >= minimumGap;
  const genericMultiCompanyAlert = /\band\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|several|many)\s+(?:other|more)\s+companies\b/i.test(
    `${email.subject || ''} ${email.text || ''}`
  );

  if (top && top.score >= minimumConfidence && unique && !genericMultiCompanyAlert) {
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

function getEmailUpdateDecision({
  currentStatus,
  nextStatus,
  updatedAt,
  receivedAt,
  interviewDetailsToFill,
}) {
  const canCompleteExistingInterview = Boolean(
    currentStatus === 'Interview' &&
    nextStatus === 'Interview' &&
    (interviewDetailsToFill?.interviewDate || interviewDetailsToFill?.interviewTime)
  );
  const statusTransitionAllowed =
    canAdvanceStatus(currentStatus, nextStatus) || canCompleteExistingInterview;
  const emailIsStale = new Date(updatedAt).getTime() > new Date(receivedAt).getTime();

  return {
    allowed: statusTransitionAllowed && (!emailIsStale || canCompleteExistingInterview),
    preserveStatus: canCompleteExistingInterview,
  };
}

function getReviewedEmailUpdateDecision({
  currentStatus,
  nextStatus,
  interviewDetailsToFill,
}) {
  const preserveStatus = Boolean(
    currentStatus === 'Interview' &&
    nextStatus === 'Interview' &&
    (interviewDetailsToFill?.interviewDate || interviewDetailsToFill?.interviewTime)
  );

  return {
    allowed: canAdvanceStatus(currentStatus, nextStatus) || preserveStatus,
    preserveStatus,
  };
}

module.exports = {
  canAdvanceStatus,
  getEmailUpdateDecision,
  getReviewedEmailUpdateDecision,
  matchApplication,
  normalizeText,
  scoreApplicationMatch,
};