---
applyTo: "frontend/src/**/*.js,frontend/src/**/*.jsx,frontend/src/**/*.css"
---

# Frontend instructions for QuickFile

This file supplements the repository-wide Copilot guidance in `.github/copilot-instructions.md`. It is scoped to the frontend source tree and should be read together with the repository-wide instructions.

## React component conventions

- Use React 18 patterns already present in the application.
- Keep presentation, behavior, and data-fetching responsibilities separated according to existing code organization.
- Prefer simple, focused components that match the repository’s component sizing expectations.
- Reuse shared UI components in `frontend/src/components` before creating new equivalents.
- Keep component naming consistent with the project’s established patterns: PascalCase for components, camelCase for helper functions and hooks.
- Avoid building large monolithic pages; break complex interfaces into reusable subcomponents and existing shared widgets.

## Page and component separation

- Pages in `frontend/src/pages` should orchestrate state and route-level behavior.
- Components should primarily render UI and delegate interactions to pages or their handlers.
- Do not mix business logic directly into presentational component files when a service or hook is already available.
- Reuse the established layout shells and guard patterns rather than creating custom navigation or auth logic on individual pages.

## Reusable UI components

- Prefer existing shared components such as layout helpers, status badges, modals, alerts, inputs, file dropzones, and loaders.
- Keep visual styling consistent with the project’s design system and CSS organization.
- Do not duplicate shared form/input patterns or status UI if a reusable component already exists.
- Favor composability and consistency over ad hoc local markup.

## Custom hooks

- Reuse existing custom hooks such as auth, polling, and attachment helpers when they match the workflow.
- Keep hook logic focused and reusable rather than embedding repeated logic directly in components.
- Preserve current hook behavior for auth hydration, polling, and permission checks.
- Do not add redundant state or data-fetch logic if a shared hook already covers it.

## Context and state management

- Use the existing auth context for user/session state.
- Keep global state in the established contexts and providers rather than spreading auth logic across components.
- Preserve the project’s route guard logic and permission checks.
- Do not bypass `AuthContext` or route protection simply to satisfy a UI flow.

## API communication through services

- Route network calls through the existing frontend service layer and `apiClient.js`.
- Do not introduce unnecessary direct `fetch()` calls in React components or page code.
- Reuse domain services such as auth, citizen, staff, admin, public, request, verification, and notification services.
- Preserve the standard API response handling, including 401, 409, 429, and download responses.
- Keep request payloads and response handling aligned with backend contracts.

## CSS organization and design tokens

- Keep CSS organized around the project’s existing structure and conventions.
- Preserve the current use of component-level CSS and shared design tokens instead of creating ad hoc styling systems.
- Avoid duplicating styles or inventing new global patterns when existing CSS files already establish the UI language.
- Maintain responsive styling and consistency with the established app look.

## Responsive design

- Match the existing responsive, mobile-first approach used by the application.
- Preserve accessible layout behavior across desktop and mobile breakpoints.
- Avoid introducing components that break the current responsive structure or require hardcoded viewport assumptions.

## Accessibility

- Maintain accessible default behaviors for interactive controls, labels, buttons, forms, modals, and navigation.
- Preserve keyboard support, focus states, and semantic markup where already present.
- Do not add invisible or misleading interactive elements.
- Keep screen-reader-friendly naming and error messaging consistent with current UX patterns.

## Authentication and route protection

- Reuse the existing public route, role route, and permission route guards.
- Preserve the portal structure and role-based navigation patterns already implemented.
- Do not bypass auth or permission checks in the UI.
- Keep session expiry and redirect behavior aligned with the existing `AuthContext` and `apiClient` patterns.

## Loading, error, and empty states

- Use the repository’s existing loading, error, and empty-state patterns rather than creating one-off behaviors.
- Preserve user feedback for pending requests, failed calls, and empty data states.
- Keep error messaging consistent with the backend’s current conventions and the app’s UI patterns.

## Frontend testing expectations

- Inspect the existing frontend tests and fixtures before changing behavior.
- Add or update focused tests for changed functionality.
- Prefer testing actual user-visible behavior and route/service interactions over implementation-detail assertions.
- Keep regression coverage aligned with the existing Vitest + Testing Library setup.
- Reuse fixtures and test helpers already present in `frontend/src/tests`.

## Additional guardrails

- Preserve existing architecture and avoid mixing legacy root-app patterns into the current frontend.
- Keep frontend work limited to the active React/Vite application in `/frontend`.
- Reuse existing utilities, hooks, and shared components before creating new abstractions.
- Avoid unnecessary dependencies and large styling libraries.
- Never hardcode secrets or credentials in the frontend.
- Do not modify application source code outside the requested frontend area.
