# cs-Internship-and-Job-Application-Tracker

## Interview email and phone reminders

The interview form can send reminders by email through Resend and by SMS through Twilio.
Copy `server/.env.example` to `server/.env`, add provider credentials, then start the
Express server with `node server/server.js`. Do not put provider keys in the client `.env`
file or commit `server/.env`.

Use an email address verified by Resend for `NOTIFICATION_FROM_EMAIL`. Twilio phone numbers
must use international format, for example `+27123456789`. If a provider is not configured,
the interview is still saved and the app reports that external delivery was unavailable.