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
- [ ] **Expected**: Successfully redirects to `/citizen/requests`.
- [ ] **Step 3.4**: Attempt to navigate directly to `/admin/dashboard` while logged in as citizen.
- [ ] **Expected**: Blocked by `RoleRoute` and automatically redirected back to `/citizen/requests`.

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
