# QuickFile

QuickFile is a barangay document request and management system with a separated
REST API and web application:

- `backend/` — Express API, MongoDB, and Mongoose
- `frontend/` — React single-page application built with Vite

The former root-level Express/EJS/SQLite application has been removed. Any
existing root-level SQLite database or uploaded documents are retained as local
data and are not used by the current application.

## Requirements

- Node.js 18 or newer
- npm
- MongoDB Atlas for the running app (configured via `backend/.env`); a local
  MongoDB 6+ replica set is used only for the backend test suites

## Setup

From the repository root, install each app's dependencies:

```powershell
npm --prefix backend install
npm --prefix frontend install
Copy-Item .\backend\.env.example .\backend\.env
Copy-Item .\frontend\.env.example .\frontend\.env
```

Configure the backend values in `backend/.env`, including the MongoDB Atlas
connection, JWT, Super Admin key, jurisdiction, and seed account settings.
See [backend/docs/ATLAS.md](./backend/docs/ATLAS.md) for the Atlas runbook.

## Demonstration data

The backend ships two idempotent demo seeders. They add clearly labeled request
records across every workflow status, issued certificates (including a revoked
one) for QR verification, in-app notifications, audit logs, signatory settings,
and an active custom DOCX template.

```powershell
# Local MongoDB only (database must be quickfile or quickfile_demo)
npm --prefix backend run seed:demo

# The configured Atlas database (development only; explicit opt-in)
npm --prefix backend run seed:demo:atlas
```

Both commands are safe to rerun: existing sample records are reused and only
advanced as needed; non-demo records are untouched. Back up Atlas first with
`npm --prefix backend run atlas:backup`. The demo accounts are
`citizen@quickfile.gov.ph`, `staff@quickfile.gov.ph`, and
`admin@quickfile.gov.ph` (passwords are the `DEFAULT_*_PASSWORD` values in
`backend/.env`).

## Development

Run the API and frontend in separate terminals:

```powershell
npm --prefix backend run dev
npm --prefix frontend run dev
```

The API listens on port 5000 and the frontend on port 5173 by default.

## Frontend checks

```powershell
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
```

See [frontend/README.md](./frontend/README.md) for frontend details,
[frontend/docs/api-contract.md](./frontend/docs/api-contract.md) for the API
contract, [docs/CONCURRENCY_CONTROL.md](./docs/CONCURRENCY_CONTROL.md) for the
lock/transaction design, and [backend/docs/ATLAS.md](./backend/docs/ATLAS.md)
for the database runbook.
