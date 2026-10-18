# QuickFile: Web-Based Barangay Document Request and Management System

QuickFile is an enterprise-grade, lightweight, and modern web application built with **Node.js** and **Express**. It streamlines the end-to-end lifecycle of barangay document requests, digital profile verification, official certificate printing, cryptographic QR verification, and administrative audit governance.

QuickFile is designed to be **100% portable and computer-independent**, running seamlessly on any machine via pure JavaScript and Node's built-in `node:sqlite` engine without requiring native C++ build tools, Python build environments, or external database servers.

---

## 🌟 Key Highlights & Current Version Features

- **End-to-End CRUD Functionality**: Complete Create, Read, Update, and Delete operations across all Citizen, Staff, and Admin entities.
- **Unified Activity Timestamping**: Every single activity, workflow milestone, and administrative modification is permanently tracked with standardized **`Created At`** and **`Last Updated At`** timestamps (`MMM DD, YYYY • hh:mm:ss A`).
- **Live Real-Time Synchronization**: Client-side reactive polling immediately reflects status changes across Citizen tracking screens, Staff review queues, and Admin dashboards without requiring manual page refreshes.
- **Assisted Walk-In Counter Service**: Dedicated desk module (`/staff/requests/walk-in`) allowing staff to file applications for senior citizens, offline residents, and counter visitors.
- **Cryptographic QR Verification Portal**: Public verification gateway (`/verify/:code`) enabling employers, banks, and government agencies to instantly authenticate issued barangay certificates.
- **Granular Staff Permissions & Security Audit Logs**: Fine-grained access control switches (ADM-URM-04) combined with an immutable audit ledger (ADM-SAO) logging actor identity, event type, and timestamps.
- **Pluggable Integration Architecture**: Dynamic feature toggles in Admin Settings for Google OAuth single sign-on, Twilio/PhilSMS gateways, and SMTP mail delivery.

---

## 🗂️ Modular Project Structure

```
QuickFile/
├── app.js                              # Main application entry point & router mounting
├── package.json                        # Scripts and project dependencies
├── .env                                # Environment configurations (PORT, JWT_SECRET, etc.)
├── test_modules.js                     # Complete automated unit & functional verification suite
├── test_routes.js                      # HTTP route & EJS template rendering test suite
└── src/
    ├── config/
    │   ├── db.js                       # Universal zero-native SQLite connection adapter (node:sqlite)
    │   └── index.js                    # Centralized environment variable loader
    ├── database/
    │   ├── schema.sql                  # Relational database schema with cascade rules & WAL mode
    │   └── init.js                     # Database auto-initialization & default seeder
    ├── middleware/
    │   ├── auth.middleware.js          # Unified Session, JWT Cookie & Bearer token authenticator
    │   ├── role.middleware.js          # Role-based access control ('citizen', 'staff', 'admin')
    │   ├── permission.middleware.js    # Granular staff operational permissions check
    │   └── error.middleware.js         # Centralized error handler
    ├── modules/
    │   ├── auth/
    │   │   └── auth.helper.js          # Bcrypt hashing, JWT generation, and verification helpers
    │   ├── citizen/                    # 🧑 CITIZEN MODULE (CIT-IAM, CIT-APM, CIT-DCR, CIT-ODR, CIT-RST, CIT-RHV)
    │   │   ├── citizen.model.js        # User accounts & resident profile database queries
    │   │   ├── citizen.service.js      # Citizen registration, profile reuse & security logic
    │   │   ├── citizen.controller.js   # Citizen web request handlers & status APIs
    │   │   └── citizen.routes.js       # Express router for Citizen portal
    │   ├── staff/                      # 🛡️ BARANGAY STAFF MODULE (STF-IAM, STF-RVP, STF-RSM, STF-DPP, STF-RA, STF-QDV, STF-TR)
    │   │   ├── staff.model.js          # Staff account details & access permissions queries
    │   │   ├── staff.service.js        # Staff authentication & authorization logic
    │   │   ├── staff.controller.js     # Queue processing, notes, review, and live stats handlers
    │   │   └── staff.routes.js         # Express router for Barangay Staff desk
    │   ├── admin/                      # 🏛️ BARANGAY ADMIN MODULE (ADM-IAM, ADM-DB, ADM-URM, ADM-CUM, ADM-DTM, ADM-TR, ADM-CRS, ADM-IDV, ADM-SAO)
    │   │   ├── admin.model.js          # Administrative oversight, staff CRUD, and audit log queries
    │   │   ├── admin.service.js        # Staff management, citizen oversight, and system security
    │   │   ├── admin.controller.js     # Dashboard, user roles, records, and reports handlers
    │   │   └── admin.routes.js         # Express router for Admin console
    │   ├── request/                    # 📄 CORE DOCUMENT REQUEST MODULE
    │   │   ├── request.model.js        # Document request queries, status updates, and deletion
    │   │   └── request.service.js      # Application submission, edit, cancellation, and walk-in flows
    │   ├── document/                   # 📑 DOCUMENT TYPE CATALOG MODULE
    │   │   ├── document.model.js       # Document catalog schema & CRUD queries
    │   │   └── document.service.js     # Catalog management & requirement validation
    │   ├── verification/               # 🔍 QR AUTHENTICATION & CERTIFICATE MODULE
    │   │   └── verification.service.js # QR generation, verification engine, revocation & reinstatement
    │   ├── notification/               # 🔔 REAL-TIME NOTIFICATIONS MODULE
    │   │   └── notification.service.js # User notifications dispatch, delete & clear-all service
    │   ├── reports/                    # 📊 TRANSACTION REPORTING & AUDIT TRAIL
    │   │   └── report.service.js       # Financial reports, workload analytics, and audit logs
    │   └── settings/                   # ⚙️ PLUGGABLE INTEGRATIONS & SYSTEM SETTINGS
    │       ├── settings.model.js       # System settings key-value database queries
    │       ├── settings.service.js     # Feature flags (Google OAuth, SMS, SMTP, QR engine)
    │       ├── settings.controller.js  # Settings UI controller
    │       └── settings.routes.js      # System settings routes
    ├── public/
    │   ├── css/styles.css              # Custom responsive stylesheet & badge styles
    │   └── uploads/                    # Local storage for applicant valid IDs & documents
    └── views/                          # Server-rendered EJS templates
        ├── layouts/                    # Navigation header, footer, error templates
        ├── home.ejs                    # Modern landing page & portal gateway
        ├── verify.ejs                  # Public QR verification lookup page
        ├── citizen/                    # Citizen portal templates (Login, Register, Dashboard, Catalog, Request, Edit, History, Tracking, Profile, Notifications)
        ├── staff/                      # Staff portal templates (Desk, Queue, Walk-in, Review, Certificate Print, Archive, Reports, QR Scanner)
        └── admin/                      # Admin portal templates (Dashboard, Doc Types, Staff & Roles, Citizens, Records, Issued Docs, Audit Trail, Reports, Settings)
```

---

## 📋 Comprehensive Requirements Map (What's Done)

### 1. CIT CITIZEN PORTAL
| Requirement ID | Module / Feature Name | Status | Technical Implementation |
| :--- | :--- | :---: | :--- |
| **CIT-IAM-01** | Account Registration | **DONE** | Self-service registration with bcrypt password hashing and resident record initialization (`/citizen/register`). |
| **CIT-IAM-02** | User Login | **DONE** | Secure session & JWT authentication with email validation and account active checks (`/citizen/login`). |
| **CIT-IAM-03** | User Logout | **DONE** | Session destruction and cookie invalidation (`/citizen/logout`). |
| **CIT-IAM-04** | Password Recovery | **DONE** | Cryptographic token generation with expiration and secure password reset (`/citizen/forgot-password`). |
| **CIT-APM-01** | Profile Creation | **DONE** | Comprehensive resident profile setup capturing full name, birthdate, civil status, purok/zone, and voter status. |
| **CIT-APM-02** | Profile Update | **DONE** | Profile modification interface with completeness scoring and emergency contact management (`/citizen/profile`). |
| **CIT-APM-03** | Profile Reuse | **DONE** | 1-click automatic data population into document request forms from verified profile records (`/citizen/profile/reuse`). |
| **CIT-DCR-01** | View Document Catalog | **DONE** | Interactive directory of all available barangay clearances and certificates (`/citizen/catalog`). |
| **CIT-DCR-02** | View Document Requirements | **DONE** | Clear breakdown of required IDs, proofs of residency, turnaround times, and official fees. |
| **CIT-ODR-01** | Document Selection | **DONE** | One-click document picker with auto-assessed fee calculations (`/citizen/requests/new`). |
| **CIT-ODR-02** | Submit Request | **DONE** | Application creation with unique tracking number generation (`QF-YYYYMMDD-XXXX`). |
| **CIT-ODR-03** | Digital Form Entry | **DONE** | Custom digital fields capturing applicant details and stated legal purpose. |
| **CIT-ODR-04** | File Upload | **DONE** | Multer-assisted upload of government-issued valid IDs and proof documents. |
| **CIT-RST-01** | Status Tracking | **DONE** | Live timeline tracking (`/citizen/requests/:trackingNumber`) with 8-second reactive status auto-polling. |
| **CIT-RST-02** | Notification Receipt | **DONE** | In-app notification center with read/unread statuses, single delete, and Clear All (`/citizen/notifications`). |
| **CIT-RHV-01** | Request History Viewing | **DONE** | Historical request log showing full status badges, tracking numbers, and certificate numbers (`/citizen/history`). |
| **CIT-RHV-02** | QR Code Verification | **DONE** | Direct access to certificate authenticity card and public verification links. |
| **CRUD-CIT-U** | Edit Pending Request | **DONE** | Edit purpose, digital entries, and re-upload files while application is in `PENDING` status (`/citizen/requests/:trackingNumber/edit`). |
| **CRUD-CIT-D** | Cancel Pending Request | **DONE** | Cancel pending applications before staff inspection begins (`POST /citizen/requests/:trackingNumber/cancel`). |

---

### 2. STF BARANGAY STAFF PORTAL
| Requirement ID | Module / Feature Name | Status | Technical Implementation |
| :--- | :--- | :---: | :--- |
| **STF-IAM-01** | Staff Login | **DONE** | Staff authentication with active status verification and role validation (`/staff/login`). |
| **STF-IAM-02** | Staff Logout | **DONE** | Secure session invalidation and audit logout (`/staff/logout`). |
| **STF-RVP-01** | Request Viewing | **DONE** | Real-time queue table with status filters, search, and 10s auto-refresh polling (`/staff/requests`). |
| **STF-RVP-02** | Requirement Review | **DONE** | In-browser inspector for applicant identity, uploaded valid IDs, and requirements checklist (`/staff/requests/:id`). |
| **STF-RVP-03** | Request Validation | **DONE** | Multi-stage lifecycle actions: transition to `UNDER_REVIEW` and `APPROVED`. |
| **STF-RVP-04** | Request Rejection | **DONE** | Rejection workflow with mandatory rejection remarks dispatched to citizen notification inbox. |
| **STF-RSM-01** | Request Status Management | **DONE** | State machine governing lifecycle transitions (`PENDING` $\rightarrow$ `UNDER_REVIEW` $\rightarrow$ `APPROVED` $\rightarrow$ `IN_PREPARATION` $\rightarrow$ `READY_FOR_PICKUP` $\rightarrow$ `RELEASED` $\rightarrow$ `ARCHIVED`). |
| **STF-RSM-02** | Citizen Notification | **DONE** | Automated in-app notifications generated upon every state transition and staff note update. |
| **STF-DPP-01** | Document Preparation | **DONE** | Certificate generation generating formal Certificate No. (`CERT-YYYY-XXXX`), verification key, and QR code image. |
| **STF-DPP-02** | Document Printing | **DONE** | Print-optimized certificate layout (`/staff/requests/:id/print`) complete with official seals, QR watermark, and signature lines. |
| **STF-DPP-03** | Document Release | **DONE** | Release clearance to applicant and record fee payment status (`PAID`/`WAIVED`). |
| **STF-RA-01** | Document Archiving | **DONE** | Formal archival of released records removing them from the active queue into permanent records (`/staff/records`). |
| **STF-RA-02** | Records Retrieval | **DONE** | Centralized search and reprint capability for historical archived certificates. |
| **STF-QDV-01** | Electronic Verification | **DONE** | Interactive QR camera scanner and code search console (`/staff/verify`). |
| **STF-QDV-02** | QR Code Generation | **DONE** | High-density QR generation via `qrcode` embedding digital verification endpoints. |
| **STF-TR-01** | Report Generation | **DONE** | Summary reports for transactions, fee collections, and request categories (`/staff/reports`). |
| **STF-TR-02** | Workload Monitoring | **DONE** | Processing velocity metrics and leaderboard per staff member. |
| **STF-WKS** | Walk-in Counter Service | **DONE** | Counter desk filing assisting walk-in residents and senior citizens with automated request creation (`/staff/requests/walk-in`). |
| **CRUD-STF-U** | Staff Processing Notes | **DONE** | Update internal notes and remarks on live requests (`POST /staff/requests/:id/notes`). |

---

### 3. ADM BARANGAY OFFICIAL / ADMIN PORTAL
| Requirement ID | Module / Feature Name | Status | Technical Implementation |
| :--- | :--- | :---: | :--- |
| **ADM-IAM-01** | Administrator Login | **DONE** | Privileged administrator authentication (`/admin/login`). |
| **ADM-IAM-02** | Administrator Logout | **DONE** | Administrative session invalidation (`/admin/logout`). |
| **ADM-DB-01** | Administrative Dashboard | **DONE** | Central executive cockpit displaying live KPIs, total revenues, and request distribution (`/admin/dashboard`). |
| **ADM-DB-02** | Performance Monitoring | **DONE** | Real-time demand breakdown per document type and operational throughput metrics. |
| **ADM-URM-01** | Staff Account Creation | **DONE** | Creation of authorized staff accounts with employee IDs and departmental assignments (`/admin/staff-management`). |
| **ADM-URM-02** | Staff Account Management | **DONE** | Modification of staff details, contact info, and password resets. |
| **ADM-URM-03** | Staff Deactivation | **DONE** | Instant access revocation toggle without deleting historical transaction attribution. |
| **ADM-URM-04** | Access Control Management | **DONE** | Fine-grained switches for Review, Prepare, Print, Release, QR Verify, and Reports permissions. |
| **ADM-URM-05** | Staff Account Deletion | **DONE** | Permanent deletion of staff personnel records (`POST /admin/staff/:id/delete`). |
| **ADM-CUM-01** | Citizen User Oversight | **DONE** | Central resident user directory displaying registration dates, voter statuses, and total requests (`/admin/citizens`). |
| **ADM-CUM-02** | Toggle Citizen Status | **DONE** | One-click enable/disable access toggle for resident accounts (`POST /admin/citizens/:id/status`). |
| **ADM-CUM-03** | Citizen Account Deletion | **DONE** | Permanent removal of citizen accounts with cascade cleanup (`POST /admin/citizens/:id/delete`). |
| **ADM-DTM-01** | Document Type Addition | **DONE** | Creation of new clearance types with custom fees and turnaround days (`/admin/document-types`). |
| **ADM-DTM-02** | Document Type Modification | **DONE** | Updating fees, requirements text, and active availability flags. |
| **ADM-DTM-03** | Document Type Removal | **DONE** | Soft and hard deletion of obsolete document types. |
| **ADM-TR-01** | Transaction Monitoring | **DONE** | Complete transaction registry with filtering by date range, status, and document type (`/admin/reports`). |
| **ADM-TR-02** | Request Analytics | **DONE** | Revenue summaries and printable/CSV-exportable audit reports. |
| **ADM-CRS-01** | Historical Record Retrieval | **DONE** | Centralized search engine across all citizen requests, certificate numbers, and dates (`/admin/records`). |
| **ADM-CRS-02** | Issued Document Verification | **DONE** | In-depth record inspection modal showing full audit history and applicant proofs. |
| **ADM-IDV-01** | Document Validity Control | **DONE** | One-click **Revocation** (with formal reason) and **Reinstatement** of certificates (`/admin/issued-documents`). |
| **ADM-IDV-02** | Issued Document Monitoring | **DONE** | Complete register of all issued certificates with permanent record deletion capability. |
| **ADM-SAO-01** | System Records Oversight | **DONE** | Immutable, queryable audit trail (`/admin/audit-logs`) capturing all critical system actions. |
| **ADM-SAO-02** | Transaction Accountability | **DONE** | Strict attribution recording actor ID, actor name, target entity, timestamp, and details. |
| **ADM-SET** | System Settings & Integrations | **DONE** | Pluggable toggles for Google OAuth, SMS gateways, and SMTP mail delivery (`/admin/settings`). |

---

## 🔄 How It Works (End-to-End System Walkthrough)

### 1. The Citizen Workflow
```
[Registration / Login] ──> [Complete Resident Profile] ──> [Browse Document Catalog]
                                                                  │
[Verify Certificate via QR] <── [Receive Certificate] <── [Track Status (Live Sync)]
```
1. **Resident Registration & Profile Reuse (CIT-IAM & CIT-APM)**:
   - A resident registers with their email, password, and contact number.
   - Upon logging in, the citizen completes their Resident Profile (purok/zone, address, civil status, voter registration).
   - Once completed, the **Profile Reuse Engine (CIT-APM-03)** automatically stores this data. Subsequent requests require zero redundant typing.
2. **Online Document Request Filing (CIT-DCR & CIT-ODR)**:
   - The citizen browses the active document catalog, selects a document (e.g. Barangay Clearance), and views the exact prerequisites.
   - The application form auto-populates personal details from their profile. The citizen specifies the legal purpose and uploads proof (e.g. Valid ID).
   - A unique tracking number (`QF-YYYYMMDD-XXXX`) is assigned, and initial timestamps are stamped (`created_at` and `updated_at`).
3. **Live Milestone Status Tracking (CIT-RST & CIT-RHV)**:
   - The citizen navigates to their request tracking page.
   - An integrated 8-second reactive polling script monitors `/citizen/requests/:trackingNumber/status`.
   - As Barangay Staff advances the application through review, approval, preparation, and ready for pickup, the citizen's browser updates badges and milestones **in real-time without manual page reloading**.
   - If an application is still in `PENDING` status, the citizen can choose to **Edit Application** or **Cancel Request**.

---

### 2. The Barangay Staff Workflow
```
[Staff Login] ──> [Review Queue] ──> [Verify Requirements] ──> [Approve / Reject]
                                                                      │
[Archive Record] <── [Release Document & Fee] <── [Print Certificate & QR]
```
1. **Queue Inspection & Live Queue Monitor (STF-RVP & STF-RSM)**:
   - Staff logs in and accesses the Request Queue (`/staff/requests`).
   - A live 10-second background fetch monitors `/staff/requests/live-stats`, updating queue counters and incoming applications automatically.
2. **Requirement Validation & Inspection**:
   - Staff opens an application to review applicant details, residency declarations, and full-resolution uploaded IDs.
   - Staff marks the application `UNDER_REVIEW`, which automatically logs an audit trail event and dispatches an alert to the citizen.
   - If requirements are met, staff clicks **Approve Application**. If documents are lacking, staff clicks **Reject Application** and specifies the exact feedback.
3. **Document Preparation & QR Generation (STF-DPP & STF-QDV)**:
   - Staff triggers **Generate Official Certificate & QR**.
   - The system generates an official Certificate Number (`CERT-YYYY-XXXX`), a unique cryptographic verification token (`QF-VER-XXXXXX`), and embeds a high-resolution QR code image.
   - Staff clicks **Print Official Certificate** to open a print-ready, formatted certificate with official municipal seals and signatures.
4. **Counter Release & Archival (STF-DPP-03 & STF-RA)**:
   - When the resident arrives at the barangay hall, staff confirms payment (if applicable) and clicks **Mark Document as Released**.
   - Once released, staff can archive the record into the permanent barangay historical archive (`/staff/records`).

---

### 3. Assisted Walk-in Counter Service (STF-WKS)
For walk-in visitors, senior citizens, and residents without smartphone access:
- Staff navigates to `/staff/requests/walk-in`.
- Staff selects an existing resident from the registry or files on behalf of a new resident.
- The walk-in application is immediately created, queued, and can be approved, printed, and released on the spot.

---

### 4. The Administrative Oversight & Governance Workflow
```
[Admin Cockpit] ──> [Live KPIs & Financials] ──> [Staff Access Control] ──> [Audit Logs]
                                                                                  │
[Delete Requests / Docs] <── [Revoke / Reinstate Certificates] <── [Citizen Directory]
```
1. **Executive Dashboard & Real-Time KPIs (ADM-DB)**:
   - The Barangay Captain or Administrator views real-time metrics: Total Requests, Active Staff, Pending Queues, Issued Certificates, and Total Revenues collected.
2. **Staff & Access Control Management (ADM-URM)**:
   - Admin creates staff accounts, edits assignments, resets staff credentials, toggles active/deactivated statuses, or deletes staff accounts.
   - Admin configures fine-grained role permissions: Review Requests, Prepare Documents, Print Documents, Release Documents, QR Verify, and View Reports.
3. **Citizen Accounts Oversight (ADM-CUM)**:
   - Admin oversees the resident registry (`/admin/citizens`), toggles citizen active/disabled access, and deletes accounts with transactional cascading.
4. **Issued Certificate Control & Revocation (ADM-IDV)**:
   - Under `/admin/issued-documents`, admin monitors all issued documents.
   - If a document was issued fraudulently or the resident relocates, admin clicks **Revoke**, enters the official reason, and the certificate is immediately deactivated across all verification portals. Admin can also reinstate valid status at any time.
5. **System Activity & Audit Trail (ADM-SAO)**:
   - Every status progression, approval, rejection, certificate generation, revocation, and staff deletion is permanently recorded in the immutable audit trail (`/admin/audit-logs`) with actor identity, action type, target entity, and exact timestamps.

---

### 5. Standardized Date & Time Timestamp Architecture

Every entity in QuickFile maintains dual tracking timestamps:
- **`Created At`**: The exact timestamp when an application was filed, a staff member was onboarded, or a record was established.
- **`Last Updated At`**: The timestamp of the most recent lifecycle activity, status modification, or note update.

All timestamps are rendered through standardized formatting helpers:
- **`formatDateTime(date)`**: Outputs readable full format (e.g. `Oct 18, 2026, 10:45:12 PM`).
- **`formatDate(date)`**: Outputs short date format (e.g. `Oct 18, 2026`).

---

## 🚀 How to Run the Application

QuickFile is completely standalone and requires **zero native build dependencies**.

### 1. System Prerequisites
- **Node.js**: Version 18.0.0 or higher (Node 20+ or Node 25 recommended).
- **NPM**: Version 8.0.0 or higher.

### 2. Installation
Clone the repository and install the lightweight JavaScript dependencies:
```bash
git clone https://github.com/RickCashew19/QuickFile.git
cd QuickFile
npm install
```

### 3. Start the Server
To launch the production server:
```bash
npm start
```
Or to run in development mode with auto-reload:
```bash
npm run dev
```

### 4. Access the Application
Open your web browser and navigate to:
```
http://localhost:3000
```

---

## 🔑 Pre-seeded Default Accounts for Testing

The database automatically initializes and seeds default accounts upon first startup:

| Portal | Role | Email Address | Password | Permissions |
| :--- | :--- | :--- | :--- | :--- |
| **Citizen Portal** | `citizen` | `citizen@quickfile.gov.ph` | `Citizen@123456` | Full Citizen Access |
| **Staff Portal** | `staff` | `staff@quickfile.gov.ph` | `Staff@123456` | Review, Prepare, Print, Release, QR Verify, Reports, Archive |
| **Admin Portal** | `admin` | `admin@quickfile.gov.ph` | `Admin@123456` | Full Super Administrator Privileges |

---

## 🧪 Automated Test Verification

QuickFile includes a comprehensive automated test suite verifying all Citizen, Staff, and Admin modules, full CRUD capabilities, and all HTTP view routes:

```bash
npm test
```
Running `npm test` executes:
1. `node test_modules.js`: Comprehensive functional test validating user registration, profile reuse, catalog retrieval, request submission, staff review, certificate preparation, QR generation, release, archival, reporting, audit logging, citizen editing, cancellation, notifications clear, walk-in creation, citizen management, and staff account deletion.
2. `node test_routes.js`: HTTP route integration test asserting that all 25+ Citizen, Staff, and Admin views compile and return `200 OK`.

---

## 📄 License
This project is developed for Barangay Local Government Units and academic presentation purposes.

