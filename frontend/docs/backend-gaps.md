# Backend Gaps and Frontend Mitigations

This document records any discrepancies between what frontend screens ideally present and what the backend currently provides, along with the implemented frontend workaround.

---

### Gap 1: Public Document Catalog for Unauthenticated Visitors
- **Endpoint**: `GET /api/v1/citizen/catalog`
- **Missing Capability**: The endpoint requires an active session with the `citizen` role. Guest visitors on the public landing page cannot call this endpoint to view available barangay certificates, requirements, and fee schedules.
- **Frontend Workaround**:
  The public `LandingPage` presents standard barangay services (Barangay Clearance, Certificate of Residency, Certificate of Indigency, Business Clearance) from static showcase data. When a guest clicks "Request Document", they are routed to `/login?redirect=/citizen/requests/new`. Once authenticated, the live catalog with requirements and dynamic form schemas is fetched directly from `/api/v1/citizen/catalog`.

---

### Gap 2: Live Gateway Test Endpoints (SMS & Email Providers)
- **Endpoint**: `POST /api/v1/admin/settings/test-sms` and `POST /api/v1/admin/settings/test-email`
- **Missing Capability**: The backend does not expose one-click test ping endpoints for external SMS and SMTP providers in the admin settings panel.
- **Frontend Workaround**:
  The Admin Settings UI displays the SMS and Email test buttons with a badge labeled "Coming Soon" and disabled state, accompanied by a tooltip explaining: *"Live test pings will be enabled in a future release. Current credentials are validated during server configuration save."*

---

### Gap 3: Public Request Tracking vs. QR Certificate Verification
- **Endpoint**: `GET /api/v1/verify/:code`
- **Observation**:
  Citizens might attempt to input their request tracking number (e.g. `QF-2026-0001`) into the QR certificate verification screen. The backend explicitly rejects `QF-` inputs with a 404 error: *"Invalid verification code. Tracking numbers cannot be verified here."*
- **Frontend Workaround**:
  In `PublicVerifyPage`, client-side format detection immediately recognizes codes starting with `QF-`. It displays an informative alert:
  > *"It looks like you entered a Request Tracking Number (QF-...). Tracking numbers are private to residents. Please log in to your Citizen Portal to view your live request progress."*
  with a direct link to `/login`.

---

### Gap 4: Staff and Administrator Self-Profile Updates
- **Endpoint**: `PUT /api/v1/staff/profile` or `PUT /api/v1/admin/profile`
- **Missing Capability**: While citizens have `PUT /api/v1/citizen/profile`, there are no self-service profile update endpoints for staff or admin accounts (only `GET /api/v1/auth/me` exists for reading profile information).
- **Frontend Workaround**:
  For Staff and Admin users, the Profile modal displays their account details (name, position, department, assigned permissions) as read-only. Staff profile changes are administered through `AdminStaffManagementPage` (`PUT /api/v1/admin/staff/:id`). Password changes can be accomplished via `/forgot-password`.

---

### Gap 5: Super Admin Key Authorization (401) vs JWT Session Expiration (401)
- **Endpoint**: `PATCH /api/v1/admin/settings`
- **Observation**:
  When an administrator inputs an invalid Super Admin Key during settings modification or credential reset, the backend throws an authentication error with status `401 Unauthorized` and message *"Invalid Super Admin Key. X attempt(s) remaining before lockout."* Under standard frontend interceptor rules, any 401 response invalidates the session and logs the user out.
- **Frontend Workaround**:
  In `frontend/src/services/apiClient.js`, `/admin/settings` is explicitly identified as a Super Admin step-up verification endpoint. 401 responses on this endpoint do not purge tokens or trigger session expiration. The `ApiError` is returned directly to `AdminSettingsPage` and `SuperAdminKeyModal`, displaying the remaining attempt count to the administrator while preserving their session.

---

### Gap 6: Document Type Deletion Blocked by Existing Request References
- **Endpoint**: `DELETE /api/v1/admin/document-types/:id`
- **Observation**:
  If a document type has even one historical filing in the barangay database, the backend blocks hard deletion with a 400 error: *"Cannot delete document type because X existing request(s) reference it. Please deactivate it instead."*
- **Frontend Workaround**:
  `AdminDocTypesPage` provides an immediate, one-click "Deactivate" / "Activate" toggle button right next to "Edit" and "Delete". In addition, when hard deletion is attempted and rejected by the backend constraint, a descriptive alert recommends deactivating the document type so historical audit integrity is preserved while hiding the certificate from future citizen filings.

---

### Gap 7: Citizen Serialized Request Excludes MongoDB Internal ID
- **Endpoint**: `GET /api/v1/citizen/requests` and `GET /api/v1/citizen/requests/:trackingNumber`
- **Observation**:
  The backend citizen serializer intentionally strips internal database `_id` and handler IDs (*_by) to prevent leaking internals to residents. Document type is serialized as an object `document_type: { id, name, code, processing_days }` rather than a flat `document_type_id`.
- **Frontend Workaround**:
  Citizen routes and UI components use `tracking_number` as the primary key. Forms read from `document_type.id` or `document_type.name`.

---

### Gap 8: List Envelope Keys Between Citizen and Staff/Admin Portals
- **Endpoint**: `GET /api/v1/staff/requests`, `GET /api/v1/staff/records`, `GET /api/v1/admin/records`
- **Observation**:
  Staff and Admin lists return records under the key `data.items` with `data.pagination.total`, while citizen list endpoints return `data.requests`.
- **Frontend Workaround**:
  Staff and Admin table components resolve `response.items || response.requests || []` and `response.pagination?.total ?? response.pagination?.total_items ?? 0`.

---

### Gap 9: Document Issuance Returns Composite Request and Certificate Object
- **Endpoint**: `POST /api/v1/staff/requests/:id/issue`
- **Observation**:
  Upon transition from `in_preparation` to `ready_for_pickup`, the endpoint returns a composite object `{ request, issued_document }`.
- **Frontend Workaround**:
  The frontend unmarshals both `res.request` and `res.issued_document`, updating the request status and displaying the generated certificate details immediately.
