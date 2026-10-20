function normalizeTime(value) {
  return value ? String(value).slice(0, 5) : null;
}

function hasRecruitmentActivityChanged(current, next) {
  if (current.status !== next.status) {
    return true;
  }

  return (
    String(current.interview_date || '') !== String(next.interviewDate || '') ||
    normalizeTime(current.interview_time) !== normalizeTime(next.interviewTime) ||
    String(current.interview_type || '') !== String(next.interviewType || '') ||
    String(current.interview_location || '') !== String(next.interviewLocation || '') ||
    String(current.interview_meeting_url || '') !== String(next.interviewMeetingUrl || '')
  );
}

module.exports = { hasRecruitmentActivityChanged };
