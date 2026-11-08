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
- [ ] **Step 2.1**: Start the backend (`npm start` on port 5000) and open `http://localhost:3000/`.
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
  `http://localhost:3000/reset-password?token=mock_sample_reset_token`
- [ ] **Expected**:
  - The token is captured by React state.
  - Immediately, the browser URL changes to `http://localhost:3000/reset-password` without reload (`history.replaceState`).
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

### Test Suite 14: Staff Dashboard & Live 15s Polling
- [ ] **Step 14.1**: Log in with staff credentials (`staff@quickfile.gov.ph`). Navigate to `/staff/dashboard`.
- [ ] **Expected**:
  - Staff workspace header welcomes staff member by full name.
  - KPI summary stat cards display counts for Pending Review, Under Review, In Preparation, and Ready for Pickup.
  - Quick action shortcuts (Review Queue, Walk-In Filing, QR Scanner, Reports) are displayed according to staff permissions.
  - Recent document requests table is populated.
- [ ] **Step 14.2**: In another browser window as citizen, file a new document request.
- [ ] **Expected**: Within 15 seconds, the staff dashboard live polling updates the pending counter without manual page reload.

---

### Test Suite 15: Staff Request Queue & Filtering
- [ ] **Step 15.1**: Navigate to `/staff/requests`.
- [ ] **Expected**: Request queue table displays Tracking Number, Resident Name/Email, Document Type, Copies, Status Badge, and Date Requested.
- [ ] **Step 15.2**: Filter by status: "Pending".
- [ ] **Expected**: Only pending applications are listed.
- [ ] **Step 15.3**: Filter by specific Document Type (e.g. "Barangay Clearance") and search by resident name.
- [ ] **Expected**: List filters dynamically; clicking "Reset Filters" clears all inputs and returns to full listing.
- [ ] **Step 15.4**: Click "View Details" on any request.
- [ ] **Expected**: Opens `/staff/requests/:id`.

---

### Test Suite 16: Staff Document Processing Workflow & 409 Conflict Handling
- [ ] **Step 16.1**: Open a pending request at `/staff/requests/:id`.
- [ ] **Expected**:
  - Applicant personal details, stated purpose, copies, fee, and attachments are displayed.
  - Staff Action Bar displays "Start Review" and "Reject" (guarded by `can_review_requests`).
- [ ] **Step 16.2**: Click "Start Review".
- [ ] **Expected**: Status transitions to `Under Review`. Action Bar now shows "Approve Application" and "Reject".
- [ ] **Step 16.3**: Add an internal processing note in the sidebar notes section.
- [ ] **Expected**: Note is appended with timestamp and staff member attribution; note is flagged as staff-only and never leaked to citizen.
- [ ] **Step 16.4**: Click "Approve Application".
- [ ] **Expected**: Status transitions to `Approved`. Action Bar displays "Prepare Document".
- [ ] **Step 16.5**: Click "Prepare Document".
- [ ] **Expected**: Status transitions to `In Preparation`. Action Bar displays "Issue & Generate Certificate".
- [ ] **Step 16.6**: Click "Issue & Generate Certificate".
- [ ] **Expected**: Status transitions to `Ready for Pickup`. IssuedDocument is created with certificate number and verification QR code.
- [ ] **Step 16.7 (409 Conflict Recovery)**: In a second tab/session, advance the request state or have another user change it. Return to first tab and click an action.
- [ ] **Expected**: Catch handler detects 409 Conflict, displays an amber banner: *"This request was updated by another staff member. Reloading latest state..."*, and automatically refetches the latest request details.
- [ ] **Step 16.8**: Click "Release Document".
- [ ] **Expected**: Release modal appears. For fee-bearing documents, staff can confirm payment collected (with optional OR #) or fee waiver (with required waiver reason). Confirming transitions status to `Released`.
- [ ] **Step 16.9**: Click "Archive Record".
- [ ] **Expected**: Transitions terminal request status to `Archived`.

---

### Test Suite 17: Official Certificate Print Layout & Print CSS
- [ ] **Step 17.1**: From a request in `Ready for Pickup` or `Released` status, click "Print Certificate" or visit `/staff/requests/:id/print`.
- [ ] **Expected**:
  - Official Certificate Paper layout renders with Republic of the Philippines, Province, City/Municipality, Barangay Name, and Office of the Barangay Captain.
  - Citizen name, civil status, address, purpose, and date issued are formatted into official certificate text.
  - Official cryptographic verification QR code image and verification code are displayed.
  - Signatory blocks display certified/noted lines with Barangay Secretary and Barangay Captain names.
  - Top control bar provides "Print Certificate" and "Back to Request" buttons.
- [ ] **Step 17.2**: Click "Print Certificate" or trigger browser print preview (`Ctrl+P` / `Cmd+P`).
- [ ] **Expected**:
  - All navigation headers, sidebars, drawers, buttons, and control bars are completely hidden (`display: none !important`).
  - Only the crisp official certificate paper sheet is formatted for standard print output.
- [ ] **Step 17.3**: If signatories are not configured in backend settings.
- [ ] **Expected**: 409 error is caught and a warning alert explains that Barangay Captain and Secretary must be configured in Settings before printing.

---

### Test Suite 18: Staff Walk-In Filing & Resident Search
- [ ] **Step 18.1**: Navigate to `/staff/requests/walk-in`.
- [ ] **Expected**: Walk-in form displays Step 1 (Resident Identification), Step 2 (Document Specifications), and Step 3 (Attachments).
- [ ] **Step 18.2**: In Resident Search input, type fewer than 3 characters.
- [ ] **Expected**: Search does not trigger.
- [ ] **Step 18.3**: Type at least 3 characters (e.g. "Mar").
- [ ] **Expected**: Dropdown list of matching registered resident citizens appears showing full name, email, and phone.
- [ ] **Step 18.4**: Select a resident.
- [ ] **Expected**: Selected resident is locked into a resident summary chip with a "Change Resident" button.
- [ ] **Step 18.5**: Select document type, enter purpose, copies, and optionally drop up to 3 requirement files into `FileDropzone`.
- [ ] **Step 18.6**: Click "Create Walk-In Request".
- [ ] **Expected**: Walk-in request is created and user is redirected to the new request detail page.

---

### Test Suite 19: Staff QR Scanner & Audit Verification
- [ ] **Step 19.1**: Navigate to `/staff/verify`.
- [ ] **Expected**: Camera scanner prompt and manual verification code input fallback form are displayed.
- [ ] **Step 19.2**: Click "Start Camera Scanner" on a camera-capable device or enter a valid verification code in the manual input fallback.
- [ ] **Step 19.3**: Submit code.
- [ ] **Expected**:
  - Calls `GET /api/v1/staff/verify/:code`.
  - Comprehensive audit card renders showing Document Title, Resident Name, Certificate Number, Verification Code, Issuing Staff Member, and Tracking Number.
  - Validity badge shows `VALID` (green), `EXPIRED` (amber), or `REVOKED` (red).
  - Status transition audit history timeline is displayed.
  - "Scan Another Document" button resets the view.

---

### Test Suite 20: Reports & Analytics (PDF, Word, Excel Exports)
- [ ] **Step 20.1**: Navigate to `/staff/reports`.
- [ ] **Expected**:
  - Summary KPI cards display Total Requests, Released Documents, Rejected Requests, Collected Revenue, and Waived Requests.
  - Breakdown table displays volume and revenue per Document Type.
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
- [ ] **Expected**: Table displays completed and archived records (released and archived statuses only; pending/review never appear).
- [ ] **Step 21.2**: Filter between "Released Only" and "Archived Only".
- [ ] **Expected**: List filters accordingly.
- [ ] **Step 21.3**: For a record in `Released` status, click "Archive".
- [ ] **Expected**: Record transitions to `Archived` and status badge updates.
