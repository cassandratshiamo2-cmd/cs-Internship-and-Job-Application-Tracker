const test = require('node:test');
const assert = require('node:assert/strict');
const { hasRecruitmentActivityChanged } = require('../recruitment-activity');

const current = {
  status: 'Interview',
  interview_date: '2026-10-22',
  interview_time: '10:30:00',
  interview_type: 'Video',
  interview_location: 'Teams',
  interview_meeting_url: 'https://meet.example.test/one',
};

test('status and material interview changes count as recruitment activity', () => {
  assert.equal(hasRecruitmentActivityChanged(current, {
    status: 'Offer',
    interviewDate: '2026-10-22',
    interviewTime: '10:30',
    interviewType: 'Video',
    interviewLocation: 'Teams',
    interviewMeetingUrl: 'https://meet.example.test/one',
  }), true);
  assert.equal(hasRecruitmentActivityChanged(current, {
    status: 'Interview',
    interviewDate: '2026-10-23',
    interviewTime: '10:30',
    interviewType: 'Video',
    interviewLocation: 'Teams',
    interviewMeetingUrl: 'https://meet.example.test/one',
  }), true);
  assert.equal(hasRecruitmentActivityChanged(current, {
    status: 'Interview',
    interviewDate: '2026-10-22',
    interviewTime: '10:31',
    interviewType: 'Video',
    interviewLocation: 'Teams',
    interviewMeetingUrl: 'https://meet.example.test/one',
  }), true);
});

test('time seconds and unrelated application fields do not count as activity', () => {
  assert.equal(hasRecruitmentActivityChanged(current, {
    status: 'Interview',
    interviewDate: '2026-10-22',
    interviewTime: '10:30',
    interviewType: 'Video',
    interviewLocation: 'Teams',
    interviewMeetingUrl: 'https://meet.example.test/one',
  }), false);
});
