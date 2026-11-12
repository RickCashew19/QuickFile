# QuickFile Frontend Manual Test Checklist

Use this checklist to perform manual verification in a desktop or mobile browser.

---

### Test Suite 1: Responsive Layout & Mobile Viewport (360px)
- [ ] **Step 1.1**: Open DevTools, switch to responsive device mode, and set viewport to **360px &times; 640px**.
- [ ] **Step 1.2**: Navigate to `/`, `/login`, `/register`, `/verify`, and `/404`.
- [ ] **Expected**:
  - No horizontal scrolling occurs on any screen (`document.documentElement.scrollWidth === window.innerWidth`).
  - All interactive buttons and inputs have a touch target height of at least 44px (`min-height: 44px`).
  - Text remains legible without truncation.

---

### Test Suite 2: Public Landing Page & Configuration Hydration
- [ ] **Step 2.1**: Start the backend and frontend (`npm --prefix backend run dev` and `npm --prefix frontend run dev` from the repository root), then open `http://localhost:5173/`.
- [ ] **Step 2.2**: Observe the brand header, hero title, and footer.
- [ ] **Expected**:
  - Barangay Name and Jurisdiction match backend settings (`Barangay Central, City Hall, Metro Manila`).
  - "Request Document" button directs guest to `/login?redirect=/citizen/requests/new`.
  - "Verify Certificate" button directs user to `/verify`.

---

### Test Suite 3: User Authentication & Role-Based Navigation
- [ ] **Step 3.1**: Navigate to `/login`.
- [ ] **Step 3.2**: Enter invalid credentials (`wrong@example.com` / `wrongpass`) and submit.
- [ ] **Expected**: Red alert appears: *"Invalid email or password."* Form stays populated with email.
- [ ] **Step 3.3**: Log in with citizen credentials.
- [ ] **Expected**: Successfully redirects to `/citizen/dashboard`.
- [ ] **Step 3.4**: Attempt to navigate directly to `/admin/dashboard` while logged in as citizen.
- [ ] **Expected**: Blocked by `RoleRoute` and automatically redirected back to `/citizen/dashboard`.

---

### Test Suite 4: Forgot & Reset Password Flow (Token Wipe)
- [ ] **Step 4.1**: Navigate to `/forgot-password`.
- [ ] **Step 4.2**: Enter any email address and submit.
- [ ] **Expected**: Displays generic success message: *"If the email address is registered, instructions have been sent."*
- [ ] **Step 4.3**: Simulate receiving a reset link by navigating to:
  `http://localhost:5173/reset-password?token=mock_sample_reset_token`
- [ ] **Expected**:
  - The token is captured by React state.
  - Immediately, the browser URL changes to `http://localhost:5173/reset-password` without reload (`history.replaceState`).
  - Inspecting the address bar confirms no secret token is visible.

---

### Test Suite 5: Public Certificate QR Verification
- [ ] **Step 5.1**: Navigate to `/verify`.
- [ ] **Step 5.2**: Input a citizen tracking number: `QF-2026-0001` and click "Verify".
- [ ] **Expected**: Amber alert appears: *"The code you entered starts with QF-, which is a Request Tracking Number. Tracking numbers are private to residents and can be tracked inside the Citizen Portal."*
- [ ] **Step 5.3**: Input an invalid certificate code: `CERT-NONEXISTENT`.
- [ ] **Expected**: Red alert appears: *"Verification record not found. The certificate code is invalid or does not exist."*
- [ ] **Step 5.4**: Input a valid seeded certificate code (e.g., from an issued document).
- [ ] **Expected**: Displays Document Name, Certificate Number, Issued Date, and green `VALID` badge. No resident personal information (PII) is displayed.

---

### Test Suite 6: Session Invalidation & Auto-Logout
- [ ] **Step 6.1**: While logged in, manually invalidate the token in DevTools Application storage or simulate a 401 response.
- [ ] **Step 6.2**: Trigger an authenticated action.
- [ ] **Expected**:
  - User is immediately logged out.
  - Redirected to `/login` with an informational warning: *"Your session has expired. Please log in again."*

---

### Test Suite 7: Accessibility & Keyboard Navigation
- [ ] **Step 7.1**: Open `/login` and press `Tab` key repeatedly.
- [ ] **Expected**:
  - High-visibility focus outline (`2px solid var(--color-primary)`) wraps each input and button.
  - Pressing `Enter` on any button or inside an input submits the form.
  - Opening a modal traps focus; pressing `Escape` closes the modal.

---

### Test Suite 8: Citizen Dashboard & Completeness Banner
- [ ] **Step 8.1**: Log in as a resident. Navigate to `/citizen/dashboard`.
- [ ] **Expected**:
  - Greeting card displays resident's full name.
  - If profile lacks birthdate or gender, an amber banner warns *"Profile Incomplete (X%)"* with a direct link to `/citizen/profile`.
  - Status summary metric cards display real-time counters (Pending, Processing, Ready, Completed).
  - Recent requests table lists the 5 most recent submissions with direct link to view full details.

---

### Test Suite 9: Document Catalog & Request Submission
- [ ] **Step 9.1**: Navigate to `/citizen/catalog`.
- [ ] **Expected**: All active document types are displayed with their requirements, processing times, and fees. Clicking "Request Document" opens `/citizen/requests/new?doc=<id>`.
- [ ] **Step 9.2**: On `/citizen/requests/new`, pre-filled profile information is loaded.
- [ ] **Step 9.3**: Enter a purpose exceeding 500 characters or negative copies.
- [ ] **Expected**: Client-side validator displays inline errors before submit.
- [ ] **Step 9.4**: Adjust copies from 1 to 3.
- [ ] **Expected**: Fee summary box dynamically recalculates total fee in real time.
- [ ] **Step 9.5**: Upload an attachment (JPG, PNG, WEBP, or PDF up to 5MB).
- [ ] **Step 9.6**: Submit the form.
- [ ] **Expected**: Button enters loading state to prevent double submission. A confirmation screen appears displaying the generated Tracking Number (e.g., `QF-2026-XXXX`) with a "Copy Tracking Number" button and direct link to track.

---

### Test Suite 10: Request History & Status Filtering
- [ ] **Step 10.1**: Navigate to `/citizen/requests`.
- [ ] **Expected**: Paginated table/cards displaying all resident requests.
- [ ] **Step 10.2**: Select status filter: "Pending".
- [ ] **Expected**: List immediately filters to pending requests only.
- [ ] **Step 10.3**: Change rows per page dropdown (10, 20, 50).
- [ ] **Expected**: Pagination controls update accordingly.
- [ ] **Step 10.4**: Click the "Copy" icon next to any tracking number.
- [ ] **Expected**: Clipboard captures tracking number and icon briefly switches to a green checkmark reading "Copied".

---

### Test Suite 11: Request Detail, Live 8s Polling, & Secure Downloads
- [ ] **Step 11.1**: Open `/citizen/requests/:trackingNumber`.
- [ ] **Expected**:
  - Visual status timeline shows stage progress (Submitted, Under Review, Approved, In Preparation, Ready for Pickup, Released).
  - Fee and payment status badges are displayed.
  - Attached documents are listed. Clicking "Download" retrieves file blob with Authorization header and triggers browser save dialog; object URL is cleanly revoked.
- [ ] **Step 11.2**: In another browser tab as staff, approve or advance the request status.
- [ ] **Expected**: Within 8 seconds, the citizen status detail page automatically updates without requiring a manual page refresh.
- [ ] **Step 11.3**: While status is "pending", click "Cancel Request".
- [ ] **Expected**: Modal prompts for cancellation reason. Submitting cancels the request and updates status to `cancelled`.

---

### Test Suite 12: Editing Pending Requests
- [ ] **Step 12.1**: From a pending request detail view, click "Edit Request" or visit `/citizen/requests/:trackingNumber/edit`.
- [ ] **Step 12.2**: Update the purpose, copies, or select "Replace existing attachments".
- [ ] **Step 12.3**: Submit changes.
- [ ] **Expected**: Redirects to detail view with updated data. If staff has advanced the request in the background, a 409 conflict alert is shown.

---

### Test Suite 13: Citizen Profile Completeness & Notifications
- [ ] **Step 13.1**: Navigate to `/citizen/profile`.
- [ ] **Expected**: Profile completeness progress bar displays calculated percentage score (0-100%).
- [ ] **Step 13.2**: Click "Edit Profile", update personal and contact details, and save.
- [ ] **Expected**: Profile saves successfully, user greeting in the top navigation updates, and completeness score recomputes.
- [ ] **Step 13.3**: Navigate to `/citizen/notifications`.
- [ ] **Expected**:
  - Unread notifications show an unread dot and blue border.
  - Header bell icon reflects current unread count.
  - Clicking "Mark Read" updates notification state and decreases unread count.
  - Clicking "Clear All" opens a modal; confirming purges notifications.

---

### Test Suite 14: Staff Dashboard & Live 10s Polling
- [ ] **Step 14.1**: Log in with staff credentials (`staff@quickfile.gov.ph`). Navigate to `/staff/dashboard`.
- [ ] **Expected**:
  - Staff workspace header welcomes staff member by full name.
  - KPI summary stat cards display counts from `data.kpis` (Pending Review, Under Review, In Preparation, Ready for Pickup, Released Today).
  - Quick action shortcuts (Review Queue, Walk-In Filing, QR Scanner, Reports) are displayed according to staff permissions.
  - Pending review queue table is populated from `data.pending_queue`.
- [ ] **Step 14.2**: In another browser window as citizen, file a new document request.
- [ ] **Expected**: Within 10 seconds, the staff dashboard live polling updates the pending queue and KPIs without manual page reload.

---

### Test Suite 15: Staff Request Queue & Filtering
- [ ] **Step 15.1**: Navigate to `/staff/requests`.
- [ ] **Expected**: Request queue reads `data.items` and `data.pagination.total`. Displays Tracking Number, Resident Name/Email, Document Type, Copies, Status Badge, and Date Requested.
- [ ] **Step 15.2**: Filter by status: "Pending".
- [ ] **Expected**: Only pending applications are listed.
- [ ] **Step 15.3**: Filter by specific Document Type (e.g. "Barangay Clearance"), search by resident name (clamped to 100 characters max), and select date range (`from <= to`).
- [ ] **Expected**: List filters dynamically; clicking "Reset Filters" clears all inputs and returns to full listing.
- [ ] **Step 15.4**: Click "View Details" on any request.
- [ ] **Expected**: Opens `/staff/requests/:id`.

---

### Test Suite 16: Staff Document Processing Workflow & 409 Conflict Handling
- [ ] **Step 16.1**: Open a pending request at `/staff/requests/:id`.
- [ ] **Expected**:
  - Request detail view renders modular subcomponents: `ApplicantInfoCard` (purok, address, contact, civil status), `RequestSpecsCard` (purpose, copies, custom fields), `PaymentIssuanceCard` (fee, payment status, OR #, certificates), and `AttachmentListCard` (authenticated download via `apiClient.download` with `URL.revokeObjectURL`).
  - Action buttons are gated strictly by `getAvailableActions`: "Start Review" and "Reject" (guarded by `can_review_requests`).
- [ ] **Step 16.2**: Click "Start Review".
- [ ] **Expected**: Status transitions to `under_review`. Action Bar now shows "Approve Application" and "Reject" (`can_review_requests`).
- [ ] **Step 16.3**: Add an internal processing note in the sidebar notes section.
- [ ] **Expected**: Note is appended with timestamp and staff member attribution; note is flagged as staff-only and never leaked to citizen.
- [ ] **Step 16.4**: Click "Approve Application".
- [ ] **Expected**: Status transitions to `approved`. Action Bar displays "Prepare Document" (`can_prepare_documents`).
- [ ] **Step 16.5**: Click "Prepare Document".
- [ ] **Expected**: Status transitions to `in_preparation`. Action Bar displays "Issue & Ready for Pickup" (`can_print_documents`).
- [ ] **Step 16.6**: Click "Issue & Ready for Pickup".
- [ ] **Expected**: Status transitions to `ready_for_pickup`. Backend calls `POST /staff/requests/:id/issue` and creates `IssuedDocument` with certificate number and verification QR code.
- [ ] **Step 16.7 (409 Conflict Recovery)**: In a second tab/session, advance the request state or have another user change it. Return to first tab and click an action.
- [ ] **Expected**: Catch handler detects 409 Conflict, displays an amber banner: *"This request was updated by another staff member. Reloading latest state..."*, and automatically refetches the latest request details.
- [ ] **Step 16.8**: Click "Release Document".
- [ ] **Expected**: Release modal appears (guarded by `can_release_documents`). For fee-bearing documents, staff can confirm payment collected (with optional OR #) or fee waiver (with required waiver reason). Confirming transitions status to `released`.
- [ ] **Step 16.9**: Click "Archive Record".
- [ ] **Expected**: Guarded by `can_archive_records`. Transitions terminal request status to `archived`.

---

### Test Suite 17: Official Certificate Print Layout & Print CSS
- [ ] **Step 17.1**: From a request in `ready_for_pickup` or `released` status, click "Print Certificate" or visit `/staff/requests/:id/print`.
- [ ] **Expected**:
  - Official Certificate Paper layout renders with Republic of the Philippines, Province, City/Municipality, Barangay Name, and Office of the Barangay Captain.
  - Citizen name, civil status, address, purpose, certificate number, date issued, and validity expiry (`Valid Until: <date>`) are displayed.
  - Official cryptographic verification QR code image and verification code are displayed.
  - Signatory blocks display certified/noted lines with Barangay Secretary and Barangay Captain names.
  - Top control bar provides "Print Certificate" and "Back to Request" buttons.
- [ ] **Step 17.2**: Click "Print Certificate" or trigger browser print preview (`Ctrl+P` / `Cmd+P`).
- [ ] **Expected**:
  - Calls `printService.print()` (`window.print()`).
  - All navigation headers, sidebars, drawers, buttons, and control bars are completely hidden (`display: none !important`).
  - Only the clean official certificate paper sheet is formatted for standard print output.
- [ ] **Step 17.3**: If signatories are not configured in backend settings.
- [ ] **Expected**: 409 error is caught and a warning alert explains that Barangay Captain and Secretary must be configured in Settings before printing.

---

### Test Suite 18: Staff Walk-In Filing & Resident Search
- [ ] **Step 18.1**: Navigate to `/staff/requests/walk-in`.
- [ ] **Expected**: Walk-in form displays Step 1 (Resident Identification), Step 2 (Document Specifications), and Step 3 (Attachments).
- [ ] **Step 18.2**: In Resident Search input, type fewer than 3 characters.
- [ ] **Expected**: Search does not trigger.
- [ ] **Step 18.3**: Type at least 3 characters (e.g. "Mar").
- [ ] **Expected**: Accessible dropdown list (`role="listbox"`) of matching registered resident citizens appears. Supports keyboard navigation (`ArrowDown`, `ArrowUp`, `Enter`, `Escape`).
- [ ] **Step 18.4**: Select a resident.
- [ ] **Expected**: Selected resident is locked into a resident summary chip with a "Change Resident" button.
- [ ] **Step 18.5**: Select document type, enter purpose, copies, and optionally drop up to 3 requirement files into `FileDropzone` (using `onChange`).
- [ ] **Step 18.6**: Click "Create Walk-In Request".
- [ ] **Expected**:
  - Request is created immediately.
  - In-page success confirmation screen appears displaying tracking number, summary, link to process request (if staff has `can_review_requests`), and buttons to file another or return to dashboard.

---

### Test Suite 19: Staff QR Scanner & Audit Verification
- [ ] **Step 19.1**: Navigate to `/staff/verify`.
- [ ] **Expected**: Camera scanner prompt and manual verification code input fallback form are displayed.
- [ ] **Step 19.2**: Click "Start Camera Scanner" on a camera-capable device or enter a valid verification code in the manual input fallback.
- [ ] **Step 19.3**: Submit code.
- [ ] **Expected**:
  - Calls `GET /api/v1/staff/verify/:code`.
  - Comprehensive audit card renders showing Document Title, Resident Name (`issued_to_name`), Certificate Number, Verification Code, Purpose, Issued Date, Expiry Date, Issuing Staff Member, and Tracking Number.
  - Validity badge shows `VALID` (green), `EXPIRED` (amber), or `REVOKED` (red).
  - Status transition audit history timeline is displayed.
  - "Scan Another Document" button resets the view.

---

### Test Suite 20: Reports & Analytics (PDF, Word, Excel Exports)
- [ ] **Step 20.1**: Navigate to `/staff/reports`.
- [ ] **Expected**:
  - Date range inputs default to Asia/Manila current month (`YYYY-MM-01` to current date).
  - Date validation enforces `from <= to`, max 366 days, and requires both dates; export buttons are disabled if invalid.
  - Summary KPI cards display Total Requests, Released Documents, Rejected Requests, Collected Revenue, and Waived Requests.
  - `by_status` breakdown table displays counts across all statuses.
  - Paginated transactions table lists up to 50 records per page.
  - If records reach 1,000, a truncation notice informs the user.
  - Top action group contains three export buttons: "Export PDF", "Export Word (.docx)", and "Export Excel (.xlsx)".
- [ ] **Step 20.2**: Click "Export PDF".
- [ ] **Expected**: Button shows loading spinner. File downloads automatically with filename `quickfile_export_...pdf`.
- [ ] **Step 20.3**: Click "Export Word (.docx)".
- [ ] **Expected**: Downloads Word document (`.docx`).
- [ ] **Step 20.4**: Click "Export Excel (.xlsx)".
- [ ] **Expected**: Downloads Excel spreadsheet (`.xlsx`).

---

### Test Suite 21: Historical Records Repository & Archiving
- [ ] **Step 21.1**: Navigate to `/staff/records`.
- [ ] **Expected**: Reads `data.items` and `data.pagination.total`. Table displays completed and archived records (released and archived statuses only; pending/review never appear).
- [ ] **Step 21.2**: Filter between "Released Only" and "Archived Only", search resident (max 100 chars), and date range (`from <= to`).
- [ ] **Expected**: List filters accordingly.
- [ ] **Step 21.3**: For a record in `released` status, click "Archive".
- [ ] **Expected**: Record transitions to `archived` and status badge updates.

---

### Test Suite 22: Admin Executive Dashboard & Real-Time Live Stats Polling
- [ ] **Step 22.1**: Log in as an Administrator (`admin@quickfile.gov.ph` / `Admin@123456`).
- [ ] **Step 22.2**: Navigate to `/admin/dashboard`.
- [ ] **Expected**:
  - Executive stat cards display Today's Collections, Active Citizens, Staff Accounts, and Queue Backlog.
  - Document Demand Breakdown table displays requests count and revenue collected per document type.
  - Recent Citizen Requests table displays recent filings with clickable tracking numbers.
  - Real-time polling runs automatically every 15 seconds without rate limiting errors.

---

### Test Suite 23: Staff Management, Granular Permissions & Password Reset
- [ ] **Step 23.1**: Navigate to `/admin/staff`.
- [ ] **Step 23.2**: Click "Provision Staff Account". Fill out full name, email, employee ID, position, and initial password.
- [ ] **Expected**: Account is created and appears in the staff directory table.
- [ ] **Step 23.3**: Click "Permissions" on a staff account.
- [ ] **Expected**: Permissions modal opens showing 7 granular checkboxes:
  - `can_review_requests`
  - `can_prepare_documents`
  - `can_print_documents`
  - `can_release_documents`
  - `can_verify_qr`
  - `can_view_reports`
  - `can_archive_records`
- [ ] **Step 23.4**: Toggle permissions and click "Update Permissions".
- [ ] **Expected**: Permissions save successfully and apply immediately.
- [ ] **Step 23.5**: Click "Reset PW" on a staff account. Enter a new password.
- [ ] **Expected**: Password resets and active sessions are invalidated.
- [ ] **Step 23.6**: Click the red trash icon on a staff member account.
- [ ] **Expected**: `TypedDeleteModal` opens. Confirm button is disabled until exact word `DELETE` is typed. Typing `DELETE` and confirming deletes the account.

---

### Test Suite 24: Citizen Registry & Master Records Search
- [ ] **Step 24.1**: Navigate to `/admin/citizens`.
- [ ] **Step 24.2**: Use the search input to filter by resident name or phone number.
- [ ] **Step 24.3**: Click "Profile" on a citizen.
- [ ] **Expected**: Resident profile modal opens with Purok/Zone, civil status, voter status, registered date, and total filings count.
- [ ] **Step 24.4**: Click "Deactivate" / "Activate".
- [ ] **Expected**: Status pill toggles between Active (green) and Inactive (red).
- [ ] **Step 24.5**: Click the red trash icon to delete a citizen.
- [ ] **Expected**: `TypedDeleteModal` opens with warning that all filed requests and uploaded attachments will be expunged. Typing `DELETE` enables the button and permanently cleans up the account.
- [ ] **Step 24.6**: Navigate to `/admin/records` and `/admin/audit-logs`.
- [ ] **Expected**: Master records and audit logs read `data.items` and `data.pagination.total`. Search input clamped to 100 characters; date range validates `from <= to`.

---

### Test Suite 25: Document Types Catalog
- [ ] **Step 25.1**: Navigate to `/admin/document-types`.
- [ ] **Step 25.2**: Click "New Document Type". Enter document name, code, fee, processing days, and add requirement items (e.g. "Valid Government ID").
- [ ] **Expected**: New document type is created and appears in the catalog table.
- [ ] **Step 25.3**: Click "Edit" to modify fee or turnaround time.
- [ ] **Expected**: Changes save and reflect immediately.
- [ ] **Step 25.4**: Click "Deactivate" to remove from citizen catalog without deleting records.

---

### Test Suite 26: System Settings, Masked Secrets, Super Admin Key Flow & 423 Lockout
- [ ] **Step 26.1**: Navigate to `/admin/settings`.
- [ ] **Expected**:
  - Integration cards render for 5 integrations: Google OAuth, PhilSMS, SMTP Mailer, Google reCAPTCHA v2, and REST API Gateway Security (`CUSTOM_REST_API_SECRET_KEY`).
  - Secret keys are masked (`••••••••••••`).
  - Source badges indicate `DEFAULT` (subtle gray) or `CUSTOM` (accent badge).
- [ ] **Step 26.2**: Enter a new Custom Google Client ID in the input field and click "Save Settings".
- [ ] **Expected**: `SuperAdminKeyModal` opens requesting Super Admin Key.
- [ ] **Step 26.3**: Enter an invalid key and click "Authorize & Save".
- [ ] **Expected**:
  - Modal displays error showing remaining attempts before lockout.
  - Key is cleared from memory.
  - Administrator is NOT logged out (401 on `/admin/settings` without `TOKEN_*` code does not trigger session expiration).
- [ ] **Step 26.4**: Enter the valid Super Admin Key and click "Authorize & Save".
- [ ] **Expected**: Settings save successfully, source badge updates to `CUSTOM`, and success alert appears. Key is cleared from state.
- [ ] **Step 26.5**: Click "Reset to Default" on the custom integration.
- [ ] **Expected**: Prompts Super Admin Key modal. Submitting valid key resets credentials to system defaults.
- [ ] **Step 26.6**: (Simulated 423 Lockout): If failed key attempts exceed limit, server returns 423 Locked.
- [ ] **Expected**: Modal closes and a prominent red alert banner displays "Super Admin Key Lockout Active: ...".

---

### Test Suite 27: Certificate DOCX Templates (Admin Management & Staff Issuance/Download)
- [ ] **Step 27.1**: As Administrator, navigate to `/admin/document-types`. Observe the "Template" column displaying badges ("Built-in" or "Custom v#").
- [ ] **Step 27.2**: Click the "Template" button on a document type (or edit and switch to "Certificate Template" tab).
- [ ] **Step 27.3**: Click "Download Starter Template (.docx)". Confirm a valid starter template downloads with pre-filled layout and QR placeholder.
- [ ] **Step 27.4**: In the Placeholders table, type in the search box to filter by key, and filter by group dropdown. Click "Copy" next to `{full_name}` and confirm button shows "Copied!" and clipboard receives `{full_name}`.
- [ ] **Step 27.5**: Attempt to upload a non-DOCX file (e.g. `.pdf` or `.png`).
- [ ] **Expected**: Client-side validation blocks upload with alert: *"Only Microsoft Word documents (.docx) are supported."*
- [ ] **Step 27.6**: Attempt to upload a valid `.docx` with unrecognized tags or broken syntax.
- [ ] **Expected**: Server returns HTTP 400 with validation report (`ApiError.data.validation`). Red error cards list syntax problems, amber warnings list missing standard tags, and unknown tags show fuzzy match suggestions.
- [ ] **Step 27.7**: Upload a valid template `.docx`.
- [ ] **Expected**: Upload succeeds with HTTP 201. Green report displays detected placeholders and confirms QR placeholder status. New version row appears in Version History table.
- [ ] **Step 27.8**: In the Version History table, click "Preview" on the uploaded version.
- [ ] **Expected**: A populated DOCX (`template-preview-v{version}.docx`) is downloaded via POST request containing sample resident data.
- [ ] **Step 27.9**: Click "Activate" on the template version.
- [ ] **Expected**: Version badge updates to "Active", document type mode updates to "Custom v{version}".
- [ ] **Step 27.10**: Click "Retire" on the active template version.
- [ ] **Expected**: Server rejects retirement with 409 Conflict. Red alert displays: *"Cannot retire an active template. Switch to built-in mode or activate another template first."*
- [ ] **Step 27.11**: Click "Switch to Built-in". Confirm modal dialog opens. Confirming switches mode back to "Built-in".
- [ ] **Step 27.12**: As Staff with `can_review_requests`, `can_prepare_documents`, and `can_print_documents`, open a filed request for a custom-template document type in `/staff/requests/:id`.
- [ ] **Step 27.13**: Progress the workflow through real transitions:
  - Click "Start Review" (moves to `under_review`).
  - Click "Approve Application" (moves to `approved`).
  - Click "Prepare Document" (requires `can_prepare_documents`, moves to `in_preparation`).
  - In `in_preparation` state, click "Issue & Generate Certificate" (requires `can_prepare_documents`).
- [ ] **Step 27.14**: Observe issuance result:
  - Status transitions to `ready_for_pickup`.
  - If resident's profile has empty fields, a non-blocking amber notice appears: *"Notice: The certificate template contains placeholders that were empty in the resident's record at issue time: address, occupation"*.
- [ ] **Step 27.15**: In `ready_for_pickup` (and `released`) status, observe the "Download certificate (DOCX)" button alongside "Print Certificate" with hint *"Open in Word to print"*. Clicking it downloads `certificate-{trackingNumber}.docx`.
- [ ] **Step 27.16**: Verify that `render_data` snapshot is NEVER displayed anywhere on the screen.


