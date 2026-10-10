# ApplyFlow Privacy Policy and Terms Pages

## Objective

Create two public, static Next.js pages for the existing ApplyFlow site:

- `/privacy` — a plain-language privacy policy grounded in the current implementation.
- `/terms` — terms covering the service purpose, user responsibilities, account security,
  acceptable use, service limitations, and termination.

Both pages must render without login. Keep the changes limited to the frontend pages and
public navigation links; do not modify Gmail integration, authentication, backend behavior,
or other existing features.

## Implementation

1. Before writing code, consult the relevant Next.js App Router documentation in the
   installed `node_modules/next/dist/docs/`, as required by the project instructions.
2. Add the pages under `client/my-app/app/privacy/page.tsx` and
   `client/my-app/app/terms/page.tsx`.
3. Match the existing ApplyFlow pastel-sunset styling: use the current Tailwind conventions,
   gradient palette, rounded white cards, subtle shadows, readable typography, and responsive
   spacing. Use semantic headings, landmarks, and links.
4. Make the legal pages discoverable from the public home page with links to both routes.
   Do not add an authentication guard or client-side data dependency to either legal page.
5. Set route-specific page titles/descriptions using the existing Next.js metadata conventions.

## Privacy policy facts to reflect

- ApplyFlow accounts use a name, email address, optional phone number, and a bcrypt-hashed
  password. The server stores account and application records in PostgreSQL. Application
  records include company, position, application date/type/status, work arrangement, notes,
  and any saved application/interview/notification details.
- The Gmail connection requests only Google's
  `https://www.googleapis.com/auth/gmail.readonly` permission. Do not imply it can send,
  modify, or delete Gmail messages.
- Gmail sync retrieves messages through the Gmail API. Initial sync covers recent messages
  from the preceding 30 days, with later syncs checking Gmail history. The server parses
  message sender, subject, and text in memory (up to 100,000 characters) to recognize
  application-status updates and interview details, then compares those details with the
  user's applications. It can update an application or place an item in the user's review
  queue.
- Gmail processing does not store the message body in the ApplyFlow database. It stores
  processing records such as Gmail message/thread IDs, sender, subject, received/processed
  times, detected status/interview details, confidence, review outcome/reason, and related
  application IDs.
- OAuth access and refresh tokens are stored encrypted with AES-256-GCM in the configured
  database. The Gmail address and connection/sync status are also stored.
- Users can disconnect from the authenticated Gmail page (`/gmail`). Disconnect attempts to
  revoke the refresh token with Google, clears stored Gmail tokens and address, and stops
  future Gmail syncing. It does not delete previously stored Gmail processing records.
- Application deletion removes the application and its notification jobs, but associated
  Gmail processing history is retained with its application reference cleared.
- In-app notification jobs and interview reminder details are stored. If email reminders are
  configured, ApplyFlow sends the reminder email through Resend to the user's chosen address;
  the email contains the company, position, and interview date/time.
- Do not promise a specific hosting/database region, a fixed retention period, no sharing, or
  account self-service deletion. The implementation has no configured retention schedule or
  self-service account-deletion endpoint. Explain that account/deletion requests must go to
  the operator of the ApplyFlow deployment, while distinguishing application deletion and
  Gmail disconnection from account deletion. Do not invent a support email address.
- Describe storage/sharing narrowly and factually: configured PostgreSQL stores the
  implementation's records; Google receives OAuth/Gmail API requests for the connected
  mailbox; Resend receives configured email reminders. Avoid unsupported privacy/security
  guarantees.

## Terms content

Explain that ApplyFlow helps users organize job and internship applications and that the
current service depends on availability of its website, API, Google Gmail access (if
connected), and optional email-reminder provider. Users must provide accurate information,
protect their login credentials and bearer token/device, use the service lawfully, connect
only a Gmail account they are authorized to access, and review automatically detected
application updates. Prohibit unauthorized access, abuse, disruption, and unlawful use.
Clarify that tracking and detected updates are organizational aids, not guarantees of
accuracy, delivery, employment, or uninterrupted service. Explain that users can stop
using the site, delete individual applications, and disconnect Gmail, while account
termination/deletion is not available through a self-service account endpoint and must be
handled by the deployment operator. Avoid unsupported warranties, liability provisions, or
claims about jurisdiction/age that have not been specified.

## Validation

Run the frontend's existing Next.js build from the repository root (`npm run build`).
Confirm both public routes build successfully. Do not change dependencies or backend files.
