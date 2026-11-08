# QuickFile Frontend Verification, Manual Testing & Production Deployment Guide

This guide defines the comprehensive manual verification procedures for QuickFile using a realistic **Two-Device Setup** (Desktop and Mobile), alongside production deployment guidelines, security headers, and Content Security Policy (CSP) configurations.

---

## 1. Two-Device Testing Setup Architecture

To thoroughly validate role-based boundaries, responsive breakpoints, touch target compliance, camera hardware access, and certificate generation, tests should be executed across two physical or simulated devices:

```text
+------------------------------------+         +------------------------------------+
|         DEVICE A: DESKTOP          |         |         DEVICE B: MOBILE           |
| (Chrome / Firefox / Edge >= 1280px)|         |   (iOS Safari / Chrome @ 360px)    |
|------------------------------------|         |------------------------------------|
| Roles:                             |         | Roles:                             |
|  - System Administrator            |         |  - Public / Guest Visitor          |
|  - Barangay Staff Member           |         |  - Registered Citizen / Resident   |
|                                    |         |                                    |
| Workflows:                         |         | Workflows:                         |
|  - Request Queue & Document Prep   |         |  - Mobile Registration & Login     |
|  - Official Certificate Printing   |         |  - Request Filing & File Upload    |
|  - Reports & Analytics Exports     |         |  - Live Request Timeline Tracking  |
|  - Staff Provisioning & Perms      |         |  - Mobile Camera QR Verification   |
|  - Super Admin Key Settings Flow   |         |  - In-App Notification Center      |
+------------------------------------+         +------------------------------------+
```

### Network & Connection Setup
1. **Backend Server**: Express API running at `http://<HOST_IP>:5000/api/v1` (or local development address).
2. **Frontend App**: Vite development server running on `http://<HOST_IP>:3000` (`npm run dev -- --host`).
3. **Device B (Mobile)** connects to the same local Wi-Fi network and accesses `http://<HOST_IP>:3000`.

---

## 2. Step-by-Step Manual Test Scripts per Role

### Role 1: Public / Guest Visitor (Device B - Mobile)

#### Test 1.1: Mobile Landing Page at 360px
1. Open browser on Device B and navigate to `/`.
2. **Verify**:
   - Page header displays QuickFile logo, Barangay jurisdiction title, and top action buttons ("Track / Verify", "Sign In").
   - Service cards (Clearance, Indigency, Residency, Business) wrap cleanly to a single column without horizontal page scrolling.
   - "Request Document" button has a minimum touch target of 44x44px. Clicking it redirects to `/login?redirect=/citizen/requests/new`.

#### Test 1.2: Public QR Certificate Verification (`/verify`)
1. On Device B, navigate to `/verify`.
2. **Verify**:
   - Interface offers two verification methods: "Start Camera Scanner" and "Manual Code Input".
   - Type a Request Tracking Number starting with `QF-` (e.g. `QF-2026-0001`) and tap "Verify Certificate".
   - **Expected**: Informative alert appears: *"It looks like you entered a Request Tracking Number (QF-...). Tracking numbers are private to residents. Please log in to your Citizen Portal to view your live request progress."*
   - Type an invalid certificate code (e.g. `INVALID-CODE-999`).
   - **Expected**: Error alert: *"Certificate not found. This code does not match any official barangay record."*

#### Test 1.3: Resident Registration (`/register`)
1. On Device B, navigate to `/register`.
2. Tap "Create Account" without filling fields.
3. **Verify**: Client-side validation outlines required fields (Full Name, Email, Password, Birthdate).
4. Fill in:
   - Full Name: `Test Resident`
   - Email: `resident.test@example.com`
   - Password: `Password@123` (password meter indicates valid format)
   - Birthdate: Pick a date in the past
5. Tap "Create Account".
6. **Expected**: Account is created, JWT is stored in `localStorage`, and resident is routed directly to `/citizen/dashboard`.

#### Test 1.4: Password Reset Flow (`/forgot-password`)
1. On Device B, navigate to `/forgot-password`.
2. Enter an email address and tap "Send Reset Instructions".
3. **Verify**: Always displays a generic security-hardened 200 confirmation: *"If the email address is registered, instructions have been sent."*

---

### Role 2: Citizen / Resident (Device B - Mobile)

#### Test 2.1: Citizen Authentication
1. On Device B, navigate to `/login`.
2. Enter credentials (`citizen@quickfile.gov.ph` / `Citizen@123456`).
3. **Verify**: Instant login without token leakage, redirecting to `/citizen/dashboard`.

#### Test 2.2: Citizen Dashboard & Incomplete Profile Notice
1. **Verify**:
   - Top status summary cards show counts for Active Requests, In Progress, Ready for Pickup, and Completed.
   - If profile has missing address or purok info, an "Incomplete Profile" banner displays an alert with a direct button to "Complete Profile".

#### Test 2.3: Profile Completeness Score (`/citizen/profile`)
1. Navigate to `/citizen/profile`.
2. **Verify**:
   - Profile completeness progress bar accurately reflects filled fields (0% to 100%).
   - Tap "Edit Profile".
   - Update Purok / Zone, Civil Status, and Emergency Contact Number.
   - Tap "Save Profile".
   - **Expected**: Completeness score increases and success banner displays.

#### Test 2.4: Browse Document Catalog (`/citizen/catalog`)
1. Navigate to `/citizen/catalog`.
2. **Verify**: Active document types render with statutory fee, estimated turnaround time in working days, and requirements checklist.
3. Tap "Request Document" on Barangay Clearance.
4. **Expected**: Navigates to `/citizen/requests/new?type=<id>`.

#### Test 2.5: Submit New Document Request (`/citizen/requests/new`)
1. If previously saved profile exists, tap "Prefill from Profile" button.
2. **Verify**: Contact number and residential address fields populate automatically.
3. Enter Purpose: `Employment Requirement`.
4. Drag or tap File Dropzone to attach a supporting file (JPG, PNG, or PDF under 5MB).
5. Tap "Submit Request".
6. **Expected**:
   - Progress bar uploads multipart payload.
   - Success screen displays tracking number (e.g. `QF-2026-XXXX`).
   - "View Request Status" button redirects to request detail page.

#### Test 2.6: Live Request Tracking & Timeline (`/citizen/requests/:trackingNumber`)
1. Navigate to `/citizen/requests/:trackingNumber`.
2. **Verify**:
   - Status badge shows `PENDING`.
   - Status Timeline visually illuminates current stage with date/time.
   - Allowlisted citizen serializer ensures handler IDs and staff internal notes are never rendered.

#### Test 2.7: Edit & Cancel Pending Request
1. While in `Pending` status, tap "Edit Request".
2. Modify Purpose to `Updated Employment Purpose` and tap "Save Changes".
3. **Verify**: Purpose updates immediately.
4. Tap "Cancel Request". Confirmation dialog asks for reason.
5. Provide reason and confirm.
6. **Expected**: Status transitions to `CANCELLED` and action buttons are hidden.

#### Test 2.8: Citizen Notifications Center (`/citizen/notifications`)
1. Tap the notification bell in the mobile navigation bar.
2. **Verify**: Unread indicator badge displays unread count.
3. Tap "Mark All Read".
4. **Expected**: Unread count badge clears.

---

### Role 3: Barangay Staff Member (Device A - Desktop)

#### Test 3.1: Staff Authentication & Layout
1. On Device A, open browser and navigate to `/login`.
2. Log in with staff credentials (`staff@quickfile.gov.ph` / `Staff@123456`).
3. **Verify**:
   - Left sidebar renders staff navigation items: Dashboard, Review Queue, Walk-In Filing, Historical Records, QR Verification, Reports.
   - Header shows staff member name and "Barangay Staff" role pill.

#### Test 3.2: Walk-In Resident Filing (`/staff/requests/walk-in`)
1. Navigate to `/staff/requests/walk-in`.
2. In the resident search input, type `Maria` (min 3 characters).
   - Use keyboard arrow keys (`ArrowDown`, `ArrowUp`) and `Enter` or click to select from the accessible `role="listbox"` autocomplete dropdown.
3. Select Document Type: `Barangay Clearance`.
4. Enter Purpose: `Local Employment` and specify copies.
5. Optionally upload supporting documents via `FileDropzone` (drag & drop or file picker).
6. Click "Submit Walk-In Filing".
7. **Expected**:
   - Filing is created instantly.
   - UI renders a dedicated in-page success confirmation screen displaying the generated tracking number (e.g. `QF-2026-XXXX`), applicant name, document type, copies, and fee.
   - If staff member possesses `can_review_requests`, a "Process Request Now" primary button links straight to the request detail page.
   - Secondary action buttons allow staff to "File Another Walk-In" or "Return to Dashboard".

#### Test 3.3: Full Lifecycle Processing (`/staff/requests/:id`)
1. Open the created request in the Review Queue.
2. In the Staff Notes section, type `Verified resident physical ID and voter registration records.` and click "Append Processing Note".
3. **Verify**: Note appears in internal notes history with staff name and timestamp.
4. Workflow actions strictly adhere to the 9-status state machine and 7 staff permissions (`getAvailableActions`):
   - Status `pending`: Staff with `can_review_requests` (or Admin) can click "Start Review" (`under_review`) or "Reject Request" (`rejected`).
   - Status `under_review`: Staff with `can_review_requests` (or Admin) can click "Approve Request" (`approved`) or "Reject Request" (`rejected`).
   - Status `approved`: Staff with `can_prepare_documents` (or Admin) can click "Mark In Preparation" (`in_preparation`).
   - Status `in_preparation`: Staff with `can_print_documents` (or Admin) can click "Issue & Ready for Pickup" (`ready_for_pickup`).
     - Backend calls `POST /api/v1/staff/requests/:id/issue` and generates an `IssuedDocument` certificate record.
   - Status `ready_for_pickup`: Staff with `can_release_documents` (or Admin) can click "Release Document".
     - Prompts payment modal: confirm payment collected (with O.R. #) or fee waiver (with waiver reason). Status transitions to `released`.
   - Status `released` or `rejected`: Staff with `can_archive_records` (or Admin) can click "Archive Record" (`archived`).
   - Status `archived` or `cancelled`: Terminal states; no further workflow actions are available.
5. If another staff member advances the status concurrently, a 409 Conflict triggers an automatic refetch and displays an informative banner.

#### Test 3.4: Official Certificate Printing (`/staff/requests/:id/print`)
1. Click "Print Certificate" (or navigate to `/staff/requests/:id/print`).
2. **Verify**:
   - Official certificate paper displays Republic of the Philippines, Province, City/Municipality, Barangay Name, recipient full name, complete address, purpose, certificate number, validity period (`Valid Until: <date>`), official signatories (Barangay Captain and Secretary), and scannable QR verification code.
   - No unverified text (such as "dry seal" or "Civil Registry System") is rendered.
   - Click "Print Certificate" &rarr; triggers browser print dialog via `printService.print()` (`window.print()`).
   - Print CSS hides all navigation, control bars, and action buttons, formatting the document for standard clean paper output.

#### Test 3.5: QR Code Verification with Camera Scanner (`/staff/verify`)
1. On Device B (Mobile), log in as staff and navigate to `/staff/verify`.
2. Tap "Start Camera Scanner" and allow browser camera permissions.
3. Point Device B's camera at the QR code displayed on Device A's certificate print preview (or enter verification code manually).
4. **Verify**:
   - Camera detects QR code within milliseconds and stops scanner.
   - Calls `GET /api/v1/staff/verify/:code`.
   - Detailed audit card renders: Certificate Number, Verification Code, Recipient Name (`issued_to_name`), Document Name, Validity Status (`VALID`), Purpose, Issued Date, Expiry Date, Issuing Staff Name, and Tracking Number.

#### Test 3.6: Release Certificate with Payment Record
1. On Device A, click "Release Document".
2. Release modal prompts for payment verification:
   - Payment Status: `Paid`
   - Payment Reference / O.R. Number: `OR-2026-9901`
3. Click "Confirm Release".
4. **Expected**: Status transitions to `released`. Paid timestamp and fee recorded.

#### Test 3.7: Archive Record & Reports Export (`/staff/reports`)
1. Click "Archive Record".
   - Status transitions to `archived`. Record moves from Queue to `/staff/records`.
2. Navigate to `/staff/reports`.
3. **Verify**:
   - Date range selector defaults to Asia/Manila current month (`YYYY-MM-01` to current date).
   - Date range validation enforces `from <= to`, maximum span of 366 days, and requires both dates.
   - When date range is invalid, inline warning displays and export buttons are disabled.
   - Summary stat cards display Total Requests, Released, Rejected, Revenue, and Waived.
   - `by_status` breakdown table renders counts for each status.
   - Paginated transactions table lists up to 50 records per page.
   - If transactions reach 1,000, a truncation alert advises narrowing the date range.
4. Click "Export PDF". File `quickfile_export_...pdf` downloads via streaming blob.
5. Click "Export Word (.docx)". File `.docx` downloads.
6. Click "Export Excel (.xlsx)". File `.xlsx` downloads.

---

### Role 4: System Administrator (Device A - Desktop)

#### Test 4.1: Executive Dashboard & Live Polling (`/admin/dashboard`)
1. Log in with admin credentials (`admin@quickfile.gov.ph` / `Admin@123456`).
2. Navigate to `/admin/dashboard`.
3. **Verify**:
   - KPI cards render: Today's Collections (PHP), Active Citizens, Staff Accounts, Queue Backlog.
   - Document Demand Breakdown lists request distribution and revenue.
   - Live stats poll runs every 15 seconds without HTTP 429 errors.

#### Test 4.2: Staff Management & Granular Permissions Matrix (`/admin/staff`)
1. Navigate to `/admin/staff`.
2. Click "Provision Staff Account".
   - Enter Full Name: `Carlos Officer`
   - Email: `carlos@quickfile.gov.ph`
   - Initial Password: `StaffPassword@123`
   - Click "Provision Account".
3. On Carlos's row, click "Permissions".
   - Permissions modal exposes 7 exact checkboxes matching backend permission fields:
     - `can_review_requests` (Review & approve/reject incoming requests)
     - `can_prepare_documents` (Prepare requests & file walk-in requests)
     - `can_print_documents` (Issue & print certificates)
     - `can_release_documents` (Release certificates & collect payments)
     - `can_verify_qr` (Scan & audit QR verification codes)
     - `can_view_reports` (View analytics & export PDF/Word/Excel reports)
     - `can_archive_records` (Archive completed/rejected records & browse archives)
   - Toggle desired permissions and click "Update Permissions".
4. **Verify**: When logging in as Carlos, navigation items and workflow action buttons adapt strictly to assigned permissions.

#### Test 4.3: Destructive Actions & Typed `DELETE` Confirmation
1. On Carlos's row in `/admin/staff`, click the red trash icon.
2. **Verify**:
   - `TypedDeleteModal` opens with warning: *"This account will be permanently expunged."*
   - "Delete Permanently" button is disabled.
   - Type `delete` (lowercase) -> button remains disabled.
   - Type `DELETE` (exact uppercase) -> button is enabled.
3. Click "Delete Permanently".
4. **Expected**: Staff account is permanently expunged.

#### Test 4.4: Document Types Catalog (`/admin/document-types`)
1. Navigate to `/admin/document-types`.
2. Click "New Document Type".
   - Document Name: `Certificate of Solo Parent`
   - Code: `CSP`
   - Fee: `100`
   - Processing Turnaround: `2` days
   - Add Requirements: `Birth Certificate of Children`, `Barangay Certification of Non-Cohabitation`.
3. Click "Create Document Type".
4. **Verify**: Document type immediately appears in catalog and citizen filing form.

#### Test 4.5: System Settings & Super Admin Key Flow (`/admin/settings`)
1. Navigate to `/admin/settings`.
2. **Verify**:
   - Integration cards render for all 5 integrations:
     1. Google OAuth (`GOOGLE_CLIENT_ID`)
     2. SMS Gateway / PhilSMS (`PHILSMS_API_KEY`)
     3. SMTP Mailer (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`)
     4. Google reCAPTCHA v2 (`RECAPTCHA_SECRET_KEY`)
     5. REST API Gateway Security (`CUSTOM_REST_API_SECRET_KEY`)
   - Sensitive credentials show masked strings (`••••••••••••`).
   - Badges indicate `DEFAULT` (subtle gray) or `CUSTOM` (accent blue).
3. In any card, enter a new custom key/credential and click "Save Settings".
4. **Expected**: `SuperAdminKeyModal` opens.
5. Enter an invalid key (e.g. `wrong-key`) and click "Authorize & Save".
6. **Expected**:
   - Modal displays error with remaining attempts before lockout.
   - Key is cleared immediately from memory.
   - The admin is NOT logged out (invalid Super Admin Key on `/admin/settings` does not purge the auth session).
7. Enter the valid Super Admin Key and click "Authorize & Save".
8. **Expected**:
   - Settings save successfully.
   - Source badge flips to `CUSTOM`.
   - Super Admin Key is immediately cleared and zeroed out from state.
9. Click "Reset to Default" on any integration.
   - Prompts `SuperAdminKeyModal`.
   - Enter valid Super Admin Key and confirm.
   - Credentials reset to environment defaults and badge returns to `DEFAULT`.

#### Test 4.6: Simulated 423 Lockout Message
1. If failed key attempts exceed the configured limit (15 attempts within window), the backend locks out the Super Admin Key.
2. **Expected**:
   - Modal closes automatically.
   - A prominent red alert banner displays: *"Super Admin Key Lockout Active: Super Admin Key is locked due to excessive failed attempts. Try again in 30 minute(s)."*

---

## 3. Production Build & Deployment Guidelines

### 3.1 Environment Configuration

#### Frontend (`frontend/.env.production`)
```env
# URL to QuickFile API Version 1 (do not include trailing slash)
VITE_API_URL=https://api.quickfile.gov.ph/api/v1
```

#### Backend (`backend/.env`)
```env
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://quickfile.gov.ph
PUBLIC_APP_URL=https://api.quickfile.gov.ph
MONGO_URI=mongodb+srv://...
JWT_SECRET=super_secret_jwt_key_at_least_32_characters_long
SU_ADMIN_KEY=super_admin_production_key_minimum_16_chars
BARANGAY_NAME=San Isidro
CITY_MUNICIPALITY=Makati City
PROVINCE=Metro Manila
TRUST_PROXY=1
```

---

### 3.2 Recommended HTTP Security Headers

When serving the frontend via Nginx, Caddy, Cloudflare, or AWS CloudFront, enforce the following production security headers:

```http
# Prevent clickjacking
X-Frame-Options: DENY

# Block MIME-type sniffing
X-Content-Type-Options: nosniff

# XSS Protection for legacy browsers
X-XSS-Protection: 1; mode=block

# Enforce HTTPS strictly for 1 year
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload

# Restrict referrer exposure
Referrer-Policy: strict-origin-when-cross-origin

# Hardware permission controls
Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=()
```

---

### 3.3 Content Security Policy (CSP)

A strict, defense-in-depth Content Security Policy prevents cross-site scripting (XSS), data injection, and unauthorized frame embedding:

```text
Content-Security-Policy:
  default-src 'self';
  script-src 'self' https://www.google.com https://www.gstatic.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https:;
  font-src 'self';
  connect-src 'self' https://api.quickfile.gov.ph https://www.google.com https://identitytoolkit.googleapis.com;
  frame-src 'self' https://www.google.com https://recaptcha.google.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  upgrade-insecure-requests;
```

---

### 3.4 Web Server SPA Rewrite Configurations

#### Nginx (`/etc/nginx/sites-available/quickfile`)
```nginx
server {
    listen 80;
    server_name quickfile.gov.ph;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name quickfile.gov.ph;

    ssl_certificate /etc/letsencrypt/live/quickfile.gov.ph/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/quickfile.gov.ph/privkey.pem;

    root /var/www/quickfile/frontend/dist;
    index index.html;

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    # Static assets caching
    location ~* \.(?:css|js|woff2?|svg|png|jpg|ico)$ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # SPA fallback rewrite
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(self), microphone=(), geolocation=()" always;
}
```

---

### 3.5 Capacitor Native Mobile Packaging (iOS & Android)

QuickFile is built without cookies, relying entirely on Bearer tokens stored in `localStorage`, making it 100% Capacitor-ready.

1. **Install Capacitor CLI**:
   ```bash
   npm install --save-exact @capacitor/core@6.2.0 @capacitor/cli@6.2.0 @capacitor/camera@6.1.2
   npx cap init QuickFile ph.gov.quickfile --web-dir dist
   ```

2. **Add Platforms**:
   ```bash
   npm run build
   npx cap add android
   npx cap add ios
   ```

3. **Android Camera Permission (`android/app/src/main/AndroidManifest.xml`)**:
   ```xml
   <uses-permission android:name="android.permission.CAMERA" />
   <uses-feature android:name="android.hardware.camera" android:required="false" />
   ```

4. **iOS Camera Usage Description (`ios/App/App/Info.plist`)**:
   ```xml
   <key>NSCameraUsageDescription</key>
   <string>QuickFile requires camera access to scan and verify official Barangay document QR codes.</string>
   ```

5. **Sync & Run**:
   ```bash
   npm run build
   npx cap sync
   npx cap open android # or npx cap open ios
   ```
