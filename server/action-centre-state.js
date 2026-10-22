const { interviewDateTimeToInstant } = require('./interview-reminder-schedule');

const TIME_ZONE = 'Africa/Johannesburg';
const FOLLOW_UP_STATUSES = new Set(['Applied', 'Assessment', 'Shortlisted']);
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function parseDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return date;
}

function calendarDay(timestamp) {
  const parts = Object.fromEntries(
    dateFormatter.formatToParts(new Date(timestamp))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function getApplicationActionCycle(kind, application, now = new Date()) {
  const id = String(application.id);
  if (kind === 'follow-up' || kind === 'urgent-follow-up') {
    const activity = new Date(application.recruitment_activity_at).getTime();
    if (!FOLLOW_UP_STATUSES.has(application.status) || !Number.isFinite(activity)) return null;
    const days = Math.floor((calendarDay(now.getTime()) - calendarDay(activity)) / 86400000);
    if (days < 7 || (kind === 'urgent-follow-up') !== (days >= 14)) return null;
    return `follow-up:${id}:${new Date(activity).toISOString()}`;
  }

  if (kind === 'upcoming-interview' || kind === 'past-interview') {
    if (application.status !== 'Interview') return null;
    const date = parseDateKey(application.interview_date);
    const time = String(application.interview_time || '').slice(0, 5);
    if (!date || !/^\d{2}:\d{2}$/.test(time)) return null;
    let instant;
    try {
      instant = interviewDateTimeToInstant(application.interview_date, time).getTime();
    } catch {
      return null;
    }
    const isPast = instant <= now.getTime();
    if ((kind === 'past-interview') !== isPast) return null;
    if (!isPast && Math.floor((calendarDay(instant) - calendarDay(now.getTime())) / 86400000) > 14) {
      return null;
    }
    return `interview:${id}:${instant}`;
  }

  if (kind === 'interview-details') {
    if (application.status !== 'Interview') return null;
    const date = parseDateKey(application.interview_date);
    const time = String(application.interview_time || '').slice(0, 5);
    if (date && /^\d{2}:\d{2}$/.test(time)) return null;
    return `interview-details:${id}:${application.interview_date || 'missing'}:${application.interview_time || 'missing'}`;
  }

  if (kind === 'saved-opportunity' && application.status === 'Saved') {
    return `saved:${id}`;
  }

  return null;
}

function getSnoozeUntil(preset, now = new Date()) {
  if (preset !== 'tomorrow' && preset !== 'one-week') return null;
  const parts = Object.fromEntries(
    dateFormatter.formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );
  const targetDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + (preset === 'tomorrow' ? 1 : 7)));
  const dateKey = `${targetDate.getUTCFullYear()}-${String(targetDate.getUTCMonth() + 1).padStart(2, '0')}-${String(targetDate.getUTCDate()).padStart(2, '0')}`;
  return interviewDateTimeToInstant(dateKey, timeFormatter.format(now));
}

module.exports = { getApplicationActionCycle, getSnoozeUntil };
