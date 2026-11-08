c# QuickFile Frontend

Modern, mobile-first, and highly accessible React 18 single-page application (SPA) for the **QuickFile Barangay Document Processing System**. Built with Vite, clean vanilla CSS design tokens, and role-based access control supporting Citizens, Staff members, Administrators, and the Public.

---

## Table of Contents

1. [Features & Portals](#features--portals)
2. [Technology Stack](#technology-stack)
3. [Architecture & Clean Code Principles](#architecture--clean-code-principles)
4. [Project Structure](#project-structure)
5. [Prerequisites & Environment Configuration](#prerequisites--environment-configuration)
6. [Getting Started & Scripts](#getting-started--scripts)
7. [Testing Strategy](#testing-strategy)
8. [Mobile-First & Accessibility Standards](#mobile-first--accessibility-standards)
9. [Capacitor Mobile Ready](#capacitor-mobile-ready)
10. [Production Deployment & Security](#production-deployment--security)

---

## Features & Portals

QuickFile is organized into four distinct role-based portals sharing a unified auth state and design system:

### 1. Citizen Portal (`/citizen/*`)
- **Document Catalog**: Browse available certificates and clearances with real-time fee, processing time, and requirements preview.
- **Multi-Step Document Filing**: Dynamic requirement checklist, file upload with client-side image preview and validation, and purpose selection.
- **Request Tracking**: Real-time request timeline with automated live polling (`/api/v1/citizen/requests/:id/status`) every 10 seconds.
- **Self-Service Cancellation**: Allows citizens to cancel pending requests before staff review.
- **Printable Receipts**: Instant browser printing of request receipts complete with tracking QR codes.

### 2. Staff Portal (`/staff/*`)
- **Queue Management**: Filterable, paginated request queue with status-driven actions and 409 Conflict auto-refetching. Reads `data.items` and `data.pagination.total`.
- **Workflow State Machine**: Status actions gated by 7 granular staff permissions:
  - `can_review_requests`: `pending` → `under_review` or `rejected`; `under_review` → `approved` or `rejected`
  - `can_prepare_documents`: `approved` → `in_preparation`; walk-in filing
  - `can_print_documents`: `in_preparation` → `ready_for_pickup` (calls `/issue`); browser print preview
  - `can_release_documents`: `ready_for_pickup` → `released` (fee collection / waiver)
  - `can_verify_qr`: scan & audit certificate QR codes
  - `can_view_reports`: view analytics & export PDF / Word / Excel
  - `can_archive_records`: `released` / `rejected` → `archived`
  *(System Administrators possess global override across all transitions).*
- **Live Queue Stats**: Automated 10-second polling for real-time dashboard KPIs (`data.kpis`) and pending review queue (`data.pending_queue`).
- **QR Code Scanner**: In-browser camera scanning powered by `html5-qrcode` with instant manual code input fallback.
- **Official Certificate Printing**: Isolated browser printing via `printService.print()` (`window.print()`) rendering verified backend certificate details.
- **Multi-Format Report Exports**: Direct streaming blob downloads for PDF (`.pdf`), Word (`.docx`), and Excel (`.xlsx`) transactions reports.

### 3. Administrator Portal (`/admin/*`)
- **System Dashboard**: Live barangay metric cards and dynamic quick-action links.
- **Staff Management**: Create staff members, toggle active status, and assign 7 granular permissions (`can_review_requests`, `can_prepare_documents`, etc.).
- **Citizen Directory**: Inspect citizen profiles and manage active status with typed `DEACTIVATE` / `ACTIVATE` safety confirmations.
- **Document Type Catalog**: Create and edit document types, fees, turnaround times, required supporting docs, and printable layouts.
- **Audit Logs**: Filterable system audit trail with structured JSON metadata inspection modal and date validation (`from <= to`).
- **Secure System Settings**: Sensitive configuration protected by the **Super Admin Key flow** across 5 integrations (Google OAuth, PhilSMS, SMTP Mailer, Google reCAPTCHA v2, and REST API Gateway Security) with masked values, custom/default badges, 423 lockout countdown handler, and immediate key clearance from memory.

### 4. Public & Authentication (`/*`)
- **Public Landing Page**: System benefits, available services, and announcements.
- **Public Document Verification**: Check certificate authenticity via tracking code or QR camera scan without logging in.
- **Secure Authentication**: Registration, email login, Google OAuth integration, forgot password, and reset password flows.
- **Safe Redirect Engine**: Validates target post-login destinations to block open-redirect vulnerabilities.

---

## Technology Stack

All dependencies are pinned to exact versions for deterministic builds:

| Package | Version | Purpose |
| :--- | :--- | :--- |
| **react** | `18.3.1` | Modern UI library with concurrent rendering |
| **react-dom** | `18.3.1` | DOM renderer for React |
| **react-router-dom** | `6.30.6` | Client-side routing, route guards, and nested layouts |
| **html5-qrcode** | `2.3.8` | Cross-browser HTML5 camera QR scanner with fallback |
| **vite** | `5.4.21` | Fast development server and production bundler |
| **@vitejs/plugin-react** | `4.3.4` | Babel-based Fast Refresh plugin for Vite |
| **vitest** | `2.1.9` | Vite-native unit and integration test runner |
| **@testing-library/react**| `16.0.1` | DOM testing utilities testing user-centric behavior |
| **@testing-library/jest-dom** | `6.6.3` | Semantic DOM element assertions (`toBeInTheDocument`, etc.) |
| **@testing-library/user-event** | `14.5.2` | User event simulation for DOM testing |
| **jsdom** | `25.0.1` | Pure JavaScript browser environment for tests |
| **eslint** | `8.57.1` | Code quality and React hooks linter |

*Zero third-party icon libraries (no lucide-react, font-awesome, or material icons) are used.* All icons are lightweight, accessible SVGs encapsulated in `components/shared/Icon.jsx`. Zero heavy CSS frameworks (no Tailwind, Bootstrap) are used. Styling is built on pure semantic CSS custom properties for optimal performance and zero bundle bloat.

---

## Architecture & Clean Code Principles

The frontend strictly adheres to modular, maintainable, and decoupled architectural layers:

```
src/
├── assets/          # Static logos, icons, and illustrations
├── components/      # Reusable UI widgets (Button, Modal, Input, Badge, Table, etc.)
├── constants/       # Immutable enums, API endpoints, role permissions, storage keys
├── context/         # Global state providers (AuthContext)
├── hooks/           # Reusable custom hooks (useAuth, usePolling, useDebounce)
├── layouts/         # Role-specific layout shells (Public, Citizen, Staff, Admin)
├── pages/           # Routed view orchestration (no direct fetch calls)
│   ├── admin/       # Admin sub-pages (Dashboard, Staff, Citizens, Types, Records, IssuedDocs, Settings, Logs, Reports)
│   ├── auth/        # Login, Register, ForgotPassword, ResetPassword, GoogleCallback
│   ├── citizen/     # Catalog, RequestNew, RequestDetail, CitizenDashboard, Notifications, Profile
│   ├── public/      # LandingPage, VerifyPage, NotFoundPage
│   └── staff/       # StaffDashboard, StaffQueue, StaffRequestDetail, StaffWalkIn, StaffRecords, StaffVerify, StaffReports, CertificatePrint
├── routes/          # Route declarations and ProtectedRoute role gates
├── services/        # Business API services (apiClient, authService, citizenService, staffService, adminService, printService)
├── styles/          # Design tokens (tokens.css) and global utility classes (global.css)
├── tests/           # Vitest unit & component test suites and real API response fixtures
│   └── fixtures/    # Sanitized real backend fixtures (fixtures/real/*.json)
└── utils/           # Pure helpers (actionLogic, formatters, date utils, safe redirects, blob downloads)
```

### Core Rules:
1. **Layer Separation**: Components never call `fetch` directly. All network requests flow through `services/` &rarr; `apiClient.js`.
2. **Page Orchestration**: Pages coordinate state and subcomponents; they contain no inline business algorithms.
3. **Component Sizing**: Files are kept under ~150 lines. Complex interfaces are factored into dedicated subcomponents.
4. **Descriptive Naming**: PascalCase for components (`DocTypeCard.jsx`), camelCase for hooks and helpers (`usePolling.js`, `getSafeRedirect.js`), snake_case preserved only for incoming backend JSON properties.
5. **No Secrets**: No API keys, passwords, or Super Admin Keys are logged, stored in persistent state, or hardcoded.

---

## Project Structure

```
frontend/
├── docs/
│   ├── api-contract.md        # Complete API contract specification
│   ├── backend-gaps.md        # Documented backend-frontend contract discrepancies
│   ├── manual-tests.md        # Manual QA test scenarios
│   └── TESTING.md             # Multi-role 2-device manual test script & prod build notes
├── public/                    # Static assets copied verbatim to build
├── scripts/
│   └── smoke.mjs              # Live backend parity validation script (70 assertions, 0 mocks)
├── src/                       # Application source code
├── index.html                 # Single-page application root HTML with CSP & Referrer Policy
├── package.json               # Pinned dependencies & npm scripts
├── vite.config.js             # Vite configuration with test environment
└── README.md                  # This document
```

---

## Prerequisites & Environment Configuration

- **Node.js**: `v18.x` or `v20.x` LTS recommended
- **npm**: `v9.x` or `v10.x`

### Environment Files

Create a `.env` file in `/frontend` (or copy from `.env.example`):

```bash
# URL pointing to the QuickFile Express backend
VITE_API_URL=http://localhost:5000

# Base URL for public verification QR codes (defaults to window.location.origin)
VITE_PUBLIC_URL=http://localhost:5173
```

> **Note**: In development, `VITE_API_URL` defaults to `http://localhost:5000` if omitted. When deploying to production, point this to your live API domain (e.g. `https://api.quickfile.ph`).

---

## Getting Started & Scripts

From the repository root or the `/frontend` directory:

```bash
# 1. Install dependencies (strictly pinned)
cd frontend
npm install

# 2. Start the local Vite development server
npm run dev
# Accessible at http://localhost:5173

# 3. Run ESLint across all source files
npm run lint

# 4. Run Vitest automated unit & component tests
npm run test
# Or run once without watch mode:
npm test -- --run

# 5. Build for production (outputs optimized static assets to frontend/dist)
npm run build

# 6. Preview the production build locally
npm run preview
```

---

## Testing Strategy

QuickFile employs a multi-tiered verification pipeline:

### 1. Vitest Unit & Component Tests
- **23 test suites** covering all critical helpers, custom hooks, and complex component interactions:
  - Request state machine matrix (`getAvailableActions`) covering all 9 statuses &times; 7 permissions &times; Staff/Admin roles.
  - Auth token lifecycle, 401 handling, and Super Admin Key exemption in `apiClient`.
  - Safe redirect sanitization (blocking `//`, `/\`, javascript schemes, control chars).
  - Isolated browser printing via `printService`.
  - Blob report download helpers with cleanup.
  - Super Admin Key settings flow and 423 lockout countdowns across 5 integrations.
  - Destructive action confirmation modals with case-sensitive typed inputs.
  - Component rendering tested against real, sanitized backend response fixtures (`frontend/src/tests/fixtures/real/*.json`).
- Run tests via:
  ```bash
  npm --prefix frontend test -- --run
  ```

### 2. End-to-End Smoke Parity Script (`smoke.mjs`)
- Automated script exercising **70 live assertions** against the running Express backend:
  - Zero mock fallbacks: strictly connects to `SMOKE_API_URL` (default `http://localhost:5000/api/v1`) using credentials from environment variables (`SMOKE_ADMIN_EMAIL`, `SMOKE_STAFF_EMAIL`, `SMOKE_CITIZEN_EMAIL`, `SMOKE_SU_ADMIN_KEY`).
  - Strict shape validation: asserts all expected keys consumed by UI components (`data.kpis`, `data.pending_queue`, `data.items`, `data.pagination.total`, etc.).
  - Automated fixture generation: dumps sanitized real responses to `src/tests/fixtures/real/*.json` (tokens, emails, passwords, and personal names safely redacted).
  - Tests health, authentication, rate limits, citizen workflow, staff queue transitions, document issuance, certificate print payload, multi-format report exports (PDF, DOCX, XLSX), and admin CRUD.
- Run smoke test via:
  ```bash
  node frontend/scripts/smoke.mjs
  ```

### 3. Two-Device Manual Testing Script
- Refer to [`frontend/docs/TESTING.md`](docs/TESTING.md) for a comprehensive manual test script exercising real-time interactions across two physical devices (Desktop Staff Portal + Mobile Citizen Portal).

---

## Mobile-First & Accessibility Standards

- **360px Minimum Viewport**: Fully responsive down to 360px width. Side-by-side modal inputs automatically collapse to a single column on viewports `< 500px` via `.qf-grid-2col`.
- **44px Minimum Touch Targets**: Buttons, tabs, and form controls enforce `--touch-target: 44px` to meet mobile accessibility standards.
- **Accessible Navigation**:
  - `SkipLink` component at the top of all layouts allowing keyboard users to bypass navigation straight to `<main id="main-content">`.
  - Accessible drawer toggles with `aria-expanded` and `aria-label`.
  - Accessible keyboard navigation on autocomplete search inputs (`role="listbox"`, `ArrowDown`, `ArrowUp`, `Enter`, `Escape`).
  - Visible keyboard focus rings with `:focus-visible` styling throughout.
  - High-contrast color tokens exceeding WCAG 2.1 AA ratios (4.5:1 text, 3:1 graphical elements).
- **No `dangerouslySetInnerHTML`**: All dynamic data is safely rendered via React JSX escaping.

---

## Capacitor Mobile Ready

The frontend is architected to be packaged into an Android (`.apk`) or iOS app using **Capacitor**:
- **No Cookie Dependencies**: All authentication relies on standard `Authorization: Bearer <token>` headers stored in `localStorage` under `quickfile:auth:token`.
- **Relative & Configurable URLs**: API requests use `VITE_API_URL` instead of hardcoded hostnames.
- **Hardware Back Button Ready**: Standard React Router history navigation works cleanly with native mobile wrappers.
- **Camera QR Scanning**: Uses HTML5 MediaDevices camera stream inside WebView with zero native plugin overhead.

---

## Production Deployment & Security

### Content Security Policy (CSP) & Referrer Policy
The SPA enforces strict client-side security policies configured in `frontend/index.html` and dynamic route guards:
- **Default Referrer Policy**: `<meta name="referrer" content="strict-origin-when-cross-origin">` ensures sensitive path parameters are omitted across third-party origins.
- **Dynamic Referrer Downgrade on Password Reset**: On the `/reset-password` screen, a dynamic `<meta name="referrer" content="no-referrer">` tag is injected on mount and restored on unmount to prevent leaking password reset tokens to external services.
- **Content Security Policy**:
  - `default-src 'self'`: Restricts defaults to own origin.
  - `script-src 'self' https://accounts.google.com/gsi/client https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/`: Allows only verified scripts for Google Sign-In and reCAPTCHA.
  - `style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style`: Permits design token styles and Google GIS iframe styling.
  - `frame-src https://accounts.google.com/gsi/ https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/`: Restricts embedded iframes to official auth and anti-bot providers.
  - `img-src 'self' data: blob: https://*.googleusercontent.com`: Allows avatars and blob preview URLs for document attachments.
  - `connect-src 'self' http://localhost:5000 https://accounts.google.com/gsi/`: Restricts network requests strictly to backend APIs and authentication services.

### Nginx SPA Configuration
When deploying the `frontend/dist` static build, ensure all routes fall back to `index.html`:

```nginx
server {
    listen 80;
    server_name portal.quickfile.ph;
    root /var/www/quickfile/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; frame-src https://accounts.google.com/gsi/ https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/; img-src 'self' data: blob: https://*.googleusercontent.com; connect-src 'self' https://api.quickfile.ph https://accounts.google.com/gsi/; font-src 'self';" always;
}
```

### Backend CORS Configuration
Ensure the backend `.env` file lists the frontend's production URL:
```env
FRONTEND_URL=https://portal.quickfile.ph
```

---

## License & Team
QuickFile Document Processing System — Developed for Barangay Local Government Units. All rights reserved.
