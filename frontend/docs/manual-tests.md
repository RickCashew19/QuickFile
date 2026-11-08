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
