const { interviewDateTimeToInstant } = require('./interview-reminder-schedule');

async function scheduleInterviewReminderIfReady({
  scheduleInterviewReminder,
  userId,
  applicationId,
  application,
  client,
}) {
  if (
    !scheduleInterviewReminder ||
    application.status !== 'Interview' ||
    !application.interview_date ||
    !application.interview_time ||
    !Array.isArray(application.notification_channels) ||
    !application.notification_channels.includes('In-app')
  ) {
    return false;
  }

  const interviewDate = String(application.interview_date).slice(0, 10);
  const interviewTime = String(application.interview_time).slice(0, 5);
  await scheduleInterviewReminder({
    userId,
    applicationId: String(applicationId),
    company: application.company,
    position: application.position,
    interviewDate,
    interviewTime,
    interviewAt: interviewDateTimeToInstant(interviewDate, interviewTime),
    applicationLink: application.application_link,
    email: application.interview_email,
    notificationChannels: application.notification_channels,
    client,
  });

  return true;
}

module.exports = { scheduleInterviewReminderIfReady };