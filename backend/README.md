# QuickFile Backend API

Express & MongoDB REST API service for the QuickFile Barangay Document Request & Management System.

## Architecture

Organized according to the standard enterprise layered architecture:

```
backend/
├── src/
│   ├── @types/          # TypeScript / JSDoc type declarations
│   ├── config/          # Environment configuration, database connection, constants
│   ├── controllers/     # Express route handlers / request-response coordinators
│   ├── helpers/         # Utility functions, serializers, exporters
│   │   └── exporters/   # Excel, PDF, and Word report generators
│   ├── middlewares/     # Authentication, authorization, rate limiters, error handling
│   ├── models/          # Mongoose data schemas and database models
│   ├── routes/          # Express route definitions
│   ├── services/        # Business logic layer
│   └── validators/      # Payload and form validation helpers
├── tests/               # Integration and end-to-end test suites
├── .env.example         # Environment template
├── app.js               # Express application configuration
├── package.json         # Dependencies and scripts
└── server.js            # Server entrypoint and lifecycle management
```

## Getting Started

### Prerequisites
- Node.js >= 18.0.0
- MongoDB 6.0+

### Installation
```bash
npm install
```

### Configuration
Copy `.env.example` to `.env` and fill in the required environment variables:
```bash
cp .env.example .env
```

### Database Seeding
To initialize the database with default document types and initial administrator:
```bash
npm run seed
```

### Running the Server
```bash
# Development mode with hot-reloading
npm run dev

# Production mode
npm start
```

### Running Tests
```bash
npm test
```
