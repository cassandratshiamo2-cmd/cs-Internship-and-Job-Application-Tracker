const assert = require('node:assert/strict');
const test = require('node:test');
const {
  calculateInterviewReminderSchedule,
  interviewDateTimeToInstant,
} = require('../interview-reminder-schedule');

test('converts October 2 interview time from SAST to the correct UTC instant', function () {
  const interviewAt = interviewDateTimeToInstant('2026-10-02', '08:30');

  assert.equal(interviewAt.toISOString(), '2026-10-02T06:30:00.000Z');
});

test('schedules the October 2 interview reminder at October 1 08:30 SAST', function () {
  const interviewAt = interviewDateTimeToInstant('2026-10-02', '08:30');
  const result = calculateInterviewReminderSchedule(
    interviewAt,
    new Date('2026-09-29T10:00:00.000Z')
  );

  assert.equal(result.isPast, false);
  assert.equal(result.isCatchUp, false);
  assert.equal(result.scheduledAt.toISOString(), '2026-10-01T06:30:00.000Z');
});

test('schedules the October 1 interview reminder at September 30 08:30 SAST', function () {
  const interviewAt = interviewDateTimeToInstant('2026-10-01', '08:30');
  const result = calculateInterviewReminderSchedule(
    interviewAt,
    new Date('2026-09-29T10:00:00.000Z')
  );

  assert.equal(result.isPast, false);
  assert.equal(result.isCatchUp, false);
  assert.equal(result.scheduledAt.toISOString(), '2026-09-30T06:30:00.000Z');
});

test('schedules one immediate reminder for an interview less than 24 hours away', function () {
  const currentTime = new Date('2026-09-29T09:03:00.000Z');
  const interviewAt = interviewDateTimeToInstant('2026-09-29', '11:30');
  const result = calculateInterviewReminderSchedule(
    interviewAt,
    currentTime
  );

  assert.equal(result.isPast, false);
  assert.equal(result.isCatchUp, true);
  assert.equal(result.scheduledAt.toISOString(), currentTime.toISOString());
});

test('does not schedule a reminder after the interview has passed', function () {
  const tuesdayAtNoonSast = new Date('2026-09-29T10:00:00.000Z');
  const interviewAt = interviewDateTimeToInstant('2026-09-29', '11:30');
  const result = calculateInterviewReminderSchedule(
    interviewAt,
    tuesdayAtNoonSast
  );

  assert.equal(result.isPast, true);
  assert.equal(result.isCatchUp, false);
  assert.equal(result.scheduledAt, null);
});

test('repeated scheduling input produces the same interview and reminder instants', function () {
  const interviewAt = interviewDateTimeToInstant('2026-10-02', '08:30');
  const currentTime = new Date('2026-09-29T10:00:00.000Z');
  const first = calculateInterviewReminderSchedule(interviewAt, currentTime);
  const second = calculateInterviewReminderSchedule(
    interviewDateTimeToInstant('2026-10-02', '08:30'),
    currentTime
  );

  assert.equal(first.scheduledAt.toISOString(), second.scheduledAt.toISOString());
  assert.equal(interviewAt.toISOString(), '2026-10-02T06:30:00.000Z');
});

test('rejects invalid interview date/time values', function () {
  assert.throws(
    function () {
      interviewDateTimeToInstant('2026-10-02', '25:99');
    },
    TypeError
  );
});