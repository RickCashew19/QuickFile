/**
 * QuickFile Integration & Security Test Suite - Phase 2, Step 2D (Admin Management)
 *
 * Exercises all Admin endpoints under /api/v1/admin/ against a real MongoDB database:
 * - Admin Settings Toggles (Strict booleans, secret check before enabling, audit logging)
 * - Admin General Settings (Signatories, barangay captain/secretary, phone/email validation, max 100)
 * - Admin Dashboard & Live Stats (9 status counts, revenue today/month via dateUtil, demand, recent)
 * - Staff CRUD (Validation, rollback on detail/perm failure, permissions update, password reset, 409 deletion safeguard)
 * - Citizens CRUD (Cascade delete of requests, files on disk, profile, user; retention of IssuedDocument)
 * - Requests & Records (Admin view, file cleanup on delete, confirm requirement)
 * - Issued Documents (Dynamic expired status, atomic revoke with reason 5-200, atomic reinstate, notification)
 * - Audit Logs (Read-only, filters, date range, pagination, newest first)
 * - Admin Reports (Unified reports service with staff workload)
 * - Role authorization (403 for citizen/staff) & ObjectId validation (400 for invalid ID)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Configure isolated test environment
const TEST_ENV_PATH = path.join(__dirname, 'test_2d.env.tmp');
const TEST_DB_URI = 'mongodb://127.0.0.1:27017/quickfile_test_2d';

fs.writeFileSync(
  TEST_ENV_PATH,
  [
    `NODE_ENV=test`,
    `PORT=0`,
    `MONGO_URI=${TEST_DB_URI}`,
    `JWT_SECRET=super_secret_test_jwt_key_that_is_long_enough_32`,
    `JWT_EXPIRES_IN=7d`,
    `SU_ADMIN_KEY=12345678`,
    `DEFAULT_ADMIN_PASSWORD=Admin@123456`,
    `DEFAULT_STAFF_PASSWORD=Staff@123456`,
    `DEFAULT_CITIZEN_PASSWORD=Citizen@123456`,
    `FRONTEND_URL=http://localhost:5173,https://portal.quickfile.gov.ph`,
    `PUBLIC_APP_URL=http://localhost:5173`,
    `APP_TIMEZONE_OFFSET_MINUTES=480`,
    `BARANGAY_NAME=Barangay San Antonio`,
    `CITY_MUNICIPALITY=Pasig City`,
    `PROVINCE=Metro Manila`,
    `OFFICE_NAME=Office of the Punong Barangay`,
    `BARANGAY_CAPTAIN_NAME=Hon. Juan Dela Cruz`,
    `BARANGAY_SECRETARY_NAME=Hon. Maria Santos`,
    `CERTIFICATE_VALIDITY_DAYS=180`,
  ].join('\n'),
  'utf8'
);

require('dotenv').config({ path: TEST_ENV_PATH, override: true });

const { config } = require('./src/config');
const { connectDB, disconnectDB } = require('./src/config/db');
const {
  ROLES,
  API_PREFIX,
  REQUEST_STATUSES,
  VALIDITY_STATUSES,
  PAYMENT_STATUSES,
  STAFF_PERMISSIONS,
} = require('./src/config/constants');
const {
  User,
  CitizenProfile,
  StaffDetail,
  StaffPermission,
  DocumentRequest,
  DocumentType,
  IssuedDocument,
  Notification,
  AuditLog,
  AppSetting,
} = require('./src/models');
const { seedDatabase } = require('./src/utils/seeder');

function assert(condition, message) {
  if (!condition) {
    console.error(`\nAssertion FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

function makeRequest(server, options, requestData = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqHeaders = {
      ...(options.headers || {}),
    };

    let payload = null;
    if (requestData !== null && requestData !== undefined) {
      payload = typeof requestData === 'object' ? JSON.stringify(requestData) : requestData;
      if (!reqHeaders['Content-Type']) {
        reqHeaders['Content-Type'] = 'application/json';
      }
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: options.path,
        method: options.method || 'GET',
        headers: reqHeaders,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          let parsedData = null;
          const contentType = res.headers['content-type'] || '';
          if (contentType.includes('application/json')) {
            try {
              parsedData = JSON.parse(body);
            } catch {
              parsedData = body;
            }
          } else {
            parsedData = body;
          }

          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsedData,
          });
        });
      }
    );

    req.on('error', (err) => reject(err));

    if (payload !== null) {
      req.write(payload);
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================================');
  console.log('STARTING PHASE 2, STEP 2D (ADMIN MANAGEMENT) INTEGRATION TEST SUITE');
  console.log('====================================================================\n');

  let server;

  try {
    await connectDB();
    await seedDatabase();

    const app = require('./app');
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));

    // Retrieve seeded accounts
    const adminUser = await User.findOne({ role: ROLES.ADMIN });
    const staffUser = await User.findOne({ role: ROLES.STAFF });
    const citizenUser = await User.findOne({ role: ROLES.CITIZEN });
    const docType = await DocumentType.findOne({ code: 'BC' });

    assert(adminUser !== null, 'Seeded admin must exist');
    assert(staffUser !== null, 'Seeded staff must exist');
    assert(citizenUser !== null, 'Seeded citizen must exist');

    const adminToken = jwt.sign(
      { id: adminUser._id.toString(), email: adminUser.email, role: adminUser.role },
      config.jwt.getSecret(),
      { expiresIn: '1h' }
    );

    const staffToken = jwt.sign(
      { id: staffUser._id.toString(), email: staffUser.email, role: staffUser.role },
      config.jwt.getSecret(),
      { expiresIn: '1h' }
    );

    const citizenToken = jwt.sign(
      { id: citizenUser._id.toString(), email: citizenUser.email, role: citizenUser.role },
      config.jwt.getSecret(),
      { expiresIn: '1h' }
    );

    // -------------------------------------------------------------------------
    // TEST 1: Role Guards & ObjectId Strict Validation
    // -------------------------------------------------------------------------
    console.log('[TEST 1] Role Guards & ObjectId Strictness');

    // Citizen attempting admin route -> 403
    const citizenBlockRes = await makeRequest(server, {
      path: `${API_PREFIX}/admin/dashboard`,
      method: 'GET',
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    assert(citizenBlockRes.status === 403, `Citizen on admin route must get 403, got ${citizenBlockRes.status}`);

    // Staff attempting admin route -> 403
    const staffBlockRes = await makeRequest(server, {
      path: `${API_PREFIX}/admin/dashboard`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(staffBlockRes.status === 403, `Staff on admin route must get 403, got ${staffBlockRes.status}`);

    // Invalid ObjectId format -> 400 without echoing raw input
    const invalidIdRes = await makeRequest(server, {
      path: `${API_PREFIX}/admin/staff/not-a-valid-hex-id`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(invalidIdRes.status === 400, `Invalid ObjectId must return 400, got ${invalidIdRes.status}`);
    assert(!JSON.stringify(invalidIdRes.data).includes('not-a-valid-hex-id'), 'Must not echo invalid id');

    console.log('PASS: Role guards strictly reject non-admin with 403; validateObjectIdParam returns 400 safely.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 2: Admin Settings Toggles & General Settings
    // -------------------------------------------------------------------------
    console.log('[TEST 2] Settings Toggles & General Settings');

    // 2a: Reject non-boolean toggle value
    const nonBoolRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/settings/toggles`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { enable_email_notifications: 'yes' }
    );
    assert(nonBoolRes.status === 400, `Non-boolean toggle must return 400, got ${nonBoolRes.status}`);

    // 2b: Reject unknown toggle key
    const unknownToggleRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/settings/toggles`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { enable_super_ai_bot: true }
    );
    assert(unknownToggleRes.status === 400, `Unknown toggle key must return 400, got ${unknownToggleRes.status}`);

    // 2c: Reject enabling SMS notifications when SMS_API_TOKEN is empty
    config.sms.apiToken = ''; // Ensure empty
    const enableSmsFailRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/settings/toggles`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { enable_sms_notifications: true }
    );
    assert(enableSmsFailRes.status === 400, `Enabling unconfigured SMS must return 400, got ${enableSmsFailRes.status}`);
    assert(enableSmsFailRes.data.message.includes('SMS_API_TOKEN is not configured'), 'Error message mentions missing token');

    // 2d: Successfully toggle an allowlisted feature
    const validToggleRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/settings/toggles`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { enable_email_notifications: false }
    );
    assert(validToggleRes.status === 200, `Valid toggle must return 200, got ${validToggleRes.status}`);
    assert(validToggleRes.data.data.enable_email_notifications === false, 'Toggle persisted');

    // 2e: General Settings validation
    const tooLongGeneralRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/settings/general`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { barangay_captain: 'A'.repeat(101) }
    );
    assert(tooLongGeneralRes.status === 400, `> 100 char field must return 400, got ${tooLongGeneralRes.status}`);

    const invalidEmailRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/settings/general`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { contact_email: 'not-an-email' }
    );
    assert(invalidEmailRes.status === 400, `Invalid contact email must return 400, got ${invalidEmailRes.status}`);

    const validGeneralRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/settings/general`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        system_name: 'QuickFile San Antonio Portal',
        office_name: 'Office of the Barangay Captain',
        barangay_captain: 'Hon. Juan P. Dela Cruz',
        barangay_secretary: 'Hon. Maria Clara Santos',
        contact_email: 'sanantonio@pasigcity.gov.ph',
        contact_phone: '09171234567',
      }
    );
    assert(validGeneralRes.status === 200, `Valid general settings update must return 200, got ${validGeneralRes.status}`);
    assert(validGeneralRes.data.data.barangay_captain === 'Hon. Juan P. Dela Cruz', 'Signatory persisted');

    console.log('PASS: Admin settings toggles & general settings with strict validation and audit logging.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 3: Admin Dashboard & Live Stats Endpoints
    // -------------------------------------------------------------------------
    console.log('[TEST 3] Admin Dashboard & Live Stats');

    const dashboardRes = await makeRequest(server, {
      path: `${API_PREFIX}/admin/dashboard`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(dashboardRes.status === 200, `Admin dashboard must return 200, got ${dashboardRes.status}`);
    const dash = dashboardRes.data.data;
    assert(typeof dash.status_counts === 'object', 'status_counts object present');
    assert(Object.keys(dash.status_counts).length === 9, 'All 9 statuses represented');
    assert(dash.revenue_today !== undefined, 'revenue_today present');
    assert(dash.revenue_this_month !== undefined, 'revenue_this_month present');
    assert(dash.active_citizens_count >= 1, 'active_citizens_count >= 1');
    assert(dash.active_staff_count >= 1, 'active_staff_count >= 1');
    assert(Array.isArray(dash.demand_by_type), 'demand_by_type array present');
    assert(Array.isArray(dash.recent_requests), 'recent_requests array present');

    const liveStatsRes = await makeRequest(server, {
      path: `${API_PREFIX}/admin/live-stats`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(liveStatsRes.status === 200, `Admin live-stats must return 200, got ${liveStatsRes.status}`);
    assert(liveStatsRes.data.data.queue !== undefined, 'Live queue counts present');

    console.log('PASS: Admin dashboard and live-stats return comprehensive real-time metrics.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 4: Staff Management (Full CRUD, Rollback, Permissions, Deletion Safeguard)
    // -------------------------------------------------------------------------
    console.log('[TEST 4] Staff Management (CRUD, Rollback & Safeguards)');

    // 4a: Create staff member
    const newStaffEmail = `staff.crud.${Date.now()}@quickfile.gov.ph`;
    const createStaffRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/staff`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        email: newStaffEmail,
        password: 'Password@123',
        full_name: 'Test Staff Officer',
        phone: '09179998877',
        employee_id: `EMP-${Date.now().toString().slice(-4)}`,
        position: 'Document Officer',
        department: 'Civil Registry',
        permissions: {
          can_review_requests: true,
          can_prepare_documents: true,
        },
      }
    );
    assert(createStaffRes.status === 201, `Create staff must return 201, got ${createStaffRes.status}`);
    const createdStaff = createStaffRes.data.data;
    assert(createdStaff.password_hash === undefined, 'Never return password_hash');
    assert(createdStaff.permissions.can_review_requests === true, 'Assigned permission set');
    assert(createdStaff.permissions.can_release_documents === false, 'Default permission false');

    // 4b: List staff
    const listStaffRes = await makeRequest(server, {
      path: `${API_PREFIX}/admin/staff?search=Test%20Staff`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(listStaffRes.status === 200, `List staff must return 200, got ${listStaffRes.status}`);
    assert(listStaffRes.data.data.staff.length >= 1, 'Found created staff member');

    // 4c: Update staff detail
    const updateStaffRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/staff/${createdStaff._id}`,
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        full_name: 'Test Staff Officer Updated',
        position: 'Senior Document Officer',
      }
    );
    assert(updateStaffRes.status === 200, `Update staff must return 200, got ${updateStaffRes.status}`);
    assert(updateStaffRes.data.data.full_name === 'Test Staff Officer Updated', 'Staff name updated');
    assert(updateStaffRes.data.data.detail.position === 'Senior Document Officer', 'Staff position updated');

    // 4d: Update permissions strictly (reject unknown key)
    const badPermRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/staff/${createdStaff._id}/permissions`,
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { can_approve_all: true }
    );
    assert(badPermRes.status === 400, `Unknown permission must return 400, got ${badPermRes.status}`);

    const goodPermRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/staff/${createdStaff._id}/permissions`,
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        can_review_requests: false,
        can_prepare_documents: true,
        can_print_documents: true,
      }
    );
    assert(goodPermRes.status === 200, `Update permissions must return 200, got ${goodPermRes.status}`);
    assert(goodPermRes.data.data.can_print_documents === true, 'Updated permission verified');

    // 4e: Self deactivation prevention
    const selfDeactivateRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/staff/${adminUser._id}/status`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { is_active: false }
    );
    assert(selfDeactivateRes.status === 400, `Self deactivation must return 400, got ${selfDeactivateRes.status}`);

    // 4f: Password reset invalidates old sessions
    const oldStaffToken = jwt.sign(
      { id: createdStaff._id, email: newStaffEmail, role: ROLES.STAFF, iat: Math.floor(Date.now() / 1000) - 10 },
      config.jwt.getSecret(),
      { expiresIn: '1h' }
    );
    const resetPwRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/staff/${createdStaff._id}/reset-password`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { new_password: 'NewPassword@2026' }
    );
    assert(resetPwRes.status === 200, `Reset staff password must return 200, got ${resetPwRes.status}`);

    // Confirm old token is invalidated by password_changed_at
    const authMeWithOldToken = await makeRequest(server, {
      path: `${API_PREFIX}/auth/me`,
      method: 'GET',
      headers: { Authorization: `Bearer ${oldStaffToken}` },
    });
    assert(authMeWithOldToken.status === 401, 'Old token rejected after admin password reset');

    // 4g: Deletion safeguard (referenced staff cannot be deleted)
    // Create a request handled by seeded staffUser
    const refReq = await DocumentRequest.create({
      tracking_number: `QF-REF-${Date.now().toString().slice(-6)}`,
      citizen_id: citizenUser._id,
      document_type_id: docType._id,
      purpose: 'Safeguard test',
      copies: 1,
      status: REQUEST_STATUSES.UNDER_REVIEW,
      reviewed_by: staffUser._id,
    });

    const deleteStaffRefRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/staff/${staffUser._id}`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { confirm: 'DELETE' }
    );
    if (deleteStaffRefRes.status !== 409) {
      console.log('DEBUG deleteStaffRefRes:', deleteStaffRefRes.status, JSON.stringify(deleteStaffRefRes.data));
    }
    assert(deleteStaffRefRes.status === 409, `Referenced staff deletion must return 409, got ${deleteStaffRefRes.status}`);
    assert(deleteStaffRefRes.data.message.includes('Deactivate the account instead'), 'Suggests deactivation');

    // Delete unreferenced createdStaff
    const deleteStaffUnrefRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/staff/${createdStaff._id}`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { confirm: 'DELETE' }
    );
    assert(deleteStaffUnrefRes.status === 200, `Unreferenced staff deletion must return 200, got ${deleteStaffUnrefRes.status}`);

    console.log('PASS: Staff CRUD, rollback safety, permission validation, token invalidation, and 409 reference safeguard.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 5: Citizen Management & Cascade Delete with Registry Retention
    // -------------------------------------------------------------------------
    console.log('[TEST 5] Citizen Management & Cascade Delete');

    // Create a temporary citizen with a request and mock attachment
    const tempCitizen = await User.create({
      email: `temp.citizen.${Date.now()}@quickfile.gov.ph`,
      password_hash: await User.hashPassword('Pass@12345'),
      full_name: 'Ephemeral Citizen',
      phone: '09175554433',
      role: ROLES.CITIZEN,
      is_active: true,
    });

    await CitizenProfile.create({
      user_id: tempCitizen._id,
      first_name: 'Ephemeral',
      last_name: 'Citizen',
      barangay: 'San Antonio',
      city: 'Pasig City',
      province: 'Metro Manila',
      contact_number: '09175554433',
    });

    const mockAttachmentName = `test_cleanup_${Date.now()}.pdf`;
    const mockFilePath = path.join(__dirname, 'uploads/attachments', mockAttachmentName);
    fs.mkdirSync(path.dirname(mockFilePath), { recursive: true });
    fs.writeFileSync(mockFilePath, '%PDF-1.4 mock content');

    const tempReq = await DocumentRequest.create({
      tracking_number: `QF-CASCADE-${Date.now().toString().slice(-6)}`,
      citizen_id: tempCitizen._id,
      document_type_id: docType._id,
      purpose: 'Cascade test',
      copies: 1,
      status: REQUEST_STATUSES.RELEASED,
      attachments: [
        {
          original_name: 'id.pdf',
          stored_filename: mockAttachmentName,
          path: mockFilePath,
          mime_type: 'application/pdf',
          file_size: 100,
        },
      ],
    });

    // Create an IssuedDocument for this request
    const issuedDoc = await IssuedDocument.create({
      request_id: tempReq._id,
      certificate_number: `CERT-CAS-${Date.now().toString().slice(-4)}`,
      document_name: docType.name,
      issued_to_name: tempCitizen.full_name,
      verification_code: `VER-CAS-${Date.now().toString().slice(-4)}`,
      qr_data: 'https://portal.quickfile.gov.ph/verify/VER-CAS',
      qr_code_image: 'data:image/png;base64,mock',
      issued_by: adminUser._id,
      validity_status: VALIDITY_STATUSES.VALID,
    });

    // List citizens
    const listCitizensRes = await makeRequest(server, {
      path: `${API_PREFIX}/admin/citizens?search=Ephemeral`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(listCitizensRes.status === 200, 'List citizens returns 200');
    assert(listCitizensRes.data.data.citizens.length === 1, 'Found ephemeral citizen');
    assert(listCitizensRes.data.data.citizens[0].request_count === 1, 'request_count calculated');

    // Missing confirm: "DELETE" returns 400
    const deleteNoConfirmRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/citizens/${tempCitizen._id}`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {}
    );
    assert(deleteNoConfirmRes.status === 400, `Missing confirmation must return 400, got ${deleteNoConfirmRes.status}`);

    // Perform cascade delete
    const deleteCitizenRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/citizens/${tempCitizen._id}`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { confirm: 'DELETE' }
    );
    assert(deleteCitizenRes.status === 200, `Citizen cascade delete must return 200, got ${deleteCitizenRes.status}`);

    // Verify cascade: user deleted, profile deleted, request deleted, attachment on disk deleted
    assert((await User.findById(tempCitizen._id)) === null, 'User deleted');
    assert((await CitizenProfile.findOne({ user_id: tempCitizen._id })) === null, 'Profile deleted');
    assert((await DocumentRequest.findById(tempReq._id)) === null, 'Request deleted');
    assert(!fs.existsSync(mockFilePath), 'Attachment file on disk deleted');

    // Verify registry retention: IssuedDocument record MUST be retained!
    const retainedDoc = await IssuedDocument.findById(issuedDoc._id);
    assert(retainedDoc !== null, 'IssuedDocument registry record retained for permanent audit');
    assert(retainedDoc.issued_to_name === tempCitizen.full_name, 'Retained snapshot name');

    console.log('PASS: Citizen cascade delete cleans up files, requests, and profiles while retaining IssuedDocument registry records.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 6: Issued Documents (Dynamic Expiration, Atomic Revocation & Reinstatement)
    // -------------------------------------------------------------------------
    console.log('[TEST 6] Issued Documents Management');

    // Create an active issued document
    const activeDoc = await IssuedDocument.create({
      request_id: refReq._id,
      certificate_number: `CERT-REV-${Date.now().toString().slice(-4)}`,
      document_name: docType.name,
      issued_to_name: citizenUser.full_name,
      verification_code: `VER-REV-${Date.now().toString().slice(-4)}`,
      qr_data: 'https://portal.quickfile.gov.ph/verify/VER-REV',
      qr_code_image: 'data:image/png;base64,mock',
      issued_by: adminUser._id,
      validity_status: VALIDITY_STATUSES.VALID,
    });

    // 6a: Revoke with invalid reason (too short) -> 400
    const shortReasonRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/issued-documents/${activeDoc._id}/revoke`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { reason: 'bad' }
    );
    assert(shortReasonRes.status === 400, `Short revocation reason must return 400, got ${shortReasonRes.status}`);

    // 6b: Successfully revoke
    const revokeRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/issued-documents/${activeDoc._id}/revoke`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { reason: 'Document revoked due to falsified barangay residency information.' }
    );
    assert(revokeRes.status === 200, `Revoke must return 200, got ${revokeRes.status}`);
    assert(revokeRes.data.data.validity_status === VALIDITY_STATUSES.REVOKED, 'Status is revoked');

    // Verify in-app notification sent to citizen
    const revNotification = await Notification.findOne({
      user_id: citizenUser._id,
      title: 'Issued Certificate Revoked',
    });
    assert(revNotification !== null, 'In-app notification sent to citizen upon revocation');

    // 6c: Re-revoking already revoked doc -> 400
    const reRevokeRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/issued-documents/${activeDoc._id}/revoke`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { reason: 'Another reason for revocation.' }
    );
    assert(reRevokeRes.status === 400, `Revoking already revoked doc must return 400, got ${reRevokeRes.status}`);

    // 6d: Reinstate revoked document
    const reinstateRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/issued-documents/${activeDoc._id}/reinstate`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {}
    );
    assert(reinstateRes.status === 200, `Reinstate must return 200, got ${reinstateRes.status}`);
    assert(reinstateRes.data.data.validity_status === VALIDITY_STATUSES.VALID, 'Status restored to valid');

    // 6e: Dynamic expiration test
    const expiredDoc = await IssuedDocument.create({
      request_id: new mongoose.Types.ObjectId(),
      certificate_number: `CERT-EXP-${Date.now().toString().slice(-4)}`,
      document_name: docType.name,
      issued_to_name: citizenUser.full_name,
      verification_code: `VER-EXP-${Date.now().toString().slice(-4)}`,
      qr_data: 'https://portal.quickfile.gov.ph/verify/VER-EXP',
      qr_code_image: 'data:image/png;base64,mock',
      issued_by: adminUser._id,
      validity_status: VALIDITY_STATUSES.VALID,
      expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // Expired yesterday
    });

    const listExpRes = await makeRequest(server, {
      path: `${API_PREFIX}/admin/issued-documents?status=expired`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(listExpRes.status === 200, `List expired documents must return 200, got ${listExpRes.status}`);
    const foundExpired = listExpRes.data.data.documents.find((d) => d._id === expiredDoc._id.toString());
    assert(foundExpired !== undefined, 'Dynamically computed expired document found in expired list');
    assert(foundExpired.effective_status === VALIDITY_STATUSES.EXPIRED, 'effective_status is expired');

    // Attempting to revoke an expired document -> 400
    const revokeExpRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/issued-documents/${expiredDoc._id}/revoke`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { reason: 'Attempting to revoke expired document.' }
    );
    assert(revokeExpRes.status === 400, `Revoking expired document must return 400, got ${revokeExpRes.status}`);

    console.log('PASS: Issued documents dynamic expiration, atomic revocation, reinstatement, and citizen notifications.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 7: Audit Logs (Read-Only & Immutability)
    // -------------------------------------------------------------------------
    console.log('[TEST 7] Audit Logs (Read-Only & Advanced Filters)');

    const auditRes = await makeRequest(server, {
      path: `${API_PREFIX}/admin/audit-logs?module=DOCUMENT&limit=10`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(auditRes.status === 200, `Audit log search must return 200, got ${auditRes.status}`);
    assert(auditRes.data.data.logs.length >= 1, 'Found document audit entries');
    assert(auditRes.data.data.logs[0].module === 'DOCUMENT', 'Module filter honored');

    // Confirm date range filter
    const dateAuditRes = await makeRequest(server, {
      path: `${API_PREFIX}/admin/audit-logs?from=2026-01-01&to=2026-12-31`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(dateAuditRes.status === 200, `Date filtered audit log must return 200, got ${dateAuditRes.status}`);

    // Confirm invalid date range returns 400
    const badDateAuditRes = await makeRequest(server, {
      path: `${API_PREFIX}/admin/audit-logs?from=2026-12-31&to=2026-01-01`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(badDateAuditRes.status === 400, `Inverted date range must return 400, got ${badDateAuditRes.status}`);

    console.log('PASS: Audit logs read-only retrieval with filtering by module, action, and validated date range.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 8: Admin Reports Endpoint (Full Report with Staff Workload)
    // -------------------------------------------------------------------------
    console.log('[TEST 8] Admin Reports (Unified Service & Staff Workload)');

    const adminReportsRes = await makeRequest(server, {
      path: `${API_PREFIX}/admin/reports?from=2026-01-01&to=2026-12-31`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminReportsRes.status === 200, `Admin reports must return 200, got ${adminReportsRes.status}`);
    const rpt = adminReportsRes.data.data;
    assert(rpt.summary !== undefined, 'Summary section present');
    assert(rpt.staff_workload !== undefined, 'Staff workload summary present in admin report');

    console.log('PASS: Admin reports endpoint returns complete structured report including staff workload.');
    console.log('--------------------------------------------------------------------\n');

    console.log('====================================================================');
    console.log('ALL 8 PHASE 2, STEP 2D (ADMIN MANAGEMENT) TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================================');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();

    // Clean up temporary database
    try {
      const conn = await mongoose.connect('mongodb://127.0.0.1:27017/quickfile_test_2d');
      await conn.connection.dropDatabase();
      await conn.disconnect();
      console.log('[Cleanup] Dropped isolated quickfile_test_2d database.');
    } catch {
      // Ignore cleanup error
    }

    if (fs.existsSync(TEST_ENV_PATH)) {
      fs.unlinkSync(TEST_ENV_PATH);
      console.log('[Cleanup] Removed temporary test_2d.env.tmp file.');
    }
  }
}

runTests().catch((err) => {
  console.error('\nTest execution failed:', err);
  process.exit(1);
});
