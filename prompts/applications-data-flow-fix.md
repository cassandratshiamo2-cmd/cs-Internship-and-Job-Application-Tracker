# Fix Applications data flow and empty-state bug

## Problem
The Applications page loads but displays the empty state message even when the backend and database are running. The page currently reads from the local mock-data store and never calls a protected application list endpoint, so the UI shows "No applications yet" even when valid data exists upstream. The fix must restore authenticated application retrieval and display without changing the existing Add Application flow unless absolutely necessary.

## Requirements
1. Preserve the current Add Application functionality and do not change its user flow or validation unless a minimal, necessary fix is required.
2. Restore the Applications list to fetch real data from the authenticated backend path when the user is logged in.
3. Keep the app in the existing hybrid architecture: frontend with mock-data compatibility where needed, but backend routes must be used for authenticated application retrieval.
4. Do not break the current Interviews or Notifications features.
5. Keep the change minimal and focused on the broken data flow.
6. Remove any remaining SMS-specific logic from the active flow if it is still present.
7. Make sure email delivery remains server-side and not triggered directly from the frontend.
8. Do not expose secrets or credentials in GitHub.

## Root-cause investigation scope
Check and fix all relevant layers without unrelated refactors:
- Applications page uses local state and mock-data access in the current UI.
- Frontend API base URL and token handling for authenticated requests.
- Backend Express routes and authentication middleware for protected application endpoints.
- PostgreSQL/Neon applications table creation and data queries for the logged-in user.
- CORS and localhost port alignment between frontend and backend.
- Response handling and empty-state logic that hides real server errors or missing data.

## Expected fix
- Add or repair the protected application retrieval endpoint in the backend, using the authenticated user ID and returning the exact application records for that user.
- Ensure the frontend Applications page requests those records with the authorization token in the header.
- Preserve existing local/mock storage helpers as a fallback only if needed, but do not leave the page silently stuck on an empty mock store.
- If an applications table does not exist, create the required schema in the database initialization path.
- Ensure CORS allows the frontend origin and cookies/credentials flow as required by the app.
- Keep API responses consistent and do not incorrectly return an empty list when an authenticated request fails or when the database query is missing expected rows.

## Minimal implementation constraints
- Do not do broad UI redesign or unrelated cleanup.
- Do not change the existing application creation flow unless a root-cause change is absolutely required.
- Do not add a backend API if the repo already has the correct route and only the frontend is calling the wrong source.
- Keep the fix scoped to the real bug: applications are not being fetched and displayed.

## Validation
- Run the relevant frontend build check and backend syntax/health check.
- Verify the authenticated applications route works with a valid token.
- Make sure the page can render fetched applications instead of the empty state.
- Confirm that the Notifications and Interviews pages still work after the patch.
- Report exactly which files were changed and why.

## Acceptance criteria
- The Applications page shows real application data instead of the empty-state message when the user has valid app records.
- Add Application remains functional and unchanged unless a minimal root-cause adjustment is necessary.
- Interview and notification features continue to function.
- The fix is grounded in the actual data flow, not just a UI workaround.
