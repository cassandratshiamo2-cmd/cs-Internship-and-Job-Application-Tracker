const REMINDER_LEAD_TIME_MS = 24 * 60 * 60 * 1000;
const INTERVIEW_TIME_ZONE = 'Africa/Johannesburg';
const interviewTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: INTERVIEW_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function getTimeZoneParts(instant) {
  return Object.fromEntries(
    interviewTimeFormatter
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );
}

function interviewDateTimeToInstant(interviewDate, interviewTime) {
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(interviewDate));
  const timeParts = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(interviewTime));

  if (!dateParts || !timeParts) {
    throw new TypeError('Interview date and time must use YYYY-MM-DD and HH:mm formats.');
  }

  const [, yearText, monthText, dayText] = dateParts;
  const [, hourText, minuteText, secondText = '00'] = timeParts;
  const target = {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hour: Number(hourText),
    minute: Number(minuteText),
    second: Number(secondText),
  };

  const wallTimeAsUtc = new Date(0);
  wallTimeAsUtc.setUTCFullYear(target.year, target.month - 1, target.day);
  wallTimeAsUtc.setUTCHours(target.hour, target.minute, target.second, 0);

  if (
    wallTimeAsUtc.getUTCFullYear() !== target.year ||
    wallTimeAsUtc.getUTCMonth() !== target.month - 1 ||
    wallTimeAsUtc.getUTCDate() !== target.day ||
    target.hour > 23 ||
    target.minute > 59 ||
    target.second > 59
  ) {
    throw new TypeError('Interview date and time are invalid.');
  }

  let instantTime = wallTimeAsUtc.getTime();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const localParts = getTimeZoneParts(new Date(instantTime));
    const representedWallTime = new Date(0);
    representedWallTime.setUTCFullYear(
      localParts.year,
      localParts.month - 1,
      localParts.day
    );
    representedWallTime.setUTCHours(
      localParts.hour,
      localParts.minute,
      localParts.second,
      0
    );

    const adjustment = wallTimeAsUtc.getTime() - representedWallTime.getTime();
    if (adjustment === 0) {
      return new Date(instantTime);
    }

    instantTime += adjustment;
  }

  throw new RangeError('Interview date and time could not be resolved in Africa/Johannesburg.');
}

function calculateInterviewReminderSchedule(interviewAt, now) {
  const interviewTime = new Date(interviewAt).getTime();
  const currentTime = new Date(now).getTime();

  if (!Number.isFinite(interviewTime) || !Number.isFinite(currentTime)) {
    throw new TypeError('Interview and current times must be valid dates.');
  }

  if (interviewTime <= currentTime) {
    return {
      isPast: true,
      isCatchUp: false,
      scheduledAt: null,
    };
  }

  const normalReminderTime = interviewTime - REMINDER_LEAD_TIME_MS;
  const isCatchUp = normalReminderTime <= currentTime;

  return {
    isPast: false,
    isCatchUp,
    scheduledAt: new Date(
      isCatchUp ? currentTime : normalReminderTime
    ),
  };
}

module.exports = {
  calculateInterviewReminderSchedule,
  interviewDateTimeToInstant,
};