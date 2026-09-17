# ApplyFlow Project Contract

## 1. Project Information

- Project Title: ApplyFlow – Internship & Job Application Tracker
- Project Name: ApplyFlow
- Project Number: Project #17
- Student: Cassandra Aphane
- Field: Software Development
- Repository: cs-Internship-and-Job-Application-Tracker
- Project Type: Full-stack web application
- Submission Scope: Official submission version for Sprint 1–4

## 2. Project Overview

ApplyFlow is a centralized web application for students, graduates, and job seekers to record, organise, monitor, and manage internship, WIL, graduate job, and full-time job applications. The system helps users keep track of where they have applied, what stage each application is in, upcoming interviews, and overall application progress.

The project is designed to provide a professional, modern, and responsive platform that makes job-search tracking easier and more structured.

## 3. Problem Statement

Students and job seekers often apply to multiple companies and struggle to manage:

- Which companies they have applied to
- Which roles they have applied for
- When applications were submitted
- Current application status
- Upcoming interviews
- Overall progress in the application process

ApplyFlow solves this by giving users a single dashboard and organized application management workflow.

## 4. Target Users

Primary users:

- Students
- Graduates
- Job seekers

Each user should eventually have access to personal data for:

- Applications
- Interviews
- Notifications
- Dashboard statistics

## 5. Core Business Goal

To create a professional platform that allows users to:

- Record applications
- Monitor statuses
- Manage interviews
- Review progress
- Track upcoming reminders and notifications
- Maintain an organised and centralised job-search workflow

## 6. Functional Requirements

The final system should eventually allow users to:

- Register
- Log in
- Log out
- Add applications
- View applications
- Edit applications
- Delete applications
- Search applications
- Filter applications
- Track application status
- View dashboard statistics
- Manage interviews
- View notifications

## 7. Non-Functional Requirements

The application should be:

- Professional
- Modern
- Responsive
- Secure
- Reliable
- Maintainable
- Scalable
- User-friendly
- Accessible
- Easy to navigate

## 8. Application Information Model

Each application should include:

- Company name
- Position / job title
- Application date
- Application type
- Application status
- Work arrangement
- Additional notes

### Application Types

- Internship
- WIL
- Graduate Job
- Full-Time Job

### Application Statuses

- Saved
- Applied
- Assessment
- Shortlisted
- Interview
- Offer
- Rejected
- Withdrawn

### Work Arrangements

- Remote
- Hybrid
- Onsite

## 9. User Roles and Data Scope

The system is designed around a single primary user type:

- Student / Graduate / Job Seeker

The architecture must support personal data ownership and future user-specific access control.

## 10. Required Main Screens

The application must include the following screens:

1. Login
2. Registration
3. Dashboard
4. Applications
5. Add Application
6. Interviews
7. Notifications

Navigation should support:

- Dashboard → Applications → Interviews → Notifications

## 11. Design Direction

The official submission version uses the required pastel sunset aesthetic:

- Pastel Pink
- Warm Peach
- Soft Lavender
- Vibrant Tropical Turquoise

The design should be:

- Professional
- Modern
- Elegant
- Clean
- Soft
- Fresh
- Student-friendly
- Premium

Design principles include:

- Soft pastel backgrounds
- Rounded cards
- Subtle shadows
- Clean typography
- Modern spacing
- Soft gradients
- Clear buttons
- Status badges
- Consistent forms

## 12. Security Requirements

During Sprint 1–4:

- Real passwords must not be stored in plain text
- Secrets must not be exposed
- API keys must not be hard-coded
- Database credentials must not be exposed
- .env secrets must not be committed

During future backend work:

- JWT will be used
- bcrypt will be used
- Protected routes will be implemented
- User-specific access will be enforced

## 13. Password Attempt Requirement

The project requires a frontend prototype of user lockout behaviour:

- Incorrect password attempts 1–4 are allowed
- After the 5th incorrect attempt, login is temporarily disabled for 5 seconds
- The interface must display:
  - "Too many failed attempts. Please wait 5 seconds before trying again."
  - "Try again in 5 seconds"
  - countdown from 5 to 1
- After 5 seconds, login is re-enabled
- A successful login resets the failed-attempt counter

This is only a prototype during Sprint 4 and must later be enforced server-side as part of future authentication implementation.

## 14. Application Features by Sprint

### Sprint 1 – Requirements & Planning

Focus: define scope, requirements, users, data model, and project direction.

Objectives:

- Clarify project objective
- Finalise functional requirements
- Finalise non-functional requirements
- Identify the main user
- Define application data requirements
- Finalise project scope and boundaries

Deliverables:

- Requirements specification
- Project overview
- User and problem definition
- Core application model
- Scope statement

### Sprint 2 – UI/UX Design

Focus: design the user experience and visual identity.

Objectives:

- Design login and registration screens
- Design dashboard
- Design applications views
- Design interviews and notifications pages
- Establish the pastel sunset design system

Deliverables:

- Wireframes and design direction
- Visual style guide
- Page layouts and mock screens

### Sprint 3 – Project Setup

Focus: organise the repository and prepare architecture.

Objectives:

- Inspect existing client/server structure
- Preserve the client/server split
- Set up the frontend foundation
- Maintain backend structure for future integration
- Prepare clean architecture for a later API and database layer

Deliverables:

- Clean project structure
- Frontend setup ready for development
- Backend prepared for future API integration
- TypeScript/Tailwind-ready frontend configuration

### Sprint 4 – Frontend Development

Focus: build the actual frontend interactive prototype.

Objectives:

- Build registration and login UI
- Implement validation and failed-attempt handling
- Build dashboard with mock data
- Build applications list and filters
- Add application form and validation
- Implement application detail, edit, and delete flows
- Build interviews and notifications pages
- Ensure responsive design and final polish

Deliverables:

- Working frontend prototype using mock data
- Responsive screens
- Navigation between dashboard, applications, interviews, and notifications
- Pastel sunset interface

## 15. Full Lifecycle Phase Plan

The project is structured into the following development phases.

### Phase 1 – Requirements & Planning
- Sprint 1
- Goal: define the accurate project scope and product requirements

### Phase 2 – UI/UX Design
- Sprint 2
- Goal: create an elegant and functional design system and user flows

### Phase 3 – Project Setup
- Sprint 3
- Goal: prepare the repository and architecture correctly

### Phase 4 – Frontend Development
- Sprint 4
- Goal: implement the interactive frontend prototype

### Phase 5 – Backend/API Development
- Planned future sprint
- Goal: create REST API routes and backend logic

### Phase 6 – Database Development
- Planned future sprint
- Goal: integrate PostgreSQL / Neon Database

### Phase 7 – Frontend/Backend Integration
- Planned future sprint
- Goal: connect the client to the API and data layer

### Phase 8 – Testing
- Planned future sprint
- Goal: validate functionality, usability, and reliability

### Phase 9 – Deployment
- Planned future sprint
- Goal: deploy the frontend and backend to their respective platforms

### Phase 10 – Finalisation
- Planned future sprint
- Goal: final polish, documentation, and project submission

## 16. Current Submission Scope

This official submission version covers:

- Sprint 1
- Sprint 2
- Sprint 3
- Sprint 4

The project is intentionally not extended into Sprint 5 or later phases at this stage.

## 17. Technology Stack

### Frontend

- Next.js
- React
- TypeScript
- HTML/CSS
- Tailwind CSS

### Backend

- Node.js
- Express.js
- REST API

### Database

- PostgreSQL
- Neon Database

### Authentication

- JWT
- bcrypt

### Development Tools

- Git
- GitHub
- VS Code

### Deployment Targets

- Frontend: Vercel
- Backend: Render

## 18. Architecture

The intended architecture is:

Next.js / React Client
          ↓
Express.js REST API
          ↓
PostgreSQL / Neon

This architecture is prepared for future implementation, but database and production backend work remain outside the current Sprint 1–4 scope.

## 19. Project Constraints

- Do not implement full backend functionality before the frontend is ready
- Do not prematurely connect the database
- Do not migrate to production-only features before project setup is complete
- Maintain a clean separation between client and server
- Keep the project within scope

## 20. Out of Scope

The following are explicitly outside the project scope for this stage:

- CV / resume builder
- Automatic job searching
- Automatic job application submission
- Calendar integration
- AI job recommendations
- External job-site integration
- Automated email functionality
- Full production auth implementation
- Production database integration

## 21. Deliverables

At the end of the current project scope, the project should deliver:

- Requirement-driven design and project plan
- Pastel sunset front-end prototype
- Responsive UI screens
- Mock-data-driven tracker
- Functional Sprint 1–4 experience
- Professional project structure ready for future backend integration

## 22. Definition of Done

The project is considered complete for the current implementation when:

- Requirements are clearly defined
- Design direction is established
- Frontend screens exist and are functional
- Dashboard, application management, interviews, and notifications pages are implemented
- Authentication and validation are present on the front end
- Buffer and cooldown rules are included
- Mock data is used appropriately
- Responsive design is working
- The project is clean and professional
- No major broken routes exist

## 23. Acceptance Criteria

The solution is accepted when:

- The interface matches the required pastel sunset aesthetic
- The required screens are created
- Features work with mock data during Sprint 4
- Navigation is consistent and user-friendly
- Search and filters work on the applications page
- Add, edit, and delete flows are present
- Validation messages are clear and accessible
- It is responsive and clean on mobile, tablet, and desktop

## 24. Project Risk and Considerations

Potential risks:

- Scope creep beyond Sprint 4
- Premature backend implementation
- Unclear separation of frontend/backend responsibilities
- Design inconsistency if the pastel palette is not enforced

Mitigation:

- Keep work aligned to Sprint 1–4 scope
- Preserve the client/server separation
- Use mock data only during frontend development
- Maintain simple, clear architecture

## 25. Contract Summary

This project is a professional internship and job application tracker called ApplyFlow. It is designed to help users manage job-search activity through a high-quality and responsive dashboard and application workflow.

The current official submission version focuses on the first four sprints:

- Sprint 1: Requirements & Planning
- Sprint 2: UI/UX Design
- Sprint 3: Project Setup
- Sprint 4: Frontend Development

Future phases are planned beyond the current scope and will be implemented only after this submission version is complete.

## 26. Sign-off Statement

This document serves as the project contract and scope definition for ApplyFlow. All work undertaken within the current submission scope should remain aligned to this definition and should not extend into unapproved backend, database, or deployment work unless explicitly authorised.
