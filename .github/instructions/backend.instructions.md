---
applyTo: "backend/**/*.js"
---

# Backend instructions for QuickFile

This file supplements the repository-wide Copilot guidance in `.github/copilot-instructions.md`. It is scoped to backend JavaScript files and should be read together with the repository-wide instructions.

## Express application conventions

- Keep the active architecture aligned with `/backend` as the primary API implementation.
- Do not treat the root Express/EJS/SQLite app as the current service target.
- Construct the app in `backend/app.js` and start it from `backend/server.js`.
- Use the established route mounting approach under `/api/v1`.
- Preserve the current layering of security middleware, app config, route mounts, and centralized error handling.
- Use centralized config from `backend/src/config` and avoid ad hoc config logic.

## Controller-service-model separation

- Keep route handlers thin and focused on HTTP concerns.
- Put business logic in service modules or dedicated processing helpers.
- Keep model logic in Mongoose models and schema methods/statics.
- Avoid embedding DB logic directly in route/controller files.
- Follow the repository’s existing organization pattern:
  - routes mount endpoint handlers
  - controllers parse input and delegate to services
  - services coordinate validation/business rules and DB operations
  - models define persistence, schema behaviors, and serialization concerns

## Route organization

- Group API routes by feature module under `backend/src/modules/*`.
- Keep routes file-specific and focused on one responsibility.
- Use existing middleware composition patterns for auth, RBAC, permission checks, and rate limiting.
- Preserve `/api/v1` prefix conventions and module path structure.
- Maintain route-level authorization checks that align with `authenticate`, `authorize`, and `requirePermission` middleware already in use.

## Mongoose schema and database conventions

- Follow the schema conventions already used in `backend/src/models`.
- Use `timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }` unless the file already follows a different explicit pattern.
- Preserve key naming conventions such as `user_id`, `document_type_id`, `tracking_number`, `payment_status`, and `is_active`.
- Use indexes where the repository already expects them.
- Respect role enums and request status enums declared in `backend/src/config/constants.js`.
- Keep schema validation consistent with the existing models and avoid inventing conflicting data shapes.
- Prefer the repository’s established data relationships and field names over creating a new schema style.

## Authentication and authorization

- Use JWT bearer token authentication in the backend middleware layer.
- Reuse `authenticate` and `authorize` from `backend/src/middleware/auth.middleware.js`.
- For staff workflows, use `requirePermission` from `backend/src/middleware/permission.middleware.js`.
- Preserve role-based access patterns: citizen, staff, admin.
- Ensure inactive accounts and invalid tokens are rejected as implemented.
- Reuse existing token validation logic instead of creating custom auth flows.
- Avoid bypassing authorizations for convenience.

## Middleware reuse

- Reuse existing middleware from `backend/src/middleware` instead of creating parallel logic.
- Keep the current security middleware stack in place: rate limiting, sanitization, validation, and error handling.
- Use the established middleware modules before controller logic whenever the project already does so.
- Do not duplicate functionality already implemented by `sanitizeNoSql`, `validateObjectId`, `rateLimiter`, `auth`, `role`, and permission guards.

## Input validation and sanitization

- Validate required fields, types, object IDs, and route parameters before processing business logic.
- Preserve the project’s strict rejection pattern for unsafe payload keys and NoSQL injection attempts.
- Respect current request size limits and upload constraints.
- Use existing sanitization and validation middleware rather than ad hoc checks scattered across controllers.
- Keep validation errors consistent with the current API response behavior.

## Error handling

- Use centralized error handling patterns from `backend/src/middleware/errorHandler.middleware.js`.
- Keep HTTP errors consistent with the project’s response conventions.
- Avoid leaking stack traces or sensitive internals in API responses.
- Handle validation, cast errors, duplicate key errors, JWT errors, and upload restrictions with the existing patterns.
- Prefer domain-specific errors and existing status codes instead of inventing new error semantics.

## API response serialization

- Preserve the project’s standard API response structure:
  - `success`
  - `message`
  - `data`
- Keep serializers and payload shaping consistent with existing controllers.
- Avoid exposing internal DB identifiers or internal staff metadata unless a route already intentionally does so.
- Preserve role-specific response shapes used by citizen, staff, and admin routes.
- Reuse the project’s established response patterns when adding or modifying endpoints.

## File upload and download security

- Respect upload limits and `multer` conventions already in use.
- Keep file handling within the existing backend file utilities and route patterns.
- Validate filenames and file metadata consistently.
- Do not expose sensitive or unscoped files beyond current authorization patterns.
- Maintain download and attachment access restrictions and content-type handling.
- Preserve role and ownership checks for file access.

## Audit logging

- Capture administrative and sensitive actions in the same patterns already used by the project.
- Preserve actor attribution, timestamps, and relevant metadata for audit logs.
- Use existing audit trail structures and do not create alternate, incompatible log formats.
- Do not bypass audit record creation for privileged actions that the codebase expects to be logged.

## Testing expectations

- Inspect related backend tests and fixtures before altering behavior.
- Add or update focused regression tests for changed behavior.
- Prefer small, behavior-based tests over broad or redundant test additions.
- Match the project’s current testing patterns when validating auth, permission, rate limiting, or status transitions.
- Keep changes aligned with the existing API contract and persisted data model conventions.

## Additional guardrails

- Preserve existing security mechanisms and do not weaken protections.
- Avoid unnecessary dependencies.
- Never hardcode secrets, JWT keys, or credentials.
- Do not modify application source code outside the requested backend area.
- Prefer targeted, surgical changes that fit the existing repository structure.
