# cs-Internship-and-Job-Application-Tracker

## Interview email and phone reminders

Users can store an optional international phone number during registration or when selecting
SMS for an interview. The interview form can send reminders by email through Resend and by SMS through Twilio.
Copy `server/.env.example` to `server/.env`, add provider credentials, then start the
Express server with `node server/server.js`. Do not put provider keys in the client `.env`
file or commit `server/.env`.

Use an email address verified by Resend for `NOTIFICATION_FROM_EMAIL`. Twilio phone numbers
must use international E.164 format, for example `+27123456789`; numbers from any country
supported by Twilio are accepted. Future reminders are stored in the Neon `notification_jobs`
table and processed by the Express worker every 30 seconds. The worker uses PostgreSQL row
locking so multiple Render instances cannot claim the same pending job. Failed provider calls
are retried up to three times and then marked failed for inspection.