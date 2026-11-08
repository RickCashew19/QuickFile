# QuickFile Frontend API Contract

This document provides the definitive REST API contract between the QuickFile React frontend and Express backend. All API routes are prefixed by `/api/v1` (`VITE_API_URL`). Every response follows the standard QuickFile envelope:
```json
{
  "success": true,
  "message": "Human-readable status or error message.",
  "data": { ... }
}
```

---

## 1. Public & Guest Endpoints (No Authentication Required)

| Method | Path | Auth / Limiter | Request Payload | Response Data Shape | Screen / Feature |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health` | None | None | `{ success, message, environment, timestamp, data: null }` | System diagnostics & health check |
| `GET` | `/api/v1/public/config` | `publicLimiter` (120 req / 15m) | None | `{ system_name, barangay_name, city_municipality, province, google_client_id, recaptcha_site_key, integrations: { google_login_enabled, recaptcha_enabled, sms_notifications_enabled, email_notifications_enabled, rest_api_gateway_enabled } }` | App bootstrap, Landing, Login, Register, Header |
| `POST` | `/api/v1/auth/register` | `registerLimiter` (5 req / 1h) | `{ email, password, first_name, middle_name?, last_name, suffix?, birthdate, gender, civil_status?, contact_number?, purok_zone?, street_address?, barangay?, city?, province?, occupation?, emergency_contact_name?, emergency_contact_number?, recaptcha_token? }` | `{ access_token, token_type: "Bearer", user: { id, email, full_name, role, is_active, created_at }, profile: { ... } }` | Register Screen |
| `POST` | `/api/v1/auth/login` | `authLimiter` (15 failed/15m) + `loginEmailLimiter` (15 failed/15m/email) | `{ email, password, recaptcha_token? }` | `{ access_token, token_type: "Bearer", user: { id, email, full_name, role, is_active }, profile: { ... }?, permissions: { ... }? }` | Login Screen |
| `POST` | `/api/v1/auth/google` | `authLimiter` (15 failed/15m) | `{ id_token: string }` | `{ access_token, token_type: "Bearer", user: { id, email, full_name, role: "citizen" }, profile: { ... } }` | Login Screen (Google Sign-In) |
| `POST` | `/api/v1/auth/forgot-password` | `forgotPasswordIpLimiter` (5/1h) + `forgotPasswordEmailLimiter` (3/1h) | `{ email, recaptcha_token? }` | `null` (message: "If the email address is registered, instructions have been sent.") | Forgot Password Screen |
| `POST` | `/api/v1/auth/reset-password` | `resetPasswordLimiter` (10/1h) | `{ token, new_password }` | `null` (message: "Password has been reset successfully.") | Reset Password Screen (`/reset-password?token=...`) |
| `GET` | `/api/v1/verify/:code` | `publicLimiter` (120 req / 15m) | None | `{ validity_status: "valid"\|"expired"\|"revoked", document_name, certificate_number, issued_at, expires_at }` | Public QR Verify Screen (`/verify/:code`) |

---

## 2. Authenticated Session Endpoints (All Roles)

| Method | Path | Auth / Guard | Request Payload | Response Data Shape | Screen / Feature |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/auth/me` | `authenticate` | None | `{ user: { id, email, full_name, role, is_active }, profile: object \| null, permissions: object \| null }` | AuthContext initialization, user profile hydration |
| `POST` | `/api/v1/auth/logout` | `authenticate` | None | `null` (message: "User logged out successfully.") | User Menu Logout action |
| `GET` | `/api/v1/files/attachments/:filename` | `authenticate` + `userApiLimiter` | None | Binary file stream (`Content-Disposition: inline` or `attachment`) | Attachment preview modal & file download |

---

## 3. Citizen Portal Endpoints (`role: citizen`)

| Method | Path | Auth / Guard | Request Payload | Response Data Shape | Screen / Feature |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/citizen/catalog` | `authenticate` + `userApiLimiter` | None | `[ { _id, name, code, description, fee, processing_days, requirements: [], form_schema: {}, is_active } ]` | Citizen New Request Catalog, Landing preview |
| `GET` | `/api/v1/citizen/profile` | `authorize("citizen")` | None | `{ profile: { ... }, completeness_percentage: number, missing_fields: string[] }` | Citizen Profile Screen, Profile completeness banner |
| `PUT` | `/api/v1/citizen/profile` | `authorize("citizen")` | `{ first_name, middle_name, last_name, suffix, birthdate, gender, civil_status, contact_number, purok_zone, street_address, barangay, city, province, occupation, voter_status, emergency_contact_name, emergency_contact_number, valid_id_type, valid_id_number, proof_of_residency_type }` | `{ profile: { ... } }` | Citizen Profile Edit Screen |
| `GET` | `/api/v1/citizen/profile/reuse` | `authorize("citizen")` | None | `{ first_name, middle_name, last_name, suffix, birthdate, gender, civil_status, contact_number, purok_zone, street_address, barangay, city, province, occupation }` | Citizen Request Form Pre-filling |
| `POST` | `/api/v1/citizen/requests` | `authorize("citizen")` (`multipart/form-data`) | `document_type_id`, `purpose`, `copies`, `form_data` (JSON string or object), `attachments` (file array up to 3) | Serialized citizen request: `{ tracking_number, document_type, purpose, copies, status, unit_fee, fee, payment_status, form_data, attachments, created_at, ... }` | Citizen Submit Request Screen |
| `GET` | `/api/v1/citizen/requests` | `authorize("citizen")` | Query: `?page=1&limit=10&status=pending` | `{ requests: [ ... ], pagination: { total, page, limit, totalPages } }` | Citizen Requests List Screen |
| `GET` | `/api/v1/citizen/requests/:trackingNumber` | `authorize("citizen")` | None | Serialized citizen request `{ tracking_number, document_type, purpose, copies, status, fee, payment_status, form_data, rejection_reason, cancellation_reason, attachments, timestamps }` | Citizen Request Details Screen |
| `GET` | `/api/v1/citizen/requests/:trackingNumber/status` | `pollingLimiter` (120 req / 15m) | None | `{ tracking_number, status, updated_at, rejection_reason, ready_at, released_at }` | Citizen Request Status Live Polling (Lightweight) |
| `PUT` | `/api/v1/citizen/requests/:trackingNumber` | `authorize("citizen")` (`multipart/form-data`) | `purpose`, `copies`, `form_data`, `replace_attachments`, `attachments` (file array up to 3) | Serialized citizen request | Citizen Edit Pending Request Screen |
| `POST` | `/api/v1/citizen/requests/:trackingNumber/cancel` | `authorize("citizen")` | `{ cancellation_reason }` | Serialized citizen request with `status: "cancelled"` | Citizen Request Cancel Action |
| `GET` | `/api/v1/citizen/notifications` | `authenticate` | Query: `?page=1&limit=20` | `{ notifications: [ { _id, title, message, type, is_read, link, created_at } ], unread_count: number }` | Citizen Notification Bell & List |
| `PATCH` | `/api/v1/citizen/notifications/read-all` | `authenticate` | None | `{ modified_count: number }` | Mark All Notifications Read |
| `PATCH` | `/api/v1/citizen/notifications/:id/read` | `authenticate` | None | Updated notification | Mark Single Notification Read |
| `DELETE` | `/api/v1/citizen/notifications/:id` | `authenticate` | None | `{ deleted: true }` | Delete Notification |
| `DELETE` | `/api/v1/citizen/notifications` | `authenticate` | None | `{ deleted_count: number }` | Clear All Notifications |

---

## 4. Staff Portal Endpoints (`role: staff` or `role: admin`)

| Method | Path | Auth / Permission Guard | Request Payload | Response Data Shape | Screen / Feature |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/staff/requests/live-stats` | `pollingLimiter` (120 req / 15m) | None | `{ pending, under_review, approved, in_preparation, ready_for_pickup, released, total_active }` | Staff Dashboard Live Polling Badge |
| `GET` | `/api/v1/staff/dashboard` | `role(staff, admin)` | None | `{ pending_count, under_review_count, approved_count, in_preparation_count, ready_count, today_released, recent_activity }` | Staff Dashboard Summary |
| `GET` | `/api/v1/staff/requests` | `can_review_requests` | Query: `?page=1&limit=10&status=&search=` | `{ requests: [ ... ], pagination: { ... } }` | Staff Request Queue Screen |
| `GET` | `/api/v1/staff/requests/:id` | `can_review_requests` | None | Full request record including citizen details, internal processing notes, attachments, history | Staff Request Detail Modal / Page |
| `POST` | `/api/v1/staff/requests/:id/notes` | `can_review_requests` | `{ note: string }` | Updated request with appended note & staff attribution | Staff Internal Notes Drawer |
| `POST` | `/api/v1/staff/requests/:id/review` | `can_review_requests` | None | Updated request (`status: "under_review"`) | Action: Start Review |
| `POST` | `/api/v1/staff/requests/:id/approve` | `can_review_requests` | None | Updated request (`status: "approved"`) | Action: Approve Request |
| `POST` | `/api/v1/staff/requests/:id/reject` | `can_review_requests` | `{ rejection_reason: string }` | Updated request (`status: "rejected"`) | Action: Reject Request Modal |
| `POST` | `/api/v1/staff/requests/:id/prepare` | `can_prepare_documents` | None | Updated request (`status: "in_preparation"`) | Action: Mark in Preparation |
| `POST` | `/api/v1/staff/requests/:id/issue` | `can_prepare_documents` | `{ remarks?: string }` | Updated request (`status: "ready_for_pickup"`) + Generated IssuedDocument certificate | Action: Issue Certificate |
| `GET` | `/api/v1/staff/requests/:id/print-data` | `can_print_documents` | None | `{ tracking_number, document_name, certificate_number, citizen_name, address, purpose, issued_date, official_signatory, verification_url, qr_code_data }` | Staff Document Print Preview / Action |
| `POST` | `/api/v1/staff/requests/:id/release` | `can_release_documents` | `{ payment_received: boolean, or_number?: string }` | Updated request (`status: "released"`) | Action: Release Document Modal |
| `POST` | `/api/v1/staff/requests/:id/archive` | `can_archive_records` | `{ archive_reason?: string }` | Updated request (`status: "archived"`) | Action: Archive Request |
| `GET` | `/api/v1/staff/records` | `can_archive_records` | Query: `?page=1&limit=10&status=released,archived,rejected` | `{ records: [ ... ], pagination: { ... } }` | Staff Archive / Historical Records Screen |
| `GET` | `/api/v1/staff/residents` | `can_prepare_documents` | Query: `?search=juan` | `[ { _id, full_name, email, phone, address, birthdate } ]` | Walk-In Resident Autocomplete |
| `POST` | `/api/v1/staff/requests/walk-in` | `can_prepare_documents` (`multipart`) | `citizen_id`, `document_type_id`, `purpose`, `copies`, `form_data`, `attachments` | Created request with tracking number | Staff Walk-in Filing Screen |
| `GET` | `/api/v1/staff/verify/:code` | `can_verify_qr` | None | `{ certificate_number, document_name, citizen_name, validity_status, issued_at, expires_at, verified_by, scans_count }` | Staff QR Scanner Screen |
| `GET` | `/api/v1/staff/reports` | `can_view_reports` | Query: `?from=&to=&document_type=&status=` | Aggregated metrics, status breakdowns, revenue summary | Staff Reports & Analytics Screen |
| `GET` | `/api/v1/staff/reports/export` | `can_view_reports` + `exportLimiter` | Query: `?format=pdf|xlsx|docx&from=&to=` | Binary file stream (`Content-Type: application/pdf`, etc.) | Export Staff Report Download |

---

## 5. Admin Portal Endpoints (`role: admin`)

| Method | Path | Auth / Guard | Request Payload | Response Data Shape | Screen / Feature |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/live-stats` | `pollingLimiter` | None | Global system stats: active users, total requests, queue sizes | Admin Global Live Stats Polling |
| `GET` | `/api/v1/admin/dashboard` | `requireRole("admin")` | None | KPI summary: revenue, turnaround times, request volume, staff performance | Admin Executive Dashboard |
| `GET` | `/api/v1/admin/staff` | `requireRole("admin")` | Query: `?page=1&limit=10&search=` | `{ staff: [ { user, details, permissions } ], pagination: { ... } }` | Admin Staff Accounts Management |
| `POST` | `/api/v1/admin/staff` | `requireRole("admin")` | `{ email, password, full_name, position, department, permissions: { ... } }` | Created staff account & credentials confirmation | Admin Create Staff Modal |
| `GET` | `/api/v1/admin/staff/:id` | `requireRole("admin")` | None | Full staff details, role, permissions, audit activity | Admin Staff Profile View |
| `PUT` | `/api/v1/admin/staff/:id` | `requireRole("admin")` | `{ full_name, position, department, phone }` | Updated staff profile | Admin Edit Staff Modal |
| `PATCH` | `/api/v1/admin/staff/:id/status` | `requireRole("admin")` | `{ is_active: boolean }` | `{ is_active: boolean }` | Staff Deactivate / Reactivate Action |
| `PUT` | `/api/v1/admin/staff/:id/permissions` | `requireRole("admin")` | `{ can_review_requests, can_prepare_documents, can_print_documents, can_release_documents, can_verify_qr, can_view_reports, can_archive_records }` | Updated `StaffPermission` object | Staff Permission Editor Matrix |
| `POST` | `/api/v1/admin/staff/:id/reset-password` | `requireRole("admin")` | `{ new_password: string }` | `{ email: string }` | Admin Reset Staff Password Action |
| `DELETE` | `/api/v1/admin/staff/:id` | `requireRole("admin")` | `{ confirm: "DELETE" }` | `null` (message: "Staff member deleted successfully.") | Delete Staff Account (Typed DELETE) |
| `GET` | `/api/v1/admin/citizens` | `requireRole("admin")` | Query: `?page=1&limit=10&search=&is_active=&verification_status=` | `{ citizens: [ ... ], pagination: { ... } }` | Admin Citizen Directory Screen |
| `PATCH` | `/api/v1/admin/citizens/:id/status` | `requireRole("admin")` | `{ is_active: boolean }` | `{ is_active: boolean }` | Citizen Deactivate / Reactivate Action |
| `DELETE` | `/api/v1/admin/citizens/:id` | `requireRole("admin")` | `{ confirm: "DELETE" }` | `null` (message: "Citizen account and associated request records deleted successfully.") | Delete Citizen Record (Typed DELETE) |
| `GET` | `/api/v1/admin/records` | `requireRole("admin")` | Query: `?page=1&limit=15&status=&search=&from=&to=&document_type_id=` | `{ requests: [ ... ], pagination: { ... } }` | Admin Master Request Records Screen |
| `GET` | `/api/v1/admin/requests/:id` | `requireRole("admin")` | None | Complete request document including processing notes & audit history | Admin View Request Details Modal |
| `DELETE` | `/api/v1/admin/requests/:id` | `requireRole("admin")` | `{ confirm: "DELETE" }` | `null` (message: "Document request deleted successfully.") | Admin Delete Request (Typed DELETE) |
| `GET` | `/api/v1/admin/issued-documents` | `requireRole("admin")` | Query: `?page=1&limit=10&status=valid|expired|revoked&search=` | `{ documents: [ ... ], pagination: { ... } }` | Admin Issued Certificates Registry |
| `POST` | `/api/v1/admin/issued-documents/:id/revoke` | `requireRole("admin")` | `{ reason: string }` (5-200 chars) | `{ validity_status: "revoked", revoked_reason }` | Revoke Certificate Action |
| `POST` | `/api/v1/admin/issued-documents/:id/reinstate` | `requireRole("admin")` | None | `{ validity_status: "valid" }` | Reinstate Certificate Action |
| `DELETE` | `/api/v1/admin/issued-documents/:id` | `requireRole("admin")` | `{ confirm: "DELETE" }` | `null` (message: "Issued document record deleted successfully.") | Delete Certificate Record (Typed DELETE) |
| `GET` | `/api/v1/admin/audit-logs` | `requireRole("admin")` | Query: `?page=1&limit=20&module=&actor_name=&action=&from=&to=` | `{ logs: [ { timestamp, actor_name, action, module, details, ip_address } ], pagination: { ... } }` | Admin Append-Only Audit Trail Screen |
| `GET` | `/api/v1/admin/document-types` | `requireRole("admin")` | None | `[ { _id, name, code, fee, processing_days, requirements, is_active } ]` | Document Types Catalog Screen |
| `POST` | `/api/v1/admin/document-types` | `requireRole("admin")` | `{ name, code, fee, processing_days, requirements, is_active, description }` | Created document type | Add Document Type Modal |
| `GET` | `/api/v1/admin/document-types/:id` | `requireRole("admin")` | None | Full DocumentType object | Edit Document Type Form |
| `PUT` | `/api/v1/admin/document-types/:id` | `requireRole("admin")` | `{ name, code, fee, processing_days, requirements, is_active, description }` | Updated document type | Save Document Type Updates |
| `DELETE` | `/api/v1/admin/document-types/:id` | `requireRole("admin")` | `{ confirm: "DELETE" }` | `null` (message: "Document type deleted successfully.") | Delete Document Type (Typed DELETE) |
| `GET` | `/api/v1/admin/settings` | `requireRole("admin")` | None | `{ integrations: { google, sms, smtp, recaptcha, rest_api }, app_settings: [ ... ] }` (masked values) | System Settings Screen |
| `PATCH` | `/api/v1/admin/settings` | `requireRole("admin")` + `suKeyLimiter` | `{ su_admin_key: string, settings: object, reset_keys: string[] }` | `{ modified_keys: string[], integrations: object }` (or 401 invalid key / 423 locked) | Save / Reset Super Admin Protected Settings |
| `PATCH` | `/api/v1/admin/settings/toggles` | `requireRole("admin")` | `{ enable_google_login?, enable_recaptcha?, enable_sms_notifications?, enable_email_notifications?, enable_rest_api_gateway? }` | Updated feature toggles | Instant Toggle Switches |
| `PATCH` | `/api/v1/admin/settings/general` | `requireRole("admin")` | `{ system_name?, contact_email?, contact_phone?, office_name?, barangay_captain?, barangay_secretary? }` | Updated general settings | Save General Info Form |
| `GET` | `/api/v1/admin/reports` | `requireRole("admin")` | Query: `?from=&to=&document_type_id=` | Executive reports, financial revenue, SLA metrics | Admin Reports Dashboard |
| `GET` | `/api/v1/admin/reports/export` | `exportLimiter` | Query: `?format=pdf|xlsx|docx&from=&to=&document_type_id=` | Binary file stream (`Content-Type: application/pdf`, etc.) | Export Executive Report Download |

---

## 6. Frontend Route Map & Security Guards

```text
/ (PublicRoute) -> LandingPage
├── /login (PublicRoute) -> LoginPage
├── /register (PublicRoute) -> RegisterPage
├── /forgot-password (PublicRoute) -> ForgotPasswordPage
├── /reset-password (PublicRoute) -> ResetPasswordPage
├── /verify/:code? (Public) -> PublicVerifyPage
├── /404 -> NotFoundPage
│
├── /citizen (RoleRoute: citizen)
│   ├── /requests -> CitizenRequestsPage
│   ├── /requests/new -> CitizenNewRequestPage
│   ├── /requests/:trackingNumber -> CitizenRequestDetailPage
│   ├── /profile -> CitizenProfilePage
│   └── /notifications -> CitizenNotificationsPage
│
├── /staff (RoleRoute: staff, admin)
│   ├── /dashboard -> StaffDashboardPage
│   ├── /requests (PermissionRoute: can_review_requests) -> StaffRequestQueuePage
│   ├── /requests/walk-in (PermissionRoute: can_prepare_documents) -> StaffWalkInPage
│   ├── /records (PermissionRoute: can_archive_records) -> StaffRecordsPage
│   ├── /verify (PermissionRoute: can_verify_qr) -> StaffVerifyPage
│   └── /reports (PermissionRoute: can_view_reports) -> StaffReportsPage
│
└── /admin (RoleRoute: admin)
    ├── /dashboard -> AdminDashboardPage
    ├── /staff -> AdminStaffManagementPage
    ├── /citizens -> AdminCitizensManagementPage
    ├── /document-types -> AdminDocumentTypesPage
    ├── /records -> AdminRecordsPage
    ├── /issued-documents -> AdminIssuedDocumentsPage
    ├── /audit-logs -> AdminAuditLogsPage
    ├── /settings -> AdminSettingsPage
    └── /reports -> AdminReportsPage
```

---

## 7. Architecture & Risk Mitigations

1. **Token Invalidation Handling**: The backend issues standard JWT tokens. If `401 Unauthorized` is returned with `TOKEN_EXPIRED`, `TOKEN_INVALID`, or `TOKEN_INVALIDATED`, the frontend `apiClient` immediately executes a clean logout: purges memory + localStorage and redirects to `/login` with an informational message.
2. **Rate Limit Resilience**: On `429 Too Many Requests`, the `Retry-After` header is inspected. The `apiClient` surfaces a localized countdown alert and pauses polling routines gracefully.
3. **Optimistic Locking & Conflicts**: On `409 Conflict`, the frontend notifies the user that the resource was modified by another operator and refreshes current view data automatically.
4. **Zero Secrets in Frontend**: Sensitive server environment keys (`SU_ADMIN_KEY`, `JWT_SECRET`, `RECAPTCHA_SECRET_KEY`) never enter the client build. All public configurations are bootstrapped from `GET /api/v1/public/config`.
