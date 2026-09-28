# Fix application details and interview reminders

## Scope
Implement the requested Sprint 1-4 frontend behavior using the existing Next.js mock-data/localStorage architecture. Do not add backend, database, real email delivery, SMS delivery, or external notification services.

## Changes

1. Fix the application details 404:
   - Preserve the dynamic `/applications/[id]` route.
   - Add an explicit client hydration/loading state before deciding that an application is missing.
   - Keep a useful not-found state for genuinely missing IDs.
   - Ensure View links from the applications list, edit page, and delete page resolve correctly.

2. Add interview scheduling to applications:
   - Extend the application data shape with optional interview date/time fields and reminder preferences.
   - When status is `Interview`, show date and time inputs in both add and edit forms.
   - Require the interview date and time when status is `Interview`; clear stale interview fields when another status is selected.
   - Store the values in localStorage and display them on the details page and interviews page.
   - Keep existing records compatible when these fields are absent.

3. Add approaching-interview notifications:
   - Generate in-app reminder notifications from scheduled interviews in the local mock-data layer.
   - Show reminders for upcoming interviews, including the company, role, date/time, and configured lead time.
   - Provide notification preference controls for in-app, email, phone, or both email and phone, while clearly treating email/phone as prototype preferences until a backend service exists.
   - Keep the notifications page functional with an empty state and upcoming reminder cards.

4. Improve mobile interaction:
   - Keep the existing visual language and responsive Tailwind approach.
   - Prevent header/navigation, filter controls, action buttons, cards, and forms from overflowing narrow screens.
   - Use full-width or wrapping controls where needed and preserve comfortable touch targets.

## Validation
Run the client lint and production build. Verify the detail link, interview form validation/storage, reminder rendering, and narrow viewport layout manually if a browser is available.
