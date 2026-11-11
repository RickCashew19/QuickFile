# GitHub Copilot Instructions for QuickFile

This document is the shared engineering knowledge base for Copilot agents working in this repository. It is derived from the current source implementation and project structure, not from assumptions about the legacy root app.

## 1. Project Overview

QuickFile is a barangay document request and management system with a modern role-based platform split across two active application areas:

- `/backend`: Node.js + Express REST API using MongoDB and Mongoose
- `/frontend`: React + Vite SPA for citizen, staff, and admin portals

The root-level application (`app.js`, `src/`, legacy `package.json`) is an older Express/EJS/SQLite implementation and is not the current target architecture. Copilot work should focus on `/backend` and `/frontend` unless a user explicitly requests legacy root-app work.

The system supports:

- Citizen request submission, tracking, and notifications
- Staff queue review, processing, issuance, printing, and archive flows
- Admin functions for staff management, document types, records, audit logs, and settings
- Public verification of issued certificates using QR/verification codes
- Role-based permissions and a Super Admin key flow for sensitive configuration

## 2. Verified Architecture

The repository contains an active, separated architecture:

- `/backend/server.js` starts the API server
- `/backend/app.js` defines the Express API app and mounts `/api/v1` routes
- `/backend/src/modules` contains business modules split by responsibility
- `/backend/src/models` contains Mongoose schemas and model definitions
- `/backend/src/middleware` contains auth, authorization, validation, rate limiting, sanitization, and error handling middleware
- `/frontend/src/App.jsx` defines the SPA routing and role-based portal layouts
- `/frontend/src/services/apiClient.js` is the centralized API client used by the frontend
- `/frontend/src/contexts/AuthContext.jsx` manages user session state and auth flow

The current primary development target is the separated `/backend` and `/frontend` implementation. The root legacy app must not be treated as the active architecture.

## 3. Technology Stack

### Backend

- Node.js
- Express
- MongoDB
- Mongoose
- JWT for bearer authentication
- Helmet for HTTP security headers
- CORS
- Express rate limiters
- Multer for multipart uploads
- Nodemailer for email operations
- PDF generation and DOCX/Excel export libraries
- QR code generation and verification support
- bcryptjs for password hashing

### Frontend

- React 18
- Vite
- React Router
- HTML5 QR scanner support
- Vitest + Testing Library + jsdom for automated tests
- ESLint for linting

## 4. Directory Responsibilities

### `/backend`

- `server.js`: server bootstrap and MongoDB connection lifecycle
- `app.js`: API app creation, security middleware, mounted routes, error handling
- `src/config`: environment/config validation and constants
- `src/middleware`: auth, RBAC, granular permission checks, validation, rate limits, sanitization, error handling
- `src/models`: persisted data models for users, permissions, requests, document types, issued documents, notifications, audit logs, and settings
- `src/modules`: module-based business logic by feature area
  - `auth`
  - `citizen`
  - `staff`
  - `admin`
  - `request`
  - `verify`
  - `public`
  - `settings`
  - `file`
  - `notification`

### `/frontend`

- `src/App.jsx`: top-level route tree and portal structure
- `src/pages`: public, citizen, staff, and admin pages
- `src/components`: shared UI, layout shells, guards, and widgets
- `src/services`: API communication layer and auth helpers
- `src/hooks`: reusable client-side hooks
- `src/contexts`: shared app state, especially auth context
- `src/config/constants.js`: frontend role/status constants and API base URL resolution
- `src/tests`: Vitest coverage and fixtures

## 5. Coding Conventions

Follow the conventions already present in source code:

- Backend code is CommonJS-oriented and model/service/controller structured.
- Frontend code is module-based and React-driven.
- Keep naming aligned with existing codebase patterns:
  - PascalCase for React components
  - camelCase for hooks and helpers
  - snake_case retained for backend JSON fields and persisted database data
- Prefer reuse of existing helpers, middleware, services, hooks, and shared UI components over creating parallel implementations.
- Keep changes focused and surgical.
- Do not introduce unnecessary dependencies or heavy frameworks.
- Preserve established API response envelopes and enums.
- Do not hardcode secrets, API keys, passwords, or internal auth values.

## 6. Backend Development Standards

The backend owns business logic, validation, database operations, and access enforcement.

- All payload validation, DB writes, and business rules should live in backend modules and models.
- Follow the existing controller-service-model separation.
- Keep route-level logic thin; delegate to controller/service modules.
- Reuse existing middleware for:
  - authentication
  - authorization
  - permission checks
  - rate limiting
  - NoSQL sanitization
  - validation
  - error formatting
- Respect the centralized constants in `/backend/src/config/constants.js` for:
  - roles
  - request states
  - status transitions
  - permission names
  - rate limit thresholds
- Preserve authorized workflow transitions and do not bypass role/permission rules.
- Keep MongoDB schema logic consistent with current Mongoose models and indexes.
- Avoid creating duplicate utilities when a module-specific or shared backend utility already exists.
- Follow existing API versioning conventions under `/api/v1`.

## 7. Frontend Development Standards

The frontend is responsible for UI orchestration and interaction flows, not backend enforcement.

- Frontend must communicate with the backend through the existing service layer and centralized `apiClient.js`.
- React components must not introduce unnecessary direct `fetch()` calls.
- Pages may coordinate state, but application logic should flow through services and existing utilities.
- Reuse the existing route guards and auth context instead of reimplementing auth logic in components.
- Follow the portal structure already established:
  - public routes
  - citizen portal
  - staff portal
  - admin portal
- Preserve route permissions and role gates already implemented in `RoleRoute` and `PermissionRoute`.
- Reuse shared layout and UI components in `src/components`.
- Avoid ad hoc state management when a shared context or hook exists.

## 8. API Communication Standards

- All frontend requests should use the existing `apiClient` helpers in `/frontend/src/services/apiClient.js`.
- Use the `authService` and other domain services in `/frontend/src/services` for domain-specific API calls.
- Respect the standard QuickFile API envelope:
  - `success`
  - `message`
  - `data`
- Maintain response handling conventions for:
  - 401 unauthorized sessions
  - 409 conflict / stale updates
  - 429 rate-limited responses
  - file/download responses
- Resolve API base URLs consistently using existing frontend constants and environment configuration.
- Do not bypass service-layer abstractions with raw network code in components.
- Preserve existing contracts unless coordinated backend/frontend changes are explicitly required.

## 9. Authentication and Authorization

The codebase has established auth and role enforcement patterns that must be preserved.

### Backend

- Authentication uses JWT bearer tokens.
- User identity is loaded server-side and validated against stored user records.
- Role checks are enforced using middleware and allowed-role guard patterns.
- Staff permission checks are enforced through `StaffPermission` and the granular permission middleware.
- Admin users are treated as full-privilege bypasses for permission-specific checks only where already implemented.

### Frontend

- Auth state is managed through `AuthContext`.
- Protected routes and permissions are enforced through guards and role checks.
- Session expiry handling is centralized and should not be duplicated ad hoc.

### Rules

- Never weaken or bypass role or permission checks.
- Never store secrets in frontend state or logs.
- Preserve the existing step-up Super Admin key flow and lockout controls.
- Do not add custom auth bypasses for convenience.

## 10. Security Requirements

Preserve and enforce the existing security model.

- Maintain Helmet, CORS allowlist behavior, and request body limits.
- Do not remove NoSQL sanitization protections.
- Do not bypass rate limiting on auth-sensitive or high-risk endpoints.
- Keep secret values out of source code, logs, and debug output.
- Maintain validation on request parameters and payloads.
- Respect the existing Super Admin key protection, lockout logic, and sensitive settings flow.
- Avoid unsafe redirects or open-redirect patterns.
- Preserve file upload constraints and validation.
- Protect user and staff data from accidental exposure through API serialization and route access.

## 11. Testing Standards

Testing is part of the required quality bar for changes.

- Inspect existing tests and fixtures before modifying logic.
- Update or add focused regression tests when behavior changes.
- Prefer targeted tests that cover the actual failing or changed behavior.
- Frontend tests are organized under `/frontend/src/tests` and use Vitest + Testing Library.
- Use existing patterns and fixtures rather than introducing unrelated or redundant tests.
- When backend behavior changes, verify that route, permission, or auth flows are still covered by relevant tests.
- For API contract changes, update the contract docs and any corresponding tests in the same change set.

## 12. Error Handling

Follow the project’s established error patterns.

- Backend error handling is centralized and should remain consistent with the current middleware.
- Returned errors should use the standard JSON shape and avoid leaking stack traces in production responses.
- Mongoose validation, cast errors, noSQL injection attempts, and dangerous upload issues should be handled through existing middleware.
- Frontend should rely on centralized error handling in `apiClient.js` rather than ad hoc try/catch logic for every request.
- Preserve the project’s handling of 401, 409, 429, and file download errors.

## 13. Code Modification Guidelines

Before editing functionality:

- Inspect the relevant backend and frontend source files.
- Review related tests and fixtures.
- Check for existing pattern reuse in similar modules.
- Confirm that the change aligns with the current architecture and API contract.

When making code changes:

- Keep edits precise and limited to the relevant modules.
- Do not modify unrelated legacy root files.
- Do not change environment files or system data as part of feature work.
- Do not introduce custom side channels or alternate API patterns when a service layer already exists.
- Do not reimplement existing utilities, hooks, or middleware.
- Preserve the codebase’s existing security and validation behaviors.

## 14. Definition of Done

A change is complete only when all of the following are true:

- The work is aligned with the active `/backend` + `/frontend` architecture.
- The change follows existing backend/frontend boundaries and reuses current patterns.
- The relevant API contract and permissions remain valid unless explicitly updated with coordination.
- Security protections remain intact.
- Existing tests pass or the relevant new/updated regression tests pass.
- The implementation is consistent with the established design and conventions in this repository.
- The change is documented only where appropriate, without broad or speculative documentation churn.

## Scope Guard

Important: This repository contains both current and legacy implementations. The active target is the separated architecture under `/backend` and `/frontend`.

Agents must not treat the root legacy Express/EJS/SQLite application as the current architecture for implementation work unless the user explicitly instructs otherwise.
