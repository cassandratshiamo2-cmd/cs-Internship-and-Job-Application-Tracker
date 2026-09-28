# AGENTS.md

You are a principal-level engineer building ApplyFlow, a centralized job/internship
application tracker for students, graduates, and job seekers.

Your job: understand the request, use the right skills, write a clear implementation
prompt, get approval, then implement.

## 1. Workflow

1. Read AGENTS.md.
2. Read the skills named in the prompt + any clearly needed supporting skills.
3. Inspect relevant code.
4. Ask a focused question only if there's real ambiguity.
5. Write a detailed prompt file in prompts/.
6. Ask: "I prepared the implementation prompt at prompts/<name>.md. Good to execute?"
7. Implement only after approval.
8. Run available checks.
9. Share exact test steps.

## 2. Product

Users record, organize, and monitor internship/WIL/graduate/full-time job applications
through a single dashboard: status tracking, interviews, and notifications.

**Current submission scope is Sprint 1–4 only** (Requirements → UI/UX → Project Setup →
Frontend Development). This is a mock-data-driven frontend prototype, not a connected
full-stack app yet.

In scope for Sprint 1–4: registration/login UI with validation and the failed-attempt lockout
prototype, dashboard with mock data, applications list with search/filter, add/edit/delete
application flows, interviews and notifications pages, responsive pastel-sunset UI.

Explicitly out of scope right now: CV/resume builder, automatic job searching, automatic job
application submission, calendar integration, AI job recommendations, external job-site
integration, automated email functionality, full production auth implementation, production
database integration. Do not implement full backend functionality before the frontend is
ready, and do not prematurely connect the database — these are future phases (5–10), not this
one.

## 3. Architecture

- Client (Next.js) and server (Express, prepared but not wired to the frontend yet) stay
  separated — preserve this split even while only the frontend is being built.
- Frontend uses mock data for Sprint 1–4; do not silently start calling a real backend before
  Phase 5 (Backend/API Development) is explicitly scoped.
- Intended production architecture (future phases): Next.js/React client → Express.js REST
  API → PostgreSQL/Neon.

## 4. Tech stack

Use (current Sprint 1–4 scope):
- Next.js, React, TypeScript, HTML/CSS, Tailwind CSS — frontend only for this phase.

Reserved for future phases — do not use yet: Node.js/Express.js REST API, PostgreSQL/Neon,
JWT, bcrypt. Wire these in only once Phase 5 onward is explicitly scoped.

Do not use: any payment, calendar, AI-recommendation, or external job-site integration
library — all explicitly out of scope.

## 5. Data model

Sprint 1–4 uses mock data only — no persistence layer yet. Each application record (mock or
future-real) needs: company name, position/job title, application date, application type
(`Internship`|`WIL`|`Graduate Job`|`Full-Time Job`), application status (`Saved`|`Applied`|
`Assessment`|`Shortlisted`|`Interview`|`Offer`|`Rejected`|`Withdrawn`), work arrangement
(`Remote`|`Hybrid`|`Onsite`), additional notes.

## 6. API contracts

None yet — Sprint 1–4 is frontend-only with mock data. Do not write API routes before Phase 5
explicitly scopes the backend/API work.

## 7. Security

Even in this frontend-only phase: real passwords must not be stored in plain text, secrets
must not be exposed, API keys must not be hard-coded, database credentials must not be
exposed, `.env` secrets must not be committed.

Failed-login lockout prototype (frontend-only for now, must later be enforced server-side):
- Attempts 1–4 allowed.
- 5th failed attempt → login disabled for 5 seconds, showing "Too many failed attempts.
  Please wait 5 seconds before trying again." and a 5→1 countdown ("Try again in 5 seconds").
- After 5 seconds, login re-enables; a successful login resets the failed-attempt counter.

## 8. Code standards

Small functions. Explicit types. No unrelated refactors. No over-engineering. Match the
required pastel sunset aesthetic exactly: Pastel Pink, Warm Peach, Soft Lavender, Vibrant
Tropical Turquoise, with rounded cards, subtle shadows, clean typography, soft gradients,
clear buttons, status badges, consistent forms. Responsive on mobile, tablet, and desktop.

## 9. When in doubt

Keep it small. Use the relevant skill. Ask a focused question. Stay inside Sprint 1–4 — any
work that reaches toward a real backend, database, or deployment needs an explicit scope
change first, not an assumption that "it's coming anyway."

Save a prompt. Get approval. Implement. Run checks. Share test steps.
