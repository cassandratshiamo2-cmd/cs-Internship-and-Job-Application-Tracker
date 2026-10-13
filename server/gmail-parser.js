
const STATUS_RULES = [
  {
    status: 'Rejected',
    patterns: [
      /not selected/i,
      /not moving forward/i,
      /will not be moving forward/i,
      /regret to inform/i,
      /unsuccessful/i,
      /application.{0,20}rejected/i,
      /not progressing/i,
      /we have decided not to/i,
      /decided not to carry o(?:n)? with your application/i,
    ],
  },
  {
    status: 'Withdrawn',
    patterns: [
      /your application (?:has been )?withdrawn/i,
      /we (?:have )?withdrawn your application/i,
      /we acknowledge your withdrawal of (?:the )?application/i,
    ],
  },
  {
    status: 'Offer',
    patterns: [
      /offer of employment/i,
      /job offer/i,
      /employment offer/i,
      /pleased to offer/i,
      /we would like to offer you/i,
      /\byou\s+(?:are|'re|have been)\s+offered\s+(?:a|the)\s+(?:position|role|job)\b/i,
      /selected for the (?:position|role|job) of/i,
    ],
  },
  {
    status: 'Interview',
    patterns: [
      /\binvit(?:e|es|ed)\s+you\s+(?:to|for)\s+(?:an?\s+)?(?:[\w-]+\s+){0,3}interview\b/i,
      /\byou\s+(?:are|'re|have been)\s+invited?\s+(?:to|for)\s+(?:an?\s+)?(?:[\w-]+\s+){0,3}interview\b/i,
      /\binvited? you to (?:an? )?interview/i,
      /invite(?:s|d)?\s+you\s+(?:to|for)\s+(?:an?\s+)?interview/i,
      /interview invitation/i,
      /shortlisted.{0,40}interview/i,
      /interview.{0,40}shortlisted/i,
      /schedule an interview/i,
      /interview.{0,30}invitation/i,
      /would like to interview you/i,
      /interview.{0,20}availability/i,
      /\binterview\b[^.!?\n]{0,60}\b(?:rescheduled|moved|changed)\b/i,
      /\b(?:rescheduled|moved|changed)\b[^.!?\n]{0,60}\binterview\b/i,
    ],
  },
  {
    status: 'Shortlisted',
    patterns: [
      /short[- ]?listed/i,
      /selected for the next (?:stage|round)/i,
      /advanced to the next (?:stage|round)/i,
    ],
  },
  {
    status: 'Assessment',
    patterns: [
      /assessment (?:test|task|invitation|exercise|link)/i,
      /invited?\s+(?:you\s+)?(?:for|to)\s+(?:an?\s+)?asses{1,2}ment\b/i,
      /invitation\s+to\s+(?:an?\s+)?asses{1,2}ment\b/i,
      /(?:complete|take|do)\s+(?:an?\s+)?asses{1,2}ment\b/i,
      /complete.{0,30}assessment/i,
      /online assessment/i,
      /coding challenge/i,
      /technical assessment/i,
    ],
  },
  {
    status: 'Applied',
    patterns: [
      /application received/i,
      /received your application/i,
      /thank you for applying/i,
      /application has been submitted/i,
      /confirm(?:ation)? of your application/i,
    ],
  },
  {
    status: 'Saved',
    patterns: [
      /application (?:has been )?saved/i,
      /we have saved your application/i,
    ],
  },
];

const GENERIC_JOB_ALERT_PATTERNS = [
  /\b(?:pnet|linkedin)\b[^\n]{0,50}\bjob alerts?\b/i,
  /\b(?:job alerts?|linkedin job recommendations?)\b/i,
  /\b\d+\s+(?:other\s+)?companies are looking for candidates like you\b/i,
  /\b(?:jobs|roles|opportunities) (?:you may be interested in|recommended for you|matching your profile)\b/i,
  /\b(?:recommended|suggested|featured|trending)\s+(?:jobs|roles|opportunities)\b/i,
  /\b(?:these|our|new)\s+(?:jobs|roles|opportunities)\s+(?:match|matched)\s+(?:your|the)\s+(?:profile|preferences|search)\b/i,
  /\b(?:browse|explore|discover)\s+(?:our|these|the)\s+(?:latest|featured|recommended)?\s*(?:jobs|roles|opportunities)\b/i,
  /\b(?:featured|sponsored|promoted)\s+(?:job|role|opportunit)/i,
  /\b(?:our|the)\s+(?:latest|top|featured)\s+job offers\b/i,
  /\b(?:weekly|daily|monthly)\s+(?:job\s+)?offers?\b/i,
  /\b(?:job|career)\s+(?:recommendations?|suggestions?)\b/i,
  /\b(?:weekly|monthly)\s+(?:job|career|vacancy)?\s*newsletter\b/i,
  /\bnewsletter\b/i,
];

const NON_APPLICATION_NOTIFICATION_PATTERNS = [
  /\bsecurity alert\b/i,
  /\bnew sign[- ]in\b/i,
  /\bpassword reset\b/i,
  /\bverify your account\b/i,
  /\baccount verification\b/i,
  /\btwo[- ]factor authentication\b/i,
  /\bunusual account activity\b/i,
  /\baccount security notification\b/i,
];

function extractCurrentMessageText(value, { includeSignature = false } = {}) {
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
  let authoredLineSeen = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    const isHardQuotedBoundary =
      /^on .{8,}\bwrote:\s*$/i.test(trimmed) ||
      /^-{2,}\s*(?:forwarded message|original message)\s*-{2,}$/i.test(trimmed) ||
      /^begin forwarded message:\s*$/i.test(trimmed) ||
      /^--\s*$/.test(line) ||
      /^sent from my (?:iphone|ipad|android|mobile device)\b/i.test(trimmed);
    const forwardedHeaderCount = /^from:\s+\S/i.test(trimmed)
      ? lines.slice(index, index + 6)
        .filter((headerLine) => /^\s*(?:from|sent|date|to|cc|subject):\s*\S/i.test(headerLine))
        .length
      : 0;
    const isQuotedReply =
      isHardQuotedBoundary ||
      /^>/.test(trimmed) ||
      (authoredLineSeen && forwardedHeaderCount >= 3);
    const isSignOff =
      /^(?:best regards|kind regards|regards|sincerely|yours sincerely|many thanks|thank you)[,!]?$/i.test(trimmed) ||
      /^(?:best regards|kind regards|regards|sincerely|yours sincerely|many thanks|thank you),\s+\S.{0,100}$/i.test(trimmed);

    if (isQuotedReply || (!includeSignature && isSignOff && authoredLineSeen)) {
      return lines.slice(0, index).join('\n').trim();
    }

    if (trimmed && !/^>/.test(trimmed)) authoredLineSeen = true;
  }

  return lines.join('\n').trim();
}

function hasPersonalizedApplicationOutcome({ subject = '', text = '' }) {
  const content = `${subject}\n${extractCurrentMessageText(text)}`.slice(0, 100000);

  return [
    /\bthank you for applying\b/i,
    /\bapplication received\b/i,
    /\b(?:we have received|we received|we got|application received|application confirmation|your application has been submitted)\b[^.!?\n]{0,100}\b(?:your application|application|role|position)\b/i,
    /\byour application\b[^.!?\n]{0,100}\b(?:received|submitted|shortlisted|rejected|unsuccessful|not selected|not progressing)\b/i,
    /\byou\s+(?:are|'re|have been)\s+invited\b[^.!?\n]{0,100}\b(?:interview|assessment)\b/i,
    /\b(?:invites?|invited)\s+you\b[^.!?\n]{0,100}\b(?:interview|assessment)\b/i,
    /\byour interview invitation\b/i,
    /\byou\s+(?:are|'re|have been)\s+shortlisted\b[^.!?\n]{0,80}\b(?:position|role|application)\b/i,
    /\b(?:pleased|would like)\s+to\s+offer\s+you\s+(?:(?:a|an|the)\s+)?(?:[a-z][a-z0-9-]*\s+){0,5}(?:position|role|job)\b/i,
    /\byou\s+(?:are|'re|have been)\s+offered\s+(?:a|the)\s+(?:position|role|job)\b/i,
    /\byour\s+(?:job\s+)?offer(?:\s+(?:letter|of employment|details|for (?:the\s+)?(?:position|role))|\s+(?:is|has been)\s+(?:ready|attached|available))\b/i,
    /\bregret to inform you\b[^.!?\n]{0,100}\b(?:not selected|unsuccessful|not progressing)\b/i,
    /\byour application\b[^.!?\n]{0,100}\b(?:not selected|rejected|unsuccessful)\b/i,
    /\b(?:your|the)\s+(?:online\s+)?assessment\b[^.!?\n]{0,100}\b(?:complete|submit|invitation|application|role|position|candidate)\b/i,
    /\bplease\s+(?:complete|take|submit)\s+(?:the\s+)?(?:online\s+)?(?:assessment|coding challenge|technical assessment)\b[^.!?\n]{0,100}\b(?:application|candidate|position|role|your)\b/i,
  ].some((pattern) => pattern.test(content));
}

function isGenericJobAlert({ subject = '', text = '', from = '' }) {
  const searchable = `${subject}\n${extractCurrentMessageText(text)}`.slice(0, 100000);

  if (GENERIC_JOB_ALERT_PATTERNS.some((pattern) => pattern.test(searchable))) {
    return true;
  }

  const senderIsJobPlatform = /\b(?:pnet|linkedin)\b/i.test(String(from));

  return senderIsJobPlatform &&
    /\b(?:recommended|recommendations|job matches|jobs for you|candidates like you|profile match)\b/i.test(searchable);
}

function classifyApplicationEmail(
  { subject = '', text = '', from = '' },
  { allowGenericJobAlert = false } = {},
) {
  const currentText = extractCurrentMessageText(text);
  const currentEmail = { subject, text: currentText, from };
  const personalizedOutcome = hasPersonalizedApplicationOutcome(currentEmail);
  const genericJobAlert = isGenericJobAlert(currentEmail);
  const searchable = `${subject}\n${currentText}`.slice(0, 100000);

  const nonApplicationNotification = NON_APPLICATION_NOTIFICATION_PATTERNS.some(
    (pattern) => pattern.test(searchable),
  );

  if (
    nonApplicationNotification ||
    (genericJobAlert && (!allowGenericJobAlert || !personalizedOutcome))
  ) {
    return {
      status: null,
      confidence: 0,
      matchedRule: null,
      ignored: true,
      reason: genericJobAlert
        ? 'Generic job promotion, recommendation, or newsletter.'
        : 'Unrelated security or account notification.',
    };
  }

  const body = currentText.slice(0, 100000);

  if (!body.trim() && !String(subject || '').trim()) {
    return { status: null, confidence: 0, matchedRule: null };
  }

  const hasInterviewSubject =
    /\binterview\b/i.test(String(subject || '').slice(0, 998));

  const hasAssessmentInvitationSubject =
    /\b(?:asses{1,2}ment\s+(?:invitation|test|task|exercise)|invitation\s+(?:to\s+)?(?:an?\s+)?asses{1,2}ment)\b/i
      .test(String(subject || '').slice(0, 998));

  const hasRelevantAssessmentBodyContext =
    /\b(?:you|your|application|applicant|candidate|role|position|please|complete|take|submit|click|next stage|next step)\b/i
      .test(body);

  const bodyMatches = STATUS_RULES.flatMap((rule) => {
    const matchedPattern = rule.patterns.find((pattern) => pattern.test(body));
    return matchedPattern ? [{ status: rule.status, matchedPattern }] : [];
  });
  const bodyStatuses = [...new Set(bodyMatches.map(({ status }) => status))];

   // Interview invitations commonly contain other harmless status phrases,
  // such as "Thank you for applying" or "you have been shortlisted".
  // Prefer Interview when all detected statuses are compatible with an
  // interview invitation. Keep genuinely contradictory outcomes in review.
  const interviewCompatibleStatuses = new Set([
    'Interview',
    'Shortlisted',
    'Applied',
  ]);

  if (
    bodyStatuses.includes('Interview') &&
    bodyStatuses.every((status) => interviewCompatibleStatuses.has(status))
  ) {
    const interviewMatch = bodyMatches.find(
      ({ status }) => status === 'Interview',
    );

    return {
      status: 'Interview',
      confidence: 0.9,
      matchedRule: interviewMatch.matchedPattern.source,
    };
  }
  if (bodyStatuses.length > 1) {
    return {
      status: null,
      confidence: 0,
      matchedRule: null,
      requiresReview: true,
      reason: 'Conflicting application outcomes appear in the current email text.',
    };
  }

  if (bodyMatches.length) {
    const bodyMatch = bodyMatches[0];
    const subjectDisagreesWithBody =
      (hasInterviewSubject && bodyMatch.status !== 'Interview') ||
      (hasAssessmentInvitationSubject &&
        bodyMatch.status !== 'Assessment' &&
        bodyMatch.status !== 'Applied' &&
        hasRelevantAssessmentBodyContext);

    if (subjectDisagreesWithBody) {
      return {
        status: null,
        confidence: 0,
        matchedRule: null,
        requiresReview: true,
        reason: 'The subject and current email text indicate different application outcomes.',
      };
    }

    if (
      hasAssessmentInvitationSubject &&
      hasRelevantAssessmentBodyContext &&
      bodyMatch.status === 'Applied'
    ) {
      const assessmentRule = STATUS_RULES.find((rule) => rule.status === 'Assessment');
      return {
        status: 'Assessment',
        confidence: 0.9,
        matchedRule: assessmentRule.patterns.find((pattern) => pattern.test(subject)).source,
      };
    }

    return {
      status: bodyMatch.status,
      confidence: 0.9,
      matchedRule: bodyMatch.matchedPattern.source,
    };
  }

  if (hasInterviewSubject) {
    const interviewRule = STATUS_RULES.find((rule) => rule.status === 'Interview');
    const matchedPattern = interviewRule.patterns.find((pattern) =>
      pattern.test(subject),
    );
    if (matchedPattern) {
      return {
        status: 'Interview',
        confidence: 0.9,
        matchedRule: matchedPattern.source,
      };
    }
  }

  return { status: null, confidence: 0, matchedRule: null };
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const MONTH_PATTERN =
  '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';

const DATE_PATTERNS = [
  {
    regex: new RegExp(`\\b(\\d{1,2})\\s+${MONTH_PATTERN}\\.?[,]?\\s+(\\d{4})\\b`, 'gi'),
    parse: (match) => ({
      day: Number(match[1]),
      month: monthNumber(match[2]),
      year: Number(match[3]),
    }),
  },
  {
    regex: new RegExp(`\\b${MONTH_PATTERN}\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'gi'),
    parse: (match) => ({
      day: Number(match[2]),
      month: monthNumber(match[1]),
      year: Number(match[3]),
    }),
  },
  {
    regex: /\b(\d{4})-(\d{2})-(\d{2})\b/g,
    parse: (match) => ({
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    }),
  },
  {
    regex: /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g,
    parse: (match) => {
      const first = Number(match[1]);
      const second = Number(match[2]);

      // Do not guess when both numbers could be either month or day.
      if (first <= 12 && second <= 12) return null;

      return first > 12
        ? { day: first, month: second, year: Number(match[3]) }
        : { day: second, month: first, year: Number(match[3]) };
    },
  },
];

const TIMEZONE_OFFSETS = {
  SAST: 120,
  CAT: 120,
  UTC: 0,
  GMT: 0,
  Z: 0,
  EST: -300,
  EDT: -240,
  MST: -420,
  MDT: -360,
  PST: -480,
  PDT: -420,
  CET: 60,
  CEST: 120,
  BST: 60,
  EET: 120,
  EEST: 180,
};

const INTERVIEW_TYPE_PATTERNS = [
  {
    type: 'Phone',
    pattern: /\b(?:interview\s+)?type\s*[:\-]\s*(?:phone|telephone)\b|\b(?:phone|telephone)\s+(?:screen|interview|call)\b|\binterview\b[^.!?\n]{0,30}\b(?:by|via|over)\s+(?:phone|telephone)\b/i,
  },
  {
    type: 'Video',
    pattern: /\b(?:interview\s+)?type\s*[:\-]\s*(?:video|virtual)\b|\b(?:video|virtual)\s+(?:interview|call|meeting)\b|\bzoom\s+interview\b|\binterview\b[^.!?\n]{0,30}\b(?:by|via|over|on)\s+(?:video|zoom|teams|google meet)\b/i,
  },
  {
    type: 'In-person',
    pattern: /\b(?:interview\s+)?type\s*[:\-]\s*(?:in[\s-]?person|face[\s-]?to[\s-]?face|on[\s-]?site)\b|\b(?:in[\s-]?person|face[\s-]?to[\s-]?face|on[\s-]?site)\s+(?:interview|meeting)\b|\binterview\b[^.!?\n]{0,30}\b(?:in[\s-]?person|on[\s-]?site)\b/i,
  },
  {
    type: 'Technical',
    pattern: /\b(?:interview\s+)?type\s*[:\-]\s*technical\b|\btechnical\s+interview\b/i,
  },
  {
    type: 'Panel',
    pattern: /\b(?:interview\s+)?type\s*[:\-]\s*panel\b|\bpanel\s+interview\b/i,
  },
  {
    type: 'Other',
    pattern: /\binterview\s+type\s*[:\-]\s*other\b/i,
  },
];

function monthNumber(value) {
  const normalized = value.toLowerCase().replace(/\.$/, '');
  if (normalized === 'sept') return 9;

  const index = MONTHS.findIndex((month) =>
    month === normalized || month.slice(0, 3) === normalized,
  );

  return index + 1;
}

function isValidDate({ year, month, day }) {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function timezoneOffsetMinutes(zone) {
  if (!zone) return null;

  const normalized = zone.toUpperCase().replace(/\s+/g, '');

  if (Object.hasOwn(TIMEZONE_OFFSETS, normalized)) {
    return TIMEZONE_OFFSETS[normalized];
  }

  const offset = /^(?:UTC|GMT)([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(normalized);
  if (!offset) return undefined;

  const hours = Number(offset[2]);
  const minutes = Number(offset[3] || 0);

  if (hours > 14 || minutes > 59) return undefined;

  const sign = offset[1] === '+' ? 1 : -1;
  return sign * (hours * 60 + minutes);
}

function asSast(dateParts, hour, minute, zone) {
  const offset = timezoneOffsetMinutes(zone);

  if (offset === undefined) return null;

  const dateString =
    `${dateParts.year}-${String(dateParts.month).padStart(2, '0')}-${String(dateParts.day).padStart(2, '0')}`;

  if (offset === null || offset === 120) {
    return {
      date: dateString,
      time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    };
  }

  const instant =
    Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, hour, minute) -
    offset * 60000;

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Johannesburg',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function parseTime(match, zone) {
  let hour = Number(match[1]);
  const period = match[3]
    ? match[3].toLowerCase().replace(/\./g, '')
    : '';

  const minute =
    match[2] === undefined ? (period ? 0 : null) : Number(match[2]);

  if (minute === null || minute > 59) return null;

  if (period) {
    if (hour < 1 || hour > 12) return null;
    if (period === 'pm' && hour !== 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }

  return { hour, minute, zone };
}

function extractTimeFromText(text) {
  const content = String(text || '').slice(0, 100000);

  // First look for a labelled time, including a separate line such as
  // "Time: 11:30 AM".
  const labelled =
    /^\s*(?:interview\s+)?time\s*[:\-]\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?(?:\s*\(?\s*((?:UTC|GMT)[+-]\d{1,2}(?::?\d{2})?|SAST|CAT|UTC|GMT|EST|EDT|MST|MDT|PST|PDT|CET|CEST|BST|EET|EEST|Z)\s*\)?)?\s*$/im;

  const labelledMatch = labelled.exec(content);

  if (labelledMatch) {
    const parsed = parseTime(
      [labelledMatch[0], labelledMatch[1], labelledMatch[2], labelledMatch[3]],
      labelledMatch[4],
    );

    return parsed;
  }

  // Otherwise accept times immediately following an explicitly associated date.
  const general =
    /(?:\b(?:at|from)\s*|@\s*|,\s*)(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?(?:\s*\(?\s*((?:UTC|GMT)[+-]\d{1,2}(?::?\d{2})?|SAST|CAT|UTC|GMT|EST|EDT|MST|MDT|PST|PDT|CET|CEST|BST|EET|EEST|Z)\s*\)?)?/i;

  const match = general.exec(content);
  if (!match) return null;

  return parseTime([match[0], match[1], match[2], match[3]], match[4]);
}

function interviewDateIsExplicitlyAssociated(prefix, currentLine = '') {
  const recentPrefix = prefix.slice(-160);

  if (
    /^\s*(?:interview\s+)?date\s*[:\-]/i.test(currentLine) &&
    /\binterview\s+details\s*:/i.test(recentPrefix)
  ) {
    return true;
  }

  return (
    /\binterview(?:\s+invitation)?\s*[:\-]\s*$/i.test(recentPrefix) ||
    /\binterview\s+date\s*[:\-]\s*$/i.test(recentPrefix) ||
    /\binterview\b[^.!?\n]{0,90}\b(?:scheduled|rescheduled|set|booked|planned|held|takes place|will take place)\b[^.!?\n]{0,45}\b(?:for|on)\s*$/i.test(recentPrefix) ||
    /\b(?:rescheduled|moved|changed)\b[^.!?\n]{0,60}\binterview\b[^.!?\n]{0,60}\b(?:for|to|on)\s*$/i.test(recentPrefix) ||
    /\binvit(?:e|ed)\b[^.!?\n]{0,100}\binterview\b[^.!?\n]{0,100}\b(?:on|for)\s+(?:the\s+)?$/i.test(recentPrefix) ||
    /\binterview\s+(?:date\s*)?(?:is\s+)?(?:on|for)\s+(?:the\s+)?$/i.test(recentPrefix) ||
    /\binterview\s+will\s+be\s+(?:held\s+)?(?:on|for)\s*$/i.test(recentPrefix) ||
    /\b(?:rescheduled|moved|changed|postponed)\b[^.!?;\n]{0,100}\b(?:for|to|on)\s*$/i.test(recentPrefix)
  );
}

function extractInterviewDateTime({ subject = '', text = '' }) {
  const content = `${subject}\n${extractCurrentMessageText(text)}`.slice(0, 100000);
  const lines = content.split(/\r?\n/);
  const dates = [];

  let offset = 0;

  for (const pattern of DATE_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match;

    while ((match = pattern.regex.exec(content)) !== null) {
      const parsedDate = pattern.parse(match);
      if (!parsedDate || !isValidDate(parsedDate)) continue;

      const lineStart = content.lastIndexOf('\n', match.index - 1) + 1;
      const lineEndIndex = content.indexOf('\n', match.index);
      const lineEnd = lineEndIndex === -1 ? content.length : lineEndIndex;
      const currentLine = content.slice(lineStart, lineEnd);
      const prefix = content.slice(Math.max(0, lineStart - 200), match.index);

      const interviewDetailsBlock =
        /\binterview\s+details\s*:/i.test(content.slice(Math.max(0, lineStart - 250), lineStart));

      const isLabelledDate =
        /^\s*(?:interview\s+)?date\s*[:\-]/i.test(currentLine) &&
        interviewDetailsBlock;

      if (
        !isLabelledDate &&
        !interviewDateIsExplicitlyAssociated(prefix, currentLine)
      ) {
        continue;
      }

      const dateString =
        `${parsedDate.year}-${String(parsedDate.month).padStart(2, '0')}-${String(parsedDate.day).padStart(2, '0')}`;

      dates.push({ date: dateString, parts: parsedDate });
    }
  }

  // Remove duplicates caused by overlapping date formats.
  const uniqueDates = [...new Map(dates.map((item) => [item.date, item])).values()];

  if (uniqueDates.length !== 1) {
    return {
      interviewDate: null,
      interviewTime: null,
      ambiguous: uniqueDates.length > 1,
    };
  }

  const candidate = uniqueDates[0];
  const parsedTime = extractTimeFromText(content);
  const converted = parsedTime
    ? asSast(
        candidate.parts,
        parsedTime.hour,
        parsedTime.minute,
        parsedTime.zone,
      )
    : null;

  return {
    interviewDate: converted?.date || candidate.date,
    interviewTime: converted?.time || null,
    ambiguous: false,
    hasUnsupportedTimezone: Boolean(parsedTime && !converted),
  };
}


function isDateInRange(content, start, end) {
  const windowStart = Math.max(0, start - 40);
  const windowEnd = Math.min(content.length, end + 40);
  const window = content.slice(windowStart, windowEnd);
  const rangePatterns = [
    new RegExp(`\\b${MONTH_PATTERN}\\s+\\d{1,2}\\s*(?:-|–|to|through)\\s*\\d{1,2}(?:,?\\s+\\d{4})?`, 'i'),
    new RegExp(`\\b\\d{1,2}\\s*(?:-|–|to|through)\\s*\\d{1,2}\\s+${MONTH_PATTERN}\\s+\\d{4}`, 'i'),
    new RegExp(`\\b${MONTH_PATTERN}\\s+\\d{1,2},?\\s+\\d{4}\\s+(?:-|–|to|through)\\s+${MONTH_PATTERN}\\s+\\d{1,2},?\\s+\\d{4}`, 'i'),
    new RegExp(`\\b\\d{1,2}\\s+${MONTH_PATTERN}\\s+\\d{4}\\s+(?:-|–|to|through)\\s+\\d{1,2}\\s+${MONTH_PATTERN}\\s+\\d{4}`, 'i'),
    new RegExp(`\\b\\d{1,2}\\s+${MONTH_PATTERN}\\s+(?:-|–|to|through)\\s+\\d{1,2}\\s+${MONTH_PATTERN}\\s+\\d{4}`, 'i'),
    /\b\d{1,2}\/\d{1,2}\/\d{4}\s*(?:-|–|to|through)\s*\d{1,2}\/\d{1,2}\/\d{4}\b/i,
    /\b\d{4}-\d{2}-\d{2}\s+(?:-|–|to|through)\s+\d{4}-\d{2}-\d{2}\b/i,
  ];

  return rangePatterns.some((pattern) => {
    const match = pattern.exec(window);
    if (!match) return false;
    const rangeStart = windowStart + match.index;
    const rangeEnd = rangeStart + match[0].length;
    return start < rangeEnd && end > rangeStart;
  });
}

function collectInterviewDates(content) {
  const dates = [];

  for (const pattern of DATE_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match;

    while ((match = pattern.regex.exec(content)) !== null) {
      const parts = pattern.parse(match);
      if (!parts || !isValidDate(parts)) continue;

      const start = match.index;
      const end = start + match[0].length;
      if (isDateInRange(content, start, end)) continue;

      const lineStart = content.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = content.indexOf('\n', start);
      const currentLine = content.slice(lineStart, lineEnd < 0 ? content.length : lineEnd);
      const priorBoundary = Math.max(
        content.lastIndexOf('.', start - 1),
        content.lastIndexOf('!', start - 1),
        content.lastIndexOf('?', start - 1),
        content.lastIndexOf(';', start - 1),
      );
      const prefix = content.slice(Math.max(priorBoundary + 1, start - 180), start);


const interviewDetailsDate =
  /^\s*[-*•]?\s*(?:interview\s+)?date\s*[:\-]/i.test(currentLine) &&
  /\binterview\s+details\s*:/i.test(
    content.slice(Math.max(0, lineStart - 250), lineStart)
  );

if (
  !interviewDetailsDate &&
  !interviewDateIsExplicitlyAssociated(prefix, currentLine)
) {
  continue;
}


      dates.push({
        start,
        end,
        parts,
        date: `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
        rescheduled: /\b(?:rescheduled|moved|changed|postponed)\b[^.!?;\n]{0,100}\b(?:for|to|on)\s*$/i.test(prefix),
      });
    }
  }

  return [...new Map(dates.map((item) => [`${item.start}:${item.date}`, item])).values()]
    .sort((left, right) => left.start - right.start);
}

function extractTimeCandidates(text) {
  const pattern =
    /(?:\b(?:interview\s+)?time\s*[:\-]\s*|\b(?:at|from|and|to)\s*|@\s*|,\s*|^\s*)(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?(?:\s*\(?\s*((?:UTC|GMT)[+-]\d{1,2}(?::?\d{2})?|SAST|CAT|UTC|GMT|EST|EDT|MST|MDT|PST|PDT|CET|CEST|BST|EET|EEST|Z)\s*\)?)?/gim;
  const candidates = [];
  let match;

  while ((match = pattern.exec(String(text || ''))) !== null) {
    const remaining = String(text || '').slice(pattern.lastIndex);
    const unsupportedZone = /^\s*([A-Z]{2,5})\b/.exec(remaining);
    const zone = match[4] || (
      unsupportedZone && timezoneOffsetMinutes(unsupportedZone[1]) === undefined
        ? unsupportedZone[1]
        : null
    );
    const parsed = parseTime([match[0], match[1], match[2], match[3]], zone);
    if (parsed) {
      candidates.push({ ...parsed, index: match.index });
    }
  }

  return candidates;
}

function scheduleTimeText(content, date, nextDate) {
  const lineEnd = content.indexOf('\n', date.end);
  const sameLineEnd = lineEnd < 0 ? content.length : lineEnd;
  const sameLine = content.slice(date.end, sameLineEnd).split(/[.!?](?=\s|$)/, 1)[0];
  const inlineTimes = extractTimeCandidates(sameLine);
  if (inlineTimes.length) return { candidates: inlineTimes, text: sameLine };

  const boundary = nextDate?.start ?? Math.min(content.length, date.end + 500);
  const followingLines = content.slice(sameLineEnd, boundary).split(/\r?\n/);
  const timeLines = [];

  for (const line of followingLines.slice(1, 7)) {
    if (!line.trim()) continue;
   if (/^\s*[-*•]?\s*(?:interview\s+)?time\s*[:\-]/i.test(line)) {
      timeLines.push(line);
      break;
    }
    if (/^\s*(?:(?:at|from|@)\s*)?\d/i.test(line) && timeLines.length === 0) {
      timeLines.push(line);
      break;
    }
    if (/^\s*(?:location|venue|address)\s*[:\-]/i.test(line)) continue;
    break;
  }

  const text = timeLines.join('\n');
  return { candidates: extractTimeCandidates(text), text };
}

function extractInterviewDateTime({ subject = '', text = '' }) {
  const content = `${subject}\n${extractCurrentMessageText(text)}`.slice(0, 100000);
  const dates = collectInterviewDates(content);

  if (!dates.length) {
    return { interviewDate: null, interviewTime: null, ambiguous: false };
  }

  const schedules = dates.map((date, index) => {
    const pairing = scheduleTimeText(content, date, dates[index + 1]);
    const uniqueTimes = [...new Map(
      pairing.candidates.map((time) => [
        `${time.hour}:${time.minute}:${time.zone || ''}`,
        time,
      ]),
    ).values()];

    return {
      ...date,
      time: uniqueTimes.length === 1 ? uniqueTimes[0] : null,
      ambiguousTime: uniqueTimes.length > 1,
    };
  }).filter((schedule, index, all) =>
    !all.slice(0, index).some((earlier) =>
      earlier.date === schedule.date &&
      earlier.time?.hour === schedule.time?.hour &&
      earlier.time?.minute === schedule.time?.minute &&
      earlier.time?.zone === schedule.time?.zone
    )
  );

  let candidate;
  if (schedules.length === 1) {
    [candidate] = schedules;
  } else {
    const rescheduled = schedules.filter((schedule) => schedule.rescheduled);
    if (rescheduled.length !== 1) {
      return { interviewDate: null, interviewTime: null, ambiguous: true };
    }
    [candidate] = rescheduled;
  }

  if (candidate.ambiguousTime) {
    return {
      interviewDate: candidate.date,
      interviewTime: null,
      ambiguous: true,
      hasUnsupportedTimezone: false,
    };
  }

  const converted = candidate.time
    ? asSast(
        candidate.parts,
        candidate.time.hour,
        candidate.time.minute,
        candidate.time.zone,
      )
    : null;
  const hasUnsupportedTimezone = Boolean(candidate.time && !converted);

  return {
    interviewDate: hasUnsupportedTimezone ? null : converted?.date || candidate.date,
    interviewTime: converted?.time || null,
    ambiguous: false,
    hasUnsupportedTimezone,
  };
}



function getInterviewDetailsToFill(existing, extracted) {
  return {
    interviewDate: existing?.interview_date
      ? null
      : extracted?.interviewDate || null,
    interviewTime: existing?.interview_time
      ? null
      : extracted?.interviewTime || null,
    interviewType: existing?.interview_type || existing?.interviewType
      ? null
      : extracted?.interviewType || null,
    interviewLocation: existing?.interview_location || existing?.interviewLocation
      ? null
      : extracted?.interviewLocation || null,
    interviewMeetingUrl: existing?.interview_meeting_url || existing?.interviewMeetingUrl
      ? null
      : extracted?.interviewMeetingUrl || null,
  };
}


function extractInterviewType({ subject = '', text = '' }) {
  const content = `${subject}\n${extractCurrentMessageText(text)}`.slice(0, 100000);
  if (/\btechnical\b[^.!?\n]{0,40}\bpanel\b|\bpanel\b[^.!?\n]{0,40}\btechnical\b/i.test(content)) {
    return null;
  }
  const explicitTypes = [...content.matchAll(
    /\binterview\s+type\s*[:\-]\s*([^\r\n.;,]+)/gi
  )].map((match) => match[1].trim().toLowerCase().replace(/[^a-z]+/g, ''));
  if (explicitTypes.length) {
    const typeAliases = {
      phone: 'Phone',
      telephone: 'Phone',
      video: 'Video',
      virtual: 'Video',
      inperson: 'In-person',
      facetoface: 'In-person',
      onsite: 'In-person',
      technical: 'Technical',
      panel: 'Panel',
      other: 'Other',
    };
    const resolved = explicitTypes.map((type) => typeAliases[type] || null);
    const uniqueResolved = [...new Set(resolved)];
    return uniqueResolved.length === 1 && uniqueResolved[0]
      ? uniqueResolved[0]
      : null;
  }

  const matches = INTERVIEW_TYPE_PATTERNS
    .filter(({ pattern }) => pattern.test(content))
    .map(({ type }) => type);
  const uniqueMatches = [...new Set(matches)];
  return uniqueMatches.length === 1 ? uniqueMatches[0] : null;
}

function decodeHtmlAttribute(value) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function normalizeHttpUrl(value) {
  const candidate = String(value || '').trim().replace(/[),.;!?]+$/, '');

  try {
    const url = new URL(candidate);

    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function extractInterviewMeetingUrl({ text = '', html = '' }) {
  const plainText = extractCurrentMessageText(text).slice(0, 100000);
  const htmlText = typeof html === 'string'
    ? html
      .replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote\s*>/gi, '')
      .replace(/<(?:div|section)\b[^>]*(?:class=["'][^"']*(?:gmail_quote|yahoo_quoted|protonmail_quote)[^"']*["']|id=["']divRplyFwdMsg["'])[^>]*>[\s\S]*$/i, '')
      .replace(/<(?:div|span)\b[^>]*class=["'][^"']*moz-cite-prefix[^"']*["'][^>]*>[\s\S]*$/i, '')
      .slice(0, 100000)
    : '';
  const candidates = [];

  const meetingLinkContext =
    /\b(?:join|click|connect|enter|attend|open|access)\b[^.!?\n]{0,60}\b(?:meeting|interview|call|video|conference|zoom|teams|webex)\b|\b(?:meeting|interview|call|video|conference)\b[^.!?\n]{0,60}\b(?:link|url|join|below|here)\b|\b(?:zoom|teams|google meet|webex|whereby|gotomeet)\b[^.!?\n]{0,40}\b(?:meeting|interview|call|link|invitation)\b/i;
  const unrelatedLinkContext =
    /\b(?:application|apply)\s+(?:link|url|form)\b|\b(?:job description|careers page|privacy policy|company website)\b/i;

  const addCandidate = (rawUrl, context) => {
    const url = normalizeHttpUrl(rawUrl);
    if (!url) return;

    if (!meetingLinkContext.test(context) || unrelatedLinkContext.test(context)) return;

    candidates.push(url);
  };

  const urlPattern = /https?:\/\/[^\s<>"')]+/gi;
  let match;

  while ((match = urlPattern.exec(plainText)) !== null) {
    addCandidate(
      match[0],
      plainText.slice(
        Math.max(0, match.index - 100),
        match.index + match[0].length + 40,
      ),
    );
  }

  const anchorPattern =
    /<a\b([^>]*?)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))([^>]*)>([\s\S]*?)<\/a\s*>/gi;

  while ((match = anchorPattern.exec(htmlText)) !== null) {
    const rawUrl = match[2] || match[3] || match[4] || '';
    const anchorText = match[6].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

    const context =
      `${match[1]} ${anchorText} ${match[5]} ` +
      htmlText.slice(Math.max(0, match.index - 100), match.index);

    addCandidate(decodeHtmlAttribute(rawUrl), context);
  }

  const uniqueCandidates = [...new Set(candidates)];

  return uniqueCandidates.length === 1 ? uniqueCandidates[0] : null;
}

function extractInterviewLocation({ text = '' }) {
  const content = extractCurrentMessageText(text).slice(0, 100000);

  const detailsIndex = content.search(/\binterview\s+details\s*:/i);
  const labels = [
    ...content.matchAll(/\b(interview\s+)?(location|venue|address)\s*[:\-]\s*([^\r\n;]{3,240})/gi),
  ];
  const explicitLocation = labels.find((match) => {
    if (match[1]) return true;
    const prefix = content.slice(Math.max(0, match.index - 200), match.index);
    const sameBlock = detailsIndex >= 0 &&
      match.index >= detailsIndex &&
      match.index - detailsIndex <= 1200;
    return sameBlock || /\binterview\b[^\r\n.!?;]{0,180}[.!?]?\s*$/i.test(prefix);
  });

  if (explicitLocation) {
    return explicitLocation[3]
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.,;]+$/, '') || null;
  }

  const addressPattern =
    /\b\d{1,6}\s+[\w.'’#-]+(?:\s+[\w.'’#-]+){0,7}\s+(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|boulevard|blvd|way|crescent|close|place|plaza|parkway|pkwy)\b[^\r\n.!?]{0,100}/gi;

  const addresses = [...content.matchAll(addressPattern)]
    .filter((match) => {
      const prefix = content.slice(Math.max(0, match.index - 180), match.index);
      return /\b(?:interview|attend|venue)\b[^.!?;\n]{0,140}\b(?:at|held|take place|venue|address)\s*$/i.test(prefix);
    })
    .map((match) => match[0].replace(/\s+/g, ' ').trim().replace(/[.,;]+$/, ''));

  const uniqueAddresses = [...new Set(addresses)];

  return uniqueAddresses.length === 1 ? uniqueAddresses[0] : null;
}

function extractInterviewDetails(email) {
  return {
    ...extractInterviewDateTime(email),
    interviewType: extractInterviewType(email),
    interviewLocation: extractInterviewLocation(email),
    interviewMeetingUrl: extractInterviewMeetingUrl(email),
  };
}


function getInterviewDetailsToFill(existing, extracted) {
  return {
    interviewDate: existing?.interview_date
      ? null
      : extracted?.interviewDate || null,
    interviewTime: existing?.interview_time
      ? null
      : extracted?.interviewTime || null,
    interviewType: existing?.interview_type || existing?.interviewType
      ? null
      : extracted?.interviewType || null,
    interviewLocation: existing?.interview_location || existing?.interviewLocation
      ? null
      : extracted?.interviewLocation || null,
    interviewMeetingUrl: existing?.interview_meeting_url || existing?.interviewMeetingUrl
      ? null
      : extracted?.interviewMeetingUrl || null,
  };
}

function getInterviewDetailsToUpdate(existing, extracted) {
  const existingDate = existing?.interview_date
    ? String(existing.interview_date).slice(0, 10)
    : null;

  const existingTime = existing?.interview_time
    ? String(existing.interview_time).slice(0, 5)
    : null;

  const existingType =
    existing?.interview_type || existing?.interviewType || null;

  const existingLocation =
    existing?.interview_location || existing?.interviewLocation || null;

  const existingMeetingUrl =
    existing?.interview_meeting_url || existing?.interviewMeetingUrl || null;

  return {
    interviewDate:
      extracted?.interviewDate && extracted.interviewDate !== existingDate
        ? extracted.interviewDate
        : null,
    interviewTime:
      extracted?.interviewTime && extracted.interviewTime !== existingTime
        ? extracted.interviewTime
        : null,
    interviewType:
      extracted?.interviewType && extracted.interviewType !== existingType
        ? extracted.interviewType
        : null,
    interviewLocation:
      extracted?.interviewLocation && extracted.interviewLocation !== existingLocation
        ? extracted.interviewLocation
        : null,
    interviewMeetingUrl:
      extracted?.interviewMeetingUrl && extracted.interviewMeetingUrl !== existingMeetingUrl
        ? extracted.interviewMeetingUrl
        : null,
  };
}
module.exports = {
  classifyApplicationEmail,
  isGenericJobAlert,
  extractCurrentMessageText,
  extractInterviewDateTime,
  extractInterviewDetails,
  extractInterviewLocation,
  extractInterviewMeetingUrl,
  extractInterviewType,
  getInterviewDetailsToFill,
  getInterviewDetailsToUpdate,
};
