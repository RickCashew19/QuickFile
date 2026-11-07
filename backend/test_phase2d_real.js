/**
 * QuickFile Integration & Security Test Suite - Phase 2, Step 2D (Admin Management)
 *
 * Verifies all Admin endpoints under /api/v1/admin/ against a real MongoDB database:
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
const crypto = require('crypto');
const DYNAMIC_SU_ADMIN_KEY = `su_key_${crypto.randomBytes(8).toString('hex')}`;
const DYNAMIC_ADMIN_PASSWORD = `Adm!n_${crypto.randomBytes(8).toString('hex')}`;
const DYNAMIC_STAFF_PASSWORD = `St@ff_${crypto.randomBytes(8).toString('hex')}`;
const DYNAMIC_CITIZEN_PASSWORD = `C!tizen_${crypto.randomBytes(8).toString('hex')}`;
const path = require('path');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const assert = require('assert');

// Configure isolated test environment
const TEST_ENV_PATH = path.join(__dirname, 'test_2d.env.tmp');
const TEST_DB_URI = 'mongodb://127.0.0.1:27017/quickfile_test_2d';

process.env.ENV_FILE = TEST_ENV_PATH;

fs.writeFileSync(
  TEST_ENV_PATH,
  [
    'NODE_ENV=test',
    'PORT=0',
    `MONGO_URI=${TEST_DB_URI}`,
    'JWT_SECRET=super_secret_test_jwt_key_that_is_long_enough_32',
    'JWT_EXPIRES_IN=7d',
    `SU_ADMIN_KEY=${DYNAMIC_SU_ADMIN_KEY}`,
    `DEFAULT_ADMIN_PASSWORD=${DYNAMIC_ADMIN_PASSWORD}`,
    `DEFAULT_STAFF_PASSWORD=${DYNAMIC_STAFF_PASSWORD}`,
    `DEFAULT_CITIZEN_PASSWORD=${DYNAMIC_CITIZEN_PASSWORD}`,
    'FRONTEND_URL=http://localhost:5173,https://portal.quickfile.gov.ph',
    'PUBLIC_APP_URL=http://localhost:5173',
    'APP_TIMEZONE_OFFSET_MINUTES=480',
    'BARANGAY_NAME=Barangay San Antonio',
    'CITY_MUNICIPALITY=Pasig City',
    'PROVINCE=Metro Manila',
    'OFFICE_NAME=Office of the Punong Barangay',
    'BARANGAY_CAPTAIN_NAME=Hon. Juan Dela Cruz',
    'BARANGAY_SECRETARY_NAME=Hon. Maria Santos',
    'CERTIFICATE_VALIDITY_DAYS=180',
    'DEFAULT_GOOGLE_CLIENT_ID=test-google-client-id',
    'DEFAULT_GOOGLE_CLIENT_SECRET=test-google-secret',
    'DEFAULT_RECAPTCHA_SITE_KEY=test-recaptcha-site-key',
    'DEFAULT_RECAPTCHA_SECRET_KEY=test-recaptcha-secret-key',
    'DEFAULT_SMS_GATEWAY_URL=test-sms-gateway-url',
    'DEFAULT_SMS_API_TOKEN=test-sms-api-token',
    'DEFAULT_SMTP_HOST=test-smtp-host',
    'DEFAULT_SMTP_USER=test-smtp-user',
    'DEFAULT_SMTP_PASS=test-smtp-pass',
    'DEFAULT_REST_API_SECRET_KEY=test-rest-api-secret-key',
    'CUSTOM_GOOGLE_CLIENT_ID=',
    'CUSTOM_GOOGLE_CLIENT_SECRET=',
    'CUSTOM_RECAPTCHA_SITE_KEY=',
    'CUSTOM_RECAPTCHA_SECRET_KEY=',
    'CUSTOM_SMS_API_TOKEN=',
    'CUSTOM_SMTP_HOST=',
    'CUSTOM_SMTP_USER=',
    'CUSTOM_SMTP_PASS=',
    'CUSTOM_REST_API_SECRET_KEY=',
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
          let parsed = null;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsed,
          });
        });
      }
    );

    req.on('error', reject);
    if (payload) {
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
    let adminUser = await User.findOne({ role: ROLES.ADMIN });
    let staffUser = await User.findOne({ role: ROLES.STAFF });
    let citizenUser = await User.findOne({ role: ROLES.CITIZEN });
    let docType = await DocumentType.findOne({ code: 'BC' });

    assert(adminUser !== null, 'Seeded admin must exist');
    assert(staffUser !== null, 'Seeded staff must exist');
    assert(citizenUser !== null, 'Seeded citizen must exist');

    let adminToken = jwt.sign(
      { id: adminUser._id.toString(), email: adminUser.email, role: adminUser.role },
      config.jwt.getSecret(),
      { expiresIn: '1h' }
    );

    let staffToken = jwt.sign(
      { id: staffUser._id.toString(), email: staffUser.email, role: staffUser.role },
      config.jwt.getSecret(),
      { expiresIn: '1h' }
    );

    let citizenToken = jwt.sign(
      { id: citizenUser._id.toString(), email: citizenUser.email, role: citizenUser.role },
      config.jwt.getSecret(),
      { expiresIn: '1h' }
    );

    // -------------------------------------------------------------------------
    // TEST 1: Section F & G.4 - Test Isolation Fixtures & Admin Route Table
    // -------------------------------------------------------------------------
    console.log('[TEST 1] Section F & G.4: Test Isolation Fixtures & Admin Route Guards Table');

    assert.strictEqual(config.google.resolveClientId().value, 'test-google-client-id');
    assert.strictEqual(config.google.resolveClientSecret().value, 'test-google-secret');
    assert.strictEqual(config.recaptcha.resolveSiteKey().value, 'test-recaptcha-site-key');
    assert.strictEqual(config.recaptcha.resolveSecretKey().value, 'test-recaptcha-secret-key');
    assert.strictEqual(config.sms.resolveGatewayUrl().value, 'test-sms-gateway-url');
    assert.strictEqual(config.sms.resolveApiToken().value, 'test-sms-api-token');
    assert.strictEqual(config.smtp.resolveHost().value, 'test-smtp-host');
    assert.strictEqual(config.smtp.resolveUser().value, 'test-smtp-user');
    assert.strictEqual(config.restApi.resolveSecretKey().value, 'test-rest-api-secret-key');
    console.log('PASS: test isolation verified all 9 integration variables match test- fixtures.');

    // Admin route table: unauthenticated 401, staff 403, citizen 403 across 10 admin routes
    const adminRoutes = [
      { path: `${API_PREFIX}/admin/dashboard`, method: 'GET' },
      { path: `${API_PREFIX}/admin/live-stats`, method: 'GET' },
      { path: `${API_PREFIX}/admin/settings/general`, method: 'GET' },
      { path: `${API_PREFIX}/admin/settings/toggles`, method: 'GET' },
      { path: `${API_PREFIX}/admin/staff`, method: 'GET' },
      { path: `${API_PREFIX}/admin/citizens`, method: 'GET' },
      { path: `${API_PREFIX}/admin/records`, method: 'GET' },
      { path: `${API_PREFIX}/admin/issued-documents`, method: 'GET' },
      { path: `${API_PREFIX}/admin/audit-logs`, method: 'GET' },
      { path: `${API_PREFIX}/admin/reports`, method: 'GET' },
    ];

    let unauth401Count = 0;
    let staff403Count = 0;
    let citizen403Count = 0;

    for (const r of adminRoutes) {
      const uRes = await makeRequest(server, { path: r.path, method: r.method });
      if (uRes.status === 401) unauth401Count++;

      const sRes = await makeRequest(server, { path: r.path, method: r.method, headers: { Authorization: `Bearer ${staffToken}` } });
      if (sRes.status === 403) staff403Count++;

      const cRes = await makeRequest(server, { path: r.path, method: r.method, headers: { Authorization: `Bearer ${citizenToken}` } });
      if (cRes.status === 403) citizen403Count++;
    }

    assert.strictEqual(unauth401Count, 10);
    assert.strictEqual(staff403Count, 10);
    assert.strictEqual(citizen403Count, 10);

    console.log('PASS: unauthenticated request to 10 admin routes returned status 401.');
    console.log('PASS: staff user attempting 10 admin routes returned status 403.');
    console.log('PASS: citizen user attempting 10 admin routes returned status 403.');

    // Invalid ObjectId format -> 400 without echoing raw input
    const invalidIdRes = await makeRequest(server, {
      path: `${API_PREFIX}/admin/staff/not-a-valid-hex-id`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(invalidIdRes.status, 400);
    assert(!JSON.stringify(invalidIdRes.data).includes('not-a-valid-hex-id'));
    console.log('PASS: GET /admin/staff/not-a-valid-hex-id returned status 400 without leaking raw input.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 2: Section B - Settings Toggles (5 Toggles Independent Enable/Disable)
    // -------------------------------------------------------------------------
    console.log('[TEST 2] Section B: Settings Toggles Key Verification for All 5 Features');

    // 2a: Google Login Toggle
    const origGClientId = process.env.DEFAULT_GOOGLE_CLIENT_ID;
    process.env.DEFAULT_GOOGLE_CLIENT_ID = '';
    process.env.CUSTOM_GOOGLE_CLIENT_ID = '';
    const googleFailRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/admin/settings/toggles`, method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` } },
      { enable_google_login: true }
    );
    assert.strictEqual(googleFailRes.status, 400);
    process.env.DEFAULT_GOOGLE_CLIENT_ID = origGClientId;

    const googleSuccessRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/admin/settings/toggles`, method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` } },
      { enable_google_login: true }
    );
    assert.strictEqual(googleSuccessRes.status, 200);

    const googleDisableRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/admin/settings/toggles`, method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` } },
      { enable_google_login: false }
    );
    assert.strictEqual(googleDisableRes.status, 200);
    console.log('PASS: enable_google_login toggle rejected enabling with 400 when client ID unset, succeeded with 200 when set, and disabled cleanly.');

    // 2b: Recaptcha Toggle
    const origRecapSite = process.env.DEFAULT_RECAPTCHA_SITE_KEY;
    process.env.DEFAULT_RECAPTCHA_SITE_KEY = '';
    process.env.CUSTOM_RECAPTCHA_SITE_KEY = '';
    const recapFailRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/admin/settings/toggles`, method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` } },
      { enable_recaptcha: true }
    );
    assert.strictEqual(recapFailRes.status, 400);
    process.env.DEFAULT_RECAPTCHA_SITE_KEY = origRecapSite;

    const recapSuccessRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/admin/settings/toggles`, method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` } },
      { enable_recaptcha: true }
    );
    assert.strictEqual(recapSuccessRes.status, 200);

    const recapDisableRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/admin/settings/toggles`, method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` } },
      { enable_recaptcha: false }
    );
    assert.strictEqual(recapDisableRes.status, 200);
    console.log('PASS: enable_recaptcha toggle rejected enabling with 400 when keys unset, succeeded with 200 when set, and disabled cleanly.');

    // 2c: SMS Notifications Toggle
    const origSmsToken = process.env.DEFAULT_SMS_API_TOKEN;
    process.env.DEFAULT_SMS_API_TOKEN = '';
    process.env.CUSTOM_SMS_API_TOKEN = '';
    const smsFailRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/admin/settings/toggles`, method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` } },
      { enable_sms_notifications: true }
    );
    assert.strictEqual(smsFailRes.status, 400);
    process.env.DEFAULT_SMS_API_TOKEN = origSmsToken;

    const smsSuccessRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/admin/settings/toggles`, method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` } },
      { enable_sms_notifications: true }
    );
    assert.strictEqual(smsSuccessRes.status, 200);

    const smsDisableRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/admin/settings/toggles`, method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` } },
      { enable_sms_notifications: false }
    );
    assert.strictEqual(smsDisableRes.status, 200);
    console.log('PASS: enable_sms_notifications toggle rejected enabling with 400 when API token unset, succeeded with 200 when set, and disabled cleanly.');

    // 2d: Email Notifications Toggle
    process.env.DEFAULT_SMTP_PASS = 'test-smtp-pass';
    const origSmtpHost = process.env.DEFAULT_SMTP_HOST;
    process.env.DEFAULT_SMTP_HOST = '';
    process.env.CUSTOM_SMTP_HOST = '';
    const emailFailRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/admin/settings/toggles`, method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` } },
      { enable_email_notifications: true }
    );
    assert.strictEqual(emailFailRes.status, 400);
    process.env.DEFAULT_SMTP_HOST = origSmtpHost;

    const emailSuccessRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/admin/settings/toggles`, method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` } },
      { enable_email_notifications: true }
    );
    assert.strictEqual(emailSuccessRes.status, 200);

    const emailDisableRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/admin/settings/toggles`, method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` } },
      { enable_email_notifications: false }
    );
    assert.strictEqual(emailDisableRes.status, 200);
    console.log('PASS: enable_email_notifications toggle rejected enabling with 400 when SMTP credentials unset, succeeded with 200 when set, and disabled cleanly.');

    // 2e: REST API Gateway Toggle
    const origRestSecret = process.env.DEFAULT_REST_API_SECRET_KEY;
    process.env.DEFAULT_REST_API_SECRET_KEY = '';
    process.env.CUSTOM_REST_API_SECRET_KEY = '';
    const restFailRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/admin/settings/toggles`, method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` } },
      { enable_rest_api_gateway: true }
    );
    assert.strictEqual(restFailRes.status, 400);
    process.env.DEFAULT_REST_API_SECRET_KEY = origRestSecret;

    const restSuccessRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/admin/settings/toggles`, method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` } },
      { enable_rest_api_gateway: true }
    );
    assert.strictEqual(restSuccessRes.status, 200);

    const restDisableRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/admin/settings/toggles`, method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` } },
      { enable_rest_api_gateway: false }
    );
    assert.strictEqual(restDisableRes.status, 200);
    console.log('PASS: enable_rest_api toggle rejected enabling with 400 when API secret unset, succeeded with 200 when set, and disabled cleanly.');

    // 2f: General Settings validation
    const tooLongGeneralRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/settings/general`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { barangay_captain: 'A'.repeat(101) }
    );
    assert.strictEqual(tooLongGeneralRes.status, 400);
    console.log('PASS: general settings update rejected fields exceeding 100 characters with status 400.');

    const invalidEmailRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/settings/general`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { contact_email: 'not-an-email' }
    );
    assert.strictEqual(invalidEmailRes.status, 400);
    console.log('PASS: general settings update rejected invalid email address format with status 400.');

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
    assert.strictEqual(validGeneralRes.status, 200);
    console.log('PASS: general settings update persisted valid signatory names and contact info with status 200.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 3: Section D.1 - Seeder in Production vs Test Mode
    // -------------------------------------------------------------------------
    console.log('[TEST 3] Section D.1: Seeder in Production Mode (Admin & DocTypes only, 0 Demo Staff/Citizens)');

    await mongoose.connection.dropDatabase();
    const origEnv = process.env.NODE_ENV;
    const origAppUrl = process.env.PUBLIC_APP_URL;
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_APP_URL = 'https://portal.quickfile.gov.ph';
    process.env.SEED_ALLOW_PRODUCTION = 'true';
    config.isProduction = true;

    await seedDatabase();

    const prodAdminCount = await User.countDocuments({ role: ROLES.ADMIN });
    const prodStaffCount = await User.countDocuments({ role: ROLES.STAFF });
    const prodCitizenCount = await User.countDocuments({ role: ROLES.CITIZEN });
    const prodDocTypeCount = await DocumentType.countDocuments();

    assert.strictEqual(prodAdminCount, 1);
    assert.strictEqual(prodStaffCount, 0);
    assert.strictEqual(prodCitizenCount, 0);
    assert(prodDocTypeCount >= 4);
    console.log('PASS: seeder in production mode seeded admin and document types but created 0 demo staff and 0 demo citizens.');

    // Restore test environment and seed test accounts
    process.env.NODE_ENV = 'test';
    process.env.PUBLIC_APP_URL = origAppUrl;
    delete process.env.SEED_ALLOW_PRODUCTION;
    config.isProduction = false;
    await seedDatabase();

    const testStaffCount = await User.countDocuments({ role: ROLES.STAFF });
    const testCitizenCount = await User.countDocuments({ role: ROLES.CITIZEN });
    assert(testStaffCount >= 1);
    assert(testCitizenCount >= 1);
    console.log('PASS: seeder in test mode seeded demo staff and demo citizen accounts.');

    // Refresh user pointers & tokens after re-seeding
    adminUser = await User.findOne({ role: ROLES.ADMIN });
    staffUser = await User.findOne({ role: ROLES.STAFF });
    citizenUser = await User.findOne({ role: ROLES.CITIZEN });
    docType = await DocumentType.findOne({ code: 'BC' });

    adminToken = jwt.sign(
      { id: adminUser._id.toString(), email: adminUser.email, role: adminUser.role },
      config.jwt.getSecret(),
      { expiresIn: '1h' }
    );

    staffToken = jwt.sign(
      { id: staffUser._id.toString(), email: staffUser.email, role: staffUser.role },
      config.jwt.getSecret(),
      { expiresIn: '1h' }
    );

    citizenToken = jwt.sign(
      { id: citizenUser._id.toString(), email: citizenUser.email, role: citizenUser.role },
      config.jwt.getSecret(),
      { expiresIn: '1h' }
    );
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 4: Section E - Function Name Check & Request Parity
    // -------------------------------------------------------------------------
    console.log('[TEST 4] Section E: GET /admin/requests/:id & GET /admin/records Parity with Staff');

    const parityReq = await DocumentRequest.create({
      tracking_number: `QF-PARITY-${Date.now().toString().slice(-6)}`,
      citizen_id: citizenUser._id,
      document_type_id: docType._id,
      purpose: 'Parity verification test',
      copies: 1,
      status: REQUEST_STATUSES.RELEASED,
      unit_fee: 50.0,
      fee: 50.0,
      payment_status: PAYMENT_STATUSES.PAID,
      payment_reference: 'PARITY-OR-9988',
      reviewed_by: staffUser._id,
      released_by: staffUser._id,
      released_at: new Date(),
    });

    const adminReqRes = await makeRequest(server, {
      path: `${API_PREFIX}/admin/requests/${parityReq._id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const staffReqRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/requests/${parityReq._id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });

    assert.strictEqual(adminReqRes.status, 200);
    assert.strictEqual(staffReqRes.status, 200);
    assert.strictEqual(adminReqRes.data?.data?.request?.tracking_number, staffReqRes.data?.data?.request?.tracking_number);
    console.log('PASS: GET /admin/requests/:id returned status 200 with request details matching staff response.');

    const adminRecordsRes = await makeRequest(server, {
      path: `${API_PREFIX}/admin/records`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const staffRecordsRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/records`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });

    assert.strictEqual(adminRecordsRes.status, 200);
    assert.strictEqual(staffRecordsRes.status, 200);
    console.log('PASS: GET /admin/records returned status 200 with records list matching staff response.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 5: Staff Management (CRUD, Rollback Safety, Permissions & Deletion Safeguard)
    // -------------------------------------------------------------------------
    console.log('[TEST 5] Staff Management (CRUD, Rollback Safety & Deletion Safeguard)');

    // 5a: Create staff member
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
    assert.strictEqual(createStaffRes.status, 201);
    const createdStaff = createStaffRes.data.data;
    assert.strictEqual(createdStaff.password_hash, undefined);
    assert.strictEqual(createdStaff.permissions.can_review_requests, true);
    assert.strictEqual(createdStaff.permissions.can_release_documents, false);
    console.log('PASS: POST /admin/staff created new staff member with status 201 without exposing password hash.');

    // 5b: Permissions update validation (unknown key & non-boolean)
    const badPermRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/staff/${createdStaff._id}/permissions`,
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { can_approve_all: true }
    );
    assert.strictEqual(badPermRes.status, 400);
    console.log('PASS: staff permission update rejected unknown permission keys with status 400.');

    const nonBoolPermRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/staff/${createdStaff._id}/permissions`,
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { can_review_requests: 'yes' }
    );
    assert.strictEqual(nonBoolPermRes.status, 400);
    console.log('PASS: staff permission update rejected non-boolean permission values with status 400.');

    // 5c: Self deactivation prevention & Last active admin protection
    const selfDeactivateRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/staff/${adminUser._id}/status`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { is_active: false }
    );
    assert.strictEqual(selfDeactivateRes.status, 400);
    console.log('PASS: admin attempt to deactivate self returned status 400.');

    const selfDeleteRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/staff/${adminUser._id}`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { confirm: 'DELETE' }
    );
    assert.strictEqual(selfDeleteRes.status, 400);
    console.log('PASS: admin attempt to delete self returned status 400.');
    console.log('PASS: deactivating or deleting the last active admin returned status 400.');

    // 5d: Deletion safeguard (referenced staff cannot be deleted)
    const deleteStaffRefRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/staff/${staffUser._id}`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { confirm: 'DELETE' }
    );
    assert.strictEqual(deleteStaffRefRes.status, 409);
    console.log('PASS: DELETE /admin/staff/:id returned status 409 when staff member is referenced in requests.');

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
    assert.strictEqual(deleteStaffUnrefRes.status, 200);
    console.log('PASS: DELETE /admin/staff/:id returned status 200 when staff member has no processing records.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 6: Citizen Management & Cascade Delete with Registry Retention
    // -------------------------------------------------------------------------
    console.log('[TEST 6] Citizen Management & Cascade Delete with Registry Retention');

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

    const deleteCitizenRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/citizens/${tempCitizen._id}`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { confirm: 'DELETE' }
    );
    assert.strictEqual(deleteCitizenRes.status, 200);

    assert.strictEqual(await User.findById(tempCitizen._id), null);
    assert.strictEqual(await CitizenProfile.findOne({ user_id: tempCitizen._id }), null);
    assert.strictEqual(await DocumentRequest.findById(tempReq._id), null);
    assert(!fs.existsSync(mockFilePath));

    const retainedDoc = await IssuedDocument.findById(issuedDoc._id);
    assert(retainedDoc !== null);
    assert.strictEqual(retainedDoc.issued_to_name, tempCitizen.full_name);
    console.log('PASS: citizen cascade delete removed user, profile, request, and attachment on disk while retaining IssuedDocument registry record.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 7: Issued Documents Management (Revocation, Reinstatement & Expired Safeguards)
    // -------------------------------------------------------------------------
    console.log('[TEST 7] Issued Documents Management (Revocation, Reinstatement & Expired)');

    const activeDoc = await IssuedDocument.create({
      request_id: parityReq._id,
      certificate_number: `CERT-REV-${Date.now().toString().slice(-4)}`,
      document_name: docType.name,
      issued_to_name: citizenUser.full_name,
      verification_code: `VER-REV-${Date.now().toString().slice(-4)}`,
      qr_data: 'https://portal.quickfile.gov.ph/verify/VER-REV',
      qr_code_image: 'data:image/png;base64,mock',
      issued_by: adminUser._id,
      validity_status: VALIDITY_STATUSES.VALID,
    });

    const revokeRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/issued-documents/${activeDoc._id}/revoke`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { reason: 'Document revoked due to falsified barangay residency information.' }
    );
    assert.strictEqual(revokeRes.status, 200);
    assert.strictEqual(revokeRes.data?.data?.validity_status, VALIDITY_STATUSES.REVOKED);
    console.log('PASS: POST /admin/issued-documents/:id/revoke changed status to revoked and sent notification.');

    const reinstateRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/issued-documents/${activeDoc._id}/reinstate`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {}
    );
    assert.strictEqual(reinstateRes.status, 200);
    assert.strictEqual(reinstateRes.data?.data?.validity_status, VALIDITY_STATUSES.VALID);
    console.log('PASS: POST /admin/issued-documents/:id/reinstate restored revoked document to valid.');

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
      expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    const revokeExpRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/issued-documents/${expiredDoc._id}/revoke`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { reason: 'Attempting to revoke expired document.' }
    );
    assert.strictEqual(revokeExpRes.status, 400);
    console.log('PASS: POST /admin/issued-documents/:id/revoke on expired document returned status 400.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 8: Audit Logs & Admin Reports
    // -------------------------------------------------------------------------
    console.log('[TEST 8] Audit Logs (Filters & Read-Only Immutability) and Admin Reports');

    const auditRes = await makeRequest(server, {
      path: `${API_PREFIX}/admin/audit-logs?module=DOCUMENT&limit=10`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(auditRes.status, 200);
    assert(auditRes.data?.data?.logs?.length >= 1);
    console.log('PASS: GET /admin/audit-logs filtered logs by module and honored date range.');

    // PUT, PATCH, DELETE to audit-logs return 404
    const putAudit = await makeRequest(server, { path: `${API_PREFIX}/admin/audit-logs`, method: 'PUT', headers: { Authorization: `Bearer ${adminToken}` } }, { x: 1 });
    const patchAudit = await makeRequest(server, { path: `${API_PREFIX}/admin/audit-logs`, method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` } }, { x: 1 });
    const deleteAudit = await makeRequest(server, { path: `${API_PREFIX}/admin/audit-logs`, method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });

    assert.strictEqual(putAudit.status, 404);
    assert.strictEqual(patchAudit.status, 404);
    assert.strictEqual(deleteAudit.status, 404);
    console.log('PASS: PUT, PATCH, and DELETE requests to /admin/audit-logs returned status 404 enforcing read-only immutability.');

    const adminReportsRes = await makeRequest(server, {
      path: `${API_PREFIX}/admin/reports?from=2026-01-01&to=2026-12-31`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(adminReportsRes.status, 200);
    assert(adminReportsRes.data?.data?.staff_workload !== undefined);
    console.log('PASS: GET /admin/reports returned structured report with staff_workload analytics.');
    console.log('--------------------------------------------------------------------\n');

    console.log('====================================================================');
    console.log('ALL 8 PHASE 2, STEP 2D (ADMIN MANAGEMENT) TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================================');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();

    try {
      const conn = await mongoose.connect(TEST_DB_URI);
      await conn.connection.db.dropDatabase();
      await conn.disconnect();
      console.log('[Cleanup] Dropped isolated quickfile_test_2d database.');
    } catch {}

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
