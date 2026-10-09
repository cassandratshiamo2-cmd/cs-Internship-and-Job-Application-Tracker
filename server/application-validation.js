const APPLICATION_TYPES = new Set([
  'Internship',
  'WIL',
  'Graduate Job',
  'Full-Time Job',
  'Job',
]);
const APPLICATION_STATUSES = new Set([
  'Saved',
  'Applied',
  'Assessment',
  'Shortlisted',
  'Interview',
  'Offer',
  'Rejected',
  'Withdrawn',
]);
const WORK_ARRANGEMENTS = new Set(['Remote', 'Hybrid', 'Onsite']);
const INTERVIEW_TYPES = new Set(['Phone', 'Video', 'In-person', 'Technical', 'Panel', 'Other']);

function isValidDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function isValidTime(value) {
  return typeof value === 'string' &&
    /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/.test(value);
}

function validateApplicationInput(fields) {
  if (
    !fields.company ||
    !fields.position ||
    !fields.date ||
    !fields.type ||
    !fields.status ||
    !fields.arrangement ||
    !fields.notes
  ) {
    return 'Please complete all required fields.';
  }
  if (!isValidDateOnly(fields.date)) {
    return 'Enter a valid application date.';
  }
  if (!APPLICATION_TYPES.has(fields.type)) {
    return 'Choose a valid application type.';
  }
  if (!APPLICATION_STATUSES.has(fields.status)) {
    return 'Choose a valid application status.';
  }
  if (!WORK_ARRANGEMENTS.has(fields.arrangement)) {
    return 'Choose a valid work arrangement.';
  }
  if (fields.applicationLink && !/^https?:\/\//i.test(fields.applicationLink)) {
    return 'The application link must start with http:// or https://.';
  }
  if (fields.interviewEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.interviewEmail)) {
    return 'Enter a valid interview contact email.';
  }
  if (fields.status === 'Interview') {
    if (!fields.interviewDate || !fields.interviewTime || !fields.interviewType) {
      return 'Add the interview date, time, and type before saving an interview application.';
    }
    if (!isValidDateOnly(fields.interviewDate) || !isValidTime(fields.interviewTime)) {
      return 'Enter a valid interview date and time.';
    }
    if (!INTERVIEW_TYPES.has(fields.interviewType)) {
      return 'Choose a valid interview type.';
    }
  }
  return null;
}

module.exports = { isValidDateOnly, isValidTime, validateApplicationInput };
