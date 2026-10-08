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
    ],
  },
  {
    status: 'Interview',
    patterns: [
      /invited? you to (?:an? )?interview/i,
      /interview invitation/i,
      /schedule an interview/i,
      /interview.{0,30}invitation/i,
      /would like to interview you/i,
      /interview.{0,20}availability/i,
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
];

function classifyApplicationEmail({ subject = '', text = '' }) {
  const searchableText = `${subject}\n${text}`.slice(0, 100000);

  for (const rule of STATUS_RULES) {
    const matchedPattern = rule.patterns.find((pattern) => pattern.test(searchableText));
    if (matchedPattern) {
      return {
        status: rule.status,
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
const MONTH_PATTERN = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';
const DATE_PATTERNS = [
  {
    regex: new RegExp(`\\b(\\d{1,2})\\s+${MONTH_PATTERN}\\.?[,]?\\s+(\\d{4})\\b`, 'gi'),
    parse: (match) => ({ day: Number(match[1]), month: monthNumber(match[2]), year: Number(match[3]) }),
  },
  {
    regex: new RegExp(`\\b${MONTH_PATTERN}\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'gi'),
    parse: (match) => ({ day: Number(match[2]), month: monthNumber(match[1]), year: Number(match[3]) }),
  },
  {
    regex: /\b(\d{4})-(\d{2})-(\d{2})\b/g,
    parse: (match) => ({ year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }),
  },
  {
    regex: /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g,
    parse: (match) => {
      const first = Number(match[1]);
      const second = Number(match[2]);
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
  { type: 'Phone', pattern: /\b(?:interview\s+)?type\s*[:\-]\s*(?:phone|telephone)\b|\b(?:phone|telephone)\s+(?:screen|interview|call)\b|\binterview\b[^.!?\n]{0,30}\b(?:by|via|over)\s+(?:phone|telephone)\b/i },
  { type: 'Video', pattern: /\b(?:interview\s+)?type\s*[:\-]\s*(?:video|virtual)\b|\b(?:video|virtual)\s+(?:interview|call|meeting)\b|\binterview\b[^.!?\n]{0,30}\b(?:by|via|over)\s+(?:video|zoom|teams|google meet)\b/i },
  { type: 'In-person', pattern: /\b(?:interview\s+)?type\s*[:\-]\s*(?:in[\s-]?person|face[\s-]?to[\s-]?face|on[\s-]?site)\b|\b(?:in[\s-]?person|face[\s-]?to[\s-]?face|on[\s-]?site)\s+(?:interview|meeting)\b|\binterview\b[^.!?\n]{0,30}\b(?:in[\s-]?person|on[\s-]?site)\b/i },
  { type: 'Technical', pattern: /\b(?:interview\s+)?type\s*[:\-]\s*technical\b|\btechnical\s+interview\b/i },
  { type: 'Panel', pattern: /\b(?:interview\s+)?type\s*[:\-]\s*panel\b|\bpanel\s+interview\b/i },
  { type: 'Other', pattern: /\binterview\s+type\s*[:\-]\s*other\b/i },
];

function monthNumber(value) {
  const normalized = value.toLowerCase().replace(/\.$/, '');
  if (normalized === 'sept') return 9;
  const index = MONTHS.findIndex((month) =>
    month === normalized || month.slice(0, 3) === normalized
  );
  return index + 1;
}

function isValidDate({ year, month, day }) {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function getSentenceBounds(text, start, end) {
  let sentenceStart = start;
  while (sentenceStart > 0 && !/[.!?\n]/.test(text[sentenceStart - 1])) sentenceStart -= 1;
  let sentenceEnd = end;
  while (sentenceEnd < text.length && !/[.!?\n]/.test(text[sentenceEnd])) sentenceEnd += 1;
  return { start: sentenceStart, end: sentenceEnd };
}

function interviewDateIsExplicitlyAssociated(prefix) {
  const recentPrefix = prefix.slice(-120);
  return (
    /\binterview(?:\s+invitation)?\s*[:\-]\s*$/i.test(recentPrefix) ||
    /\binterview\s+date\s*[:\-]\s*$/i.test(recentPrefix) ||
    /\binterview\b[^.!?\n]{0,90}\b(?:scheduled|set|booked|planned|held|takes place|will take place)\b[^.!?\n]{0,45}\b(?:for|on)\s*$/i.test(recentPrefix) ||
    /\binterview\s+(?:date\s*)?(?:is\s+)?(?:on|for)\s+(?:the\s+)?$/i.test(recentPrefix) ||
    /\binterview\s+will\s+be\s+(?:held\s+)?(?:on|for)\s*$/i.test(recentPrefix)
  );
}

function timezoneOffsetMinutes(zone) {
  if (!zone) return null;
  const normalized = zone.toUpperCase().replace(/\s+/g, '');
  if (Object.hasOwn(TIMEZONE_OFFSETS, normalized)) return TIMEZONE_OFFSETS[normalized];
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
  if (offset === null || offset === 120) {
    return {
      date: `${dateParts.year}-${String(dateParts.month).padStart(2, '0')}-${String(dateParts.day).padStart(2, '0')}`,
      time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    };
  }

  const instant = Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, hour, minute) - offset * 60000;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Johannesburg',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(instant))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function parseTime(match, zone) {
  let hour = Number(match[1]);
  const period = match[3] ? match[3].toLowerCase().replace(/\./g, '') : '';
  const minute = match[2] === undefined ? (period ? 0 : null) : Number(match[2]);
  if (minute === null) return null;
  if (minute > 59) return null;

  if (period) {
    if (hour < 1 || hour > 12) return null;
    if (period === 'pm' && hour !== 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }

  return { hour, minute, zone };
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
  };
}

function extractInterviewType({ subject = '', text = '' }) {
  const content = `${subject}\n${text}`.slice(0, 100000);
  return INTERVIEW_TYPE_PATTERNS.find(({ pattern }) => pattern.test(content))?.type || null;
}

function extractInterviewDateTime({ subject = '', text = '' }) {
  const content = `${subject}\n${text}`.slice(0, 100000);
  const dates = [];

  for (const pattern of DATE_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(content)) !== null) {
      const parsedDate = pattern.parse(match);
      if (!parsedDate || !isValidDate(parsedDate)) continue;
      const bounds = getSentenceBounds(content, match.index, pattern.regex.lastIndex);
      const prefix = content.slice(bounds.start, match.index);
      if (!interviewDateIsExplicitlyAssociated(prefix)) continue;

      const suffix = content.slice(pattern.regex.lastIndex, Math.min(bounds.end, pattern.regex.lastIndex + 80));
      const timeMatch = /^\s*(?:at|from|@|,)\s*(\d{1,2})(?::(\d{2}))?(?:\s*([ap]\.?(?:m)\.?))?/i.exec(suffix);
      const zoneMatch = timeMatch
        ? /^\s*\(?\s*((?:UTC|GMT)[+-]\d{1,2}(?::?\d{2})?|[A-Z]{1,5})\s*\)?/.exec(suffix.slice(timeMatch[0].length))
        : null;
      const parsedTime = timeMatch
        ? parseTime(timeMatch, zoneMatch?.[1])
        : null;
      const converted = parsedTime
        ? asSast(parsedDate, parsedTime.hour, parsedTime.minute, parsedTime.zone)
        : null;

      dates.push({
        date: `${parsedDate.year}-${String(parsedDate.month).padStart(2, '0')}-${String(parsedDate.day).padStart(2, '0')}`,
        time: parsedTime && converted ? converted.time : null,
        convertedDate: parsedTime && converted ? converted.date : null,
        hasUnsupportedTimezone: Boolean(parsedTime && !converted),
      });
    }
  }

  if (dates.length !== 1) {
    return { interviewDate: null, interviewTime: null, ambiguous: dates.length > 1 };
  }

  const candidate = dates[0];
  return {
    interviewDate: candidate.convertedDate || candidate.date,
    interviewTime: candidate.time,
    ambiguous: false,
    hasUnsupportedTimezone: candidate.hasUnsupportedTimezone,
  };
}

module.exports = {
  classifyApplicationEmail,
  extractInterviewDateTime,
  extractInterviewType,
  getInterviewDetailsToFill,
};