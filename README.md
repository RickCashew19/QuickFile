# QuickFile: Web-Based Barangay Document Request and Management System

QuickFile is built with **Node.js** and **Express**, featuring a **modular layered architecture** that makes it easy to navigate, extend, and maintain for academic presentations and future module implementations.

---

## 🗂️ Modular Project Structure

```
QuickFile/
├── app.js                         # Application entry point & router mounting
├── package.json                   # Dependencies & scripts
├── .env                           # Environment settings (PORT, JWT_SECRET, etc.)
├── test_modules.js                # Automated verification script
└── src/
    ├── config/
    │   ├── db.js                  # Universal SQLite database connection (built-in node:sqlite & better-sqlite3)
    │   └── index.js               # Centralized environment configuration
    ├── database/
    │   ├── schema.sql             # SQL schema (users, profiles, permissions, resets)
    │   └── init.js                # Database initialization & default seeder
    ├── middleware/
    │   ├── auth.middleware.js     # Session, JWT cookie & Bearer token authentication
    │   ├── role.middleware.js     # Role verification ('citizen', 'staff', 'admin')
    │   ├── permission.middleware.js# Granular staff permissions check (ADM-URM-04)
    │   └── error.middleware.js    # Global application error handler
    ├── modules/
    │   ├── auth/
    │   │   └── auth.helper.js     # Password hashing, token generation & verification
    │   ├── citizen/               # 🧑 CITIZEN MODULE (CIT-IAM & CIT-APM)
    │   │   ├── citizen.model.js   # DB queries for resident users & profiles
    │   │   ├── citizen.service.js # Business logic (Register, Login, Recovery, Profile)
    │   │   ├── citizen.controller.js # Request handlers (Web & JSON API)
    │   │   └── citizen.routes.js  # Express router for Citizen portal
    │   ├── staff/                 # 🛡️ BARANGAY STAFF MODULE (STF-IAM)
    │   │   ├── staff.model.js     # Staff account & permissions queries
    │   │   ├── staff.service.js   # Staff authentication & authorization
    │   │   ├── staff.controller.js# Staff request handlers
    │   │   └── staff.routes.js    # Express router for Staff desk
    │   ├── admin/                 # 🏛️ BARANGAY ADMIN MODULE (ADM-IAM & ADM-URM)
    │   │   ├── admin.model.js     # Admin & staff management queries
    │   │   ├── admin.service.js   # Admin logic (Login, Staff CRUD, Role Permissions)
    │   │   ├── admin.controller.js# Admin request handlers
    │   │   └── admin.routes.js    # Express router for Admin portal
    │   └── settings/              # ⚙️ APP SETTINGS & PLUGGABLE INTEGRATIONS
    │       ├── settings.model.js  # App settings DB queries
    │       ├── settings.service.js# Integration toggle & feature flags
    │       ├── settings.controller.js # Admin configuration console
    │       └── settings.routes.js # Settings management routes
    ├── public/
    │   └── css/styles.css         # Responsive styling
    └── views/                     # Server-rendered EJS templates
        ├── layouts/               # Header, footer, error templates
        ├── home.ejs               # Portal selector landing page
        ├── citizen/               # Registration, Login, Recovery, Profile, Dashboard
        ├── staff/                 # Staff Login & Staff Desk
        └── admin/                 # Admin Login, Dashboard, Staff & Role Management
```

---

## 📋 Implemented Requirements Map

### 1. CIT CITIZEN
- **CIT-IAM-01: Account Registration**
  - Path: [`citizen.service.js`](./src/modules/citizen/citizen.service.js) &rarr; `CitizenService.register()`
  - View: [`register.ejs`](./src/views/citizen/register.ejs) (`/citizen/register`)
- **CIT-IAM-02: User Login**
  - Path: [`citizen.service.js`](./src/modules/citizen/citizen.service.js) &rarr; `CitizenService.login()`
  - View: [`login.ejs`](./src/views/citizen/login.ejs) (`/citizen/login`)
- **CIT-IAM-03: User Logout**
  - Path: [`citizen.controller.js`](./src/modules/citizen/citizen.controller.js) &rarr; `CitizenController.logout()`
- **CIT-IAM-04: Password Recovery**
  - Path: [`citizen.service.js`](./src/modules/citizen/citizen.service.js) &rarr; `initiatePasswordRecovery()`, `resetPassword()`
  - Views: [`forgot-password.ejs`](./src/views/citizen/forgot-password.ejs) & [`reset-password.ejs`](./src/views/citizen/reset-password.ejs)
- **CIT-APM-01: Profile Creation**
  - Initial creation occurs automatically on registration with resident data capture.
- **CIT-APM-02: Profile Update**
  - Path: [`citizen.service.js`](./src/modules/citizen/citizen.service.js) &rarr; `CitizenService.updateProfile()`
  - View: [`profile.ejs`](./src/views/citizen/profile.ejs) (`/citizen/profile`)
- **CIT-APM-03: Profile Reuse**
  - Path: [`citizen.service.js`](./src/modules/citizen/citizen.service.js) &rarr; `CitizenService.getReusableProfile()`
  - Formats personal data and address ready to auto-populate document request flows.
  - Endpoint: `GET /citizen/profile/reuse` (returns reusable JSON identity).

---

### 2. STF BARANGAY STAFF
- **STF-IAM-01: Staff Login**
  - Path: [`staff.service.js`](./src/modules/staff/staff.service.js) &rarr; `StaffService.login()`
  - Checks if account is active (blocks deactivated staff) and loads assigned permissions.
  - View: [`login.ejs`](./src/views/staff/login.ejs) (`/staff/login`)
- **STF-IAM-02: Staff Logout**
  - Path: [`staff.controller.js`](./src/modules/staff/staff.controller.js) &rarr; `StaffController.logout()`

---

### 3. ADM BARANGAY OFFICIAL / ADMIN
- **ADM-IAM-01: Administrator Login**
  - Path: [`admin.service.js`](./src/modules/admin/admin.service.js) &rarr; `AdminService.login()`
  - View: [`login.ejs`](./src/views/admin/login.ejs) (`/admin/login`)
- **ADM-IAM-02: Administrator Logout**
  - Path: [`admin.controller.js`](./src/modules/admin/admin.controller.js) &rarr; `AdminController.logout()`
- **ADM-URM-01: Staff Account Creation**
  - Path: [`admin.service.js`](./src/modules/admin/admin.service.js) &rarr; `AdminService.createStaffAccount()`
  - Modal form on [`staff-management.ejs`](./src/views/admin/staff-management.ejs) (`POST /admin/staff`)
- **ADM-URM-02: Staff Account Management**
  - Path: [`admin.service.js`](./src/modules/admin/admin.service.js) &rarr; `AdminService.updateStaffAccount()`
  - Edit name, phone, position, department, and reset passwords (`POST /admin/staff/:staffId/update`)
- **ADM-URM-03: Staff Account Deactivation**
  - Path: [`admin.service.js`](./src/modules/admin/admin.service.js) &rarr; `AdminService.toggleStaffStatus()`
  - One-click toggle between active and deactivated status (`POST /admin/staff/:staffId/status`)
- **ADM-URM-04: Access Control Management**
  - Path: [`admin.service.js`](./src/modules/admin/admin.service.js) &rarr; `AdminService.updateStaffAccessControl()`
  - Middleware: [`permission.middleware.js`](./src/middleware/permission.middleware.js)
  - Granular control over permissions (`can_review_requests`, `can_prepare_documents`, `can_print_documents`, `can_release_documents`, `can_verify_qr`, `can_view_reports`, `can_archive_records`).

---

### 4. ⚙️ APP SETTINGS & PLUGGABLE INTEGRATIONS
- **Pluggable Integration Architecture:**
  - Located in: [`src/modules/settings/`](./src/modules/settings)
  - Persisted in the `app_settings` database table.
  - Accessible via Admin Portal: `/admin/settings`.
- **Google Authentication (OAuth) Toggle:**
  - **When Enabled:** Citizens see a prominent "Continue with Google" one-click button on login and registration pages (`/citizen/auth/google`).
  - **When Disabled:** Google Auth is completely hidden and blocked; the system enforces that **all citizen sign-ins must be done manually** using email and password.
- **Additional Pluggable Toggles:**
  - SMS Gateway Notifications (Twilio / PhilSMS)
  - SMTP Automated Email Service
  - Internal Document QR Code Verification Engine

---

## 🚀 How to Run the Application

### 1. Start the Server
```bash
npm start
```
or with auto-reload during development:
```bash
npm run dev
```

### 2. Access in Web Browser
Open: **`http://localhost:3000`**

### 3. Pre-seeded Test Accounts
- **Citizen:** `citizen@quickfile.gov.ph` / `Citizen@123456`
- **Barangay Staff:** `staff@quickfile.gov.ph` / `Staff@123456`
- **Barangay Admin:** `admin@quickfile.gov.ph` / `Admin@123456`

### 4. Run Automated Test Verification
```bash
node test_modules.js
```
