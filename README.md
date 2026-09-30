# ApplyFlow – Internship & Job Application Tracker

ApplyFlow is a web application for students, graduates, and job seekers to organize internship, Work-Integrated Learning (WIL), graduate job, and full-time job applications. Users can track application progress, manage interview details, and receive in-app interview reminders.

## Features

### User Authentication

- Register and log in with an email address and password.
- Passwords are hashed by the backend.
- Protected application and notification endpoints use JWT authentication.

### Application Management

- Create, view, edit, and delete applications.
- Record the company, position, application date, type, status, work arrangement, notes, and optional job link.
- Search applications and filter them by status, type, and work arrangement.
- Track statuses including Saved, Applied, Assessment, Shortlisted, Interview, Offer, Rejected, and Withdrawn.

### Dashboard

- View application totals and counts for applications, interviews, and offers.
- Review recent applications and progress by status.

### Interview Management

- Add an interview date, time, and interview type to an application.
- View upcoming and past interview details.
- Interview dates and times use South African Standard Time (SAST) in the Africa/Johannesburg time zone.

### In-App Notifications

- Receive in-app reminders for scheduled interviews.
- View notification status and mark sent notifications as read.
- See unread notification counts in the application navigation.

## Technology Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Backend: Node.js, Express.js
- Database: PostgreSQL
- Development Tools: Visual Studio Code, Git, GitHub, npm

## Project Structure

- `client/my-app/app/`: Next.js pages and routes
- `client/my-app/components/`: Shared interface components
- `client/my-app/lib/`: Client types, mock data, and notification API helpers
- `server/server.js`: Express API and notification worker
- `server/interview-reminder-schedule.js`: Interview time conversion and reminder scheduling
- `server/test/`: Reminder scheduling tests

## Running the Project Locally

### Prerequisites

- Node.js and npm
- A PostgreSQL database

### Start the Backend

In a terminal from the repository root:

```sh
cd server
npm install
npm run dev
```

Configure the backend environment variables before starting the server. The backend runs at [http://localhost:5000](http://localhost:5000/).

### Start the Frontend

In a second terminal from the repository root:

```sh
cd client/my-app
npm install
npm run dev
```

The frontend runs at [http://localhost:3000](http://localhost:3000/).

## Environment Variables

Create `server/.env` for backend settings and `client/my-app/.env.local` for frontend settings. Use your own values and do not commit environment files or secrets.

| Variable | Application | Description |
| --- | --- | --- |
| `DATABASE_URL` | Backend | PostgreSQL connection string. Required for the API and notification queue. |
| `JWT_SECRET` | Backend | Secret used to sign and verify authentication tokens. Set a strong value for local use; do not rely on the development fallback outside local development. |
| `PORT` | Backend | Optional API port. Defaults to `5000`. |
| `CLIENT_URL` | Backend | Optional allowed frontend origin for CORS. Defaults to `http://localhost:3000`. |
| `NEXT_PUBLIC_API_URL` | Frontend | Optional backend base URL. Defaults to `http://localhost:5000`. |
| `RESEND_API_KEY` | Backend | Optional email-provider configuration retained by the server. It does not make email selectable for interview reminders. |
| `NOTIFICATION_FROM_EMAIL` | Backend | Optional sender address used with the email-provider configuration. |

## Application Workflow

1. Register an account and log in.
2. Add applications and record their details and current status.
3. Update application details as the application progresses.
4. For an interview, set the application status to Interview and enter its date, time, and type.
5. Review interview details and in-app reminders, then mark notifications as read when appropriate.

## Purpose of the Project

ApplyFlow provides one place to manage a job search, helping users keep application details, progress, interviews, and reminders organized.

## Current Notification Support

- Interview reminders are delivered as in-app notifications backed by the PostgreSQL notification queue and server worker.
- Reminders are scheduled for 24 hours before an interview. If an interview is less than 24 hours away, its reminder is scheduled as soon as possible.
- Interview dates and times are interpreted in the Africa/Johannesburg time zone (SAST).
- Only In-app is available as an interview reminder channel in the current application.

## Project Repository

[ApplyFlow on GitHub](https://github.com/cassandratshiamo2-cmd/cs-Internship-and-Job-Application-Tracker)
