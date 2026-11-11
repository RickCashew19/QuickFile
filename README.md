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
- MongoDB, locally or remotely

## Setup

From the repository root, install each app's dependencies:

```powershell
npm --prefix backend install
npm --prefix frontend install
Copy-Item .\backend\.env.example .\backend\.env
Copy-Item .\frontend\.env.example .\frontend\.env
```

Configure the backend values in `backend/.env`, including MongoDB connection,
JWT, Super Admin key, jurisdiction, and seed account settings.

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

See [frontend/README.md](./frontend/README.md) for frontend details and
[frontend/docs/api-contract.md](./frontend/docs/api-contract.md) for the API
contract.
