# Interviews Page Hydration Fix

## Confirmed cause

`client/my-app/app/interviews/page.tsx` initializes `applications` by calling `getStoredApplications()` in a `useState` initializer. During server rendering, `window` is unavailable and `getStoredApplications()` returns an empty array. During the browser's first render, localStorage is available and the same call returns saved interview applications. The server therefore renders the empty-state branch while the first client render maps interview cards, producing the reported hydration mismatch.

## Required change

- Make changes only in `client/my-app/app/interviews/page.tsx`.
- Initialize applications to an empty typed array and add an initial loading state so server HTML and the first client render match.
- Load application data in `useEffect`, following the existing pattern in `client/my-app/applications/page.tsx`: use the authenticated `/api/applications` response when a token exists and fall back to `getStoredApplications()` for local-only sessions or request failure.
- Filter the loaded application list with the existing conditions: status is `Interview`, and interview date and time are present.
- End loading after data resolution and render a brief loading state before the existing card/empty-state branches.
- Preserve `getInterviewStatus`, interview fields, date/time and channel display, current card design, and empty-state copy. Do not modify scheduling, notifications, worker, queue, auth, CRUD, or shared data.
- Do not add mock data, suppress hydration warnings, or hide the loaded list.

## Validation

From `client/my-app`, run:

```powershell
npx eslint app/interviews/page.tsx
npm run build
```