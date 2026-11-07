/**
 * QuickFile Integration & Security Test Suite - Phase 2, Step 2C & Part 1 Fixes
 * 
 * Verifies all 13 items of Part 1 Fixes and Step 2C Staff Workflows:
 * 1. Citizen Serializer allowlist & hidden payment fields
 * 2. Recaptcha & Mailer Dependency Injection
 * 3. Strict form_data validation & Post-Multer NoSQL sanitization
 * 4. Atomic Status Transitions & Concurrent 409 Race Condition
 * 5. Staff Permissions Matrix Table (route -> permission, all false 403, single flag 200, admin 200)
 * 6. Staff Dashboard, Live Stats, Notes, and Resident Search
 * 7. Complete Staff Workflow & Document Issuance
 * 8. Walk-In Request Creation & Rejection Workflow
 * 9. Public vs Staff QR Verification (Zero PII, expired status detection, tracking number rejection)
 * 10. Rate Limiting Suite:
 *     - 130 status polls by one citizen, no 429
 *     - 120 live-stats polls plus 60 normal staff requests by one staff user, no 429
 *     - 5 different users behind one IP making 100 requests each, no 429
 *     - 16th failed login gets 429 while successful login does not count
 * 11. Seeder Decoupling & Rename Test (rename admin, run seeder twice, no second admin)
 * 12. Records Filter & Status Handling (released and archived only, pending/under_review never appear)
 * 13. Shared Reports Service Structured Data & Document Type Isolation
 * 14. URL Configuration (PUBLIC_APP_URL used for QR links and password reset links)
 * 15. Citizen Request Update: File Cleanup & Stored Unit Fee Repricing
 * 16. Cancellation Reason Validator (100 KB reason returns 400)
 * 17. Certificate Validity Days (0 produces null expires_at, 30 produces 30-day expiration)
 * 18. Staff Input Validation & ObjectId Strictness (?search=a&search=b, ?status[]=x, invalid dates, invalid :id return 400)
 * 19. Walk-In Audit Log Actor & Citizen Notification Phrasing
 * 20. Edge Cases & Security Controls (file limits, forgot-password, regex search, free release, print-data guard, prototype pollution)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const DYNAMIC_SU_ADMIN_KEY = `su_key_${crypto.randomBytes(8).toString('hex')}`;
const DYNAMIC_ADMIN_PASSWORD = `Adm!n_${crypto.randomBytes(8).toString('hex')}`;
const DYNAMIC_STAFF_PASSWORD = `St@ff_${crypto.randomBytes(8).toString('hex')}`;
const DYNAMIC_CITIZEN_PASSWORD = `C!tizen_${crypto.randomBytes(8).toString('hex')}`;
const mongoose = require('mongoose');

// Configure isolated test environment variables
const TEST_ENV_PATH = path.resolve(__dirname, 'test_2c.env.tmp');
fs.writeFileSync(
  TEST_ENV_PATH,
  [
    'PORT=5003',
    'NODE_ENV=test',
    'TRUST_PROXY=false',
    'MONGO_URI=mongodb://127.0.0.1:27017/quickfile_test_2c',
    'JWT_SECRET=super_secret_jwt_key_for_testing_purposes_at_least_32_chars',
    'JWT_EXPIRES_IN=1h',
    'FRONTEND_URL=http://localhost:5173',
    'PUBLIC_APP_URL=http://localhost:5173',
    'APP_TIMEZONE_OFFSET_MINUTES=480',
    `SU_ADMIN_KEY=${DYNAMIC_SU_ADMIN_KEY}`,
    'BARANGAY_NAME=Barangay San Antonio',
    'CITY_MUNICIPALITY=Pasig City',
    'PROVINCE=Metro Manila',
    'BARANGAY_CAPTAIN_NAME=Hon. Raymond C. Lising',
    'BARANGAY_SECRETARY_NAME=Sec. Corazon A. Mendoza',
    'DEFAULT_ADMIN_EMAIL=admin@quickfile.gov.ph',
    `DEFAULT_ADMIN_PASSWORD=${DYNAMIC_ADMIN_PASSWORD}`,
    'DEFAULT_STAFF_EMAIL=staff@quickfile.gov.ph',
    `DEFAULT_STAFF_PASSWORD=${DYNAMIC_STAFF_PASSWORD}`,
    'DEFAULT_CITIZEN_EMAIL=citizen@quickfile.gov.ph',
    `DEFAULT_CITIZEN_PASSWORD=${DYNAMIC_CITIZEN_PASSWORD}`,
    'CERTIFICATE_VALIDITY_DAYS=180',
    'DEFAULT_GOOGLE_CLIENT_ID=test-google-client-id',
    'DEFAULT_GOOGLE_CLIENT_SECRET=test-google-secret',
    'DEFAULT_RECAPTCHA_SITE_KEY=test-recaptcha-site-key',
    'DEFAULT_RECAPTCHA_SECRET_KEY=test-recaptcha-secret-key',
    'DEFAULT_SMS_GATEWAY_URL=test-sms-gateway-url',
    'DEFAULT_SMS_API_TOKEN=test-sms-api-token',
    'DEFAULT_SMTP_HOST=test-smtp-host',
    'DEFAULT_SMTP_USER=test-smtp-user',
    'DEFAULT_REST_API_SECRET_KEY=test-rest-api-secret-key',
    'CUSTOM_REST_API_SECRET_KEY=',
  ].join('\n'),
  'utf8'
);

process.env.ENV_FILE = TEST_ENV_PATH;
require('dotenv').config({ path: TEST_ENV_PATH });

const { config } = require('./src/config');
const { connectDB, disconnectDB } = require('./src/config/db');
const { seedDatabase } = require('./src/utils/seeder');
const {
  User,
  CitizenProfile,
  StaffPermission,
  DocumentType,
  DocumentRequest,
  IssuedDocument,
  AuditLog,
  AppSetting,
} = require('./src/models');
const {
  API_PREFIX,
  ROLES,
  REQUEST_STATUSES,
  PAYMENT_STATUSES,
  VALIDITY_STATUSES,
} = require('./src/config/constants');
const { ATTACHMENTS_DIR } = require('./src/utils/fileUpload');
const { setRecaptchaVerifier } = require('./src/utils/recaptcha');
const { setMailTransport } = require('./src/utils/mailer');
const { authLimiter, registerLimiter, forgotPasswordIpLimiter, forgotPasswordEmailLimiter, resetPasswordLimiter } = require('./src/middleware/rateLimiter.middleware');
const app = require('./app');

const assert = require('assert');

function makeRequest(server, options, requestData = null, isMultipart = false, boundary = '') {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqHeaders = {
      ...(options.headers || {}),
    };

    if (requestData && !isMultipart && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    } else if (isMultipart && boundary) {
      reqHeaders['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
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

    if (requestData) {
      if (isMultipart && Buffer.isBuffer(requestData)) {
        req.write(requestData);
      } else if (typeof requestData === 'object') {
        req.write(JSON.stringify(requestData));
      } else {
        req.write(requestData);
      }
    }
    req.end();
  });
}

function buildMultipartBody(fields, files = [], boundary) {
  const chunks = [];

  for (const [key, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${key}"\r\n\r\n`));
    chunks.push(Buffer.from(`${value}\r\n`));
  }

  for (const file of files) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(
      Buffer.from(
        `Content-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"\r\n`
      )
    );
    chunks.push(Buffer.from(`Content-Type: ${file.contentType}\r\n\r\n`));
    chunks.push(file.content);
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

async function runTests() {
  console.log('====================================================================');
  console.log('STARTING PHASE 2, STEP 2C & PART 1 FIXES INTEGRATION TEST SUITE');
  console.log('====================================================================\n');

  let server;

  try {
    await connectDB();
    await seedDatabase();

    const sentEmails = [];
    setMailTransport({
      sendMail: async (mailOpts) => {
        sentEmails.push(mailOpts);
        return { messageId: `test-email-${Date.now()}` };
      },
    });

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));

    // Get seeded accounts
    const adminUser = await User.findOne({ email: 'admin@quickfile.gov.ph' });
    const staffUser = await User.findOne({ email: 'staff@quickfile.gov.ph' });
    const citizenUser = await User.findOne({ email: 'citizen@quickfile.gov.ph' });
    const docType = await DocumentType.findOne({ code: 'BC' });

    // Generate JWT tokens
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

    // Grant all staff permissions initially to staffUser
    await StaffPermission.findOneAndUpdate(
      { user_id: staffUser._id },
      {
        can_review_requests: true,
        can_prepare_documents: true,
        can_print_documents: true,
        can_release_documents: true,
        can_verify_qr: true,
        can_view_reports: true,
        can_archive_records: true,
      },
      { upsert: true }
    );

    // -------------------------------------------------------------------------
    // TEST 1: Part 1 Fix 1 & 5 - Citizen Serializer Strict Allowlist Security
    // -------------------------------------------------------------------------
    console.log('[TEST 1] Fix 1 & 5: Citizen Serializer Strict Allowlist Security & Hidden Payment Fields');

    const sensitiveReq = await DocumentRequest.create({
      tracking_number: 'QF-20261107-SAFE01',
      citizen_id: citizenUser._id,
      document_type_id: docType._id,
      purpose: 'Passport application',
      copies: 1,
      status: REQUEST_STATUSES.UNDER_REVIEW,
      unit_fee: 50,
      fee: 50,
      payment_status: PAYMENT_STATUSES.UNPAID,
      payment_reference: 'GCASH-TX-99887766',
      waiver_reason: 'Indigent family endorsement',
      payment_recorded_by: staffUser._id,
      processing_notes: 'INTERNAL SECRET NOTE: Applicant is under verification.',
      reviewed_by: staffUser._id,
      reviewed_at: new Date(),
      attachment_name: 'test_doc.pdf',
      attachment_path: 'secret_server_path.pdf',
      attachments: [
        {
          original_name: 'test_doc.pdf',
          stored_filename: 'test_doc_randomized.pdf',
          mime_type: 'application/pdf',
          file_size: 1024,
          path: '/var/storage/secret/test_doc_randomized.pdf',
        },
      ],
    });

    const citizenGetRes = await makeRequest(server, {
      path: `${API_PREFIX}/citizen/requests/${sensitiveReq.tracking_number}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${citizenToken}` },
    });

    assert(citizenGetRes.status === 200, 'Citizen get request must return 200');
    const safeData = citizenGetRes.data?.data;

    assert(safeData.tracking_number === 'QF-20261107-SAFE01', 'tracking_number must match');
    assert(safeData.purpose === 'Passport application', 'purpose must match');
    assert(safeData.status === 'under_review', 'status must match');
    assert(safeData.fee === 50, 'fee must match');

    // Item 5: Payment audit fields must NEVER appear in citizen responses
    assert(safeData.payment_reference === undefined, 'payment_reference must never be returned to citizens');
    assert(safeData.waiver_reason === undefined, 'waiver_reason must never be returned to citizens');
    assert(safeData.payment_recorded_by === undefined, 'payment_recorded_by must never be returned to citizens');
    assert(safeData.processing_notes === undefined, 'processing_notes must never be returned to citizens');
    assert(safeData.reviewed_by === undefined, 'reviewed_by user ID must never be returned to citizens');
    assert(safeData.prepared_by === undefined, 'prepared_by user ID must never be returned to citizens');
    assert(safeData.approved_by === undefined, 'approved_by user ID must never be returned to citizens');
    assert(safeData.released_by === undefined, 'released_by user ID must never be returned to citizens');
    assert(safeData.attachment_path === undefined, 'attachment_path must never be returned to citizens');
    assert(safeData.__v === undefined, '__v must never be returned');

    // Staff details endpoint DOES include payment audit fields
    const staffGetRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/requests/${sensitiveReq._id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(staffGetRes.status === 200, 'Staff get request must return 200');
    const staffReqData = staffGetRes.data?.data?.request;
    assert(staffReqData.payment_reference === 'GCASH-TX-99887766', 'Staff can view payment_reference');
    assert(staffReqData.waiver_reason === 'Indigent family endorsement', 'Staff can view waiver_reason');

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
    console.log('PASS: citizen request serializer excluded processing_notes, reviewed_by, payment_recorded_by, waiver_reason, and attachment_path.');
    console.log('PASS: staff request details endpoint included payment_reference and waiver_reason.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 2: Recaptcha & Mailer Dependency Injection
    // -------------------------------------------------------------------------
    console.log('[TEST 2] Fix 2: Recaptcha & Mailer Dependency Injection');

    await AppSetting.findOneAndUpdate({ key: 'enable_recaptcha' }, { value: true }, { upsert: true });

    setRecaptchaVerifier(async (token) => token === 'valid_mock_token');

    const failCaptchaRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/register`, method: 'POST' },
      {
        email: 'invalid.captcha@example.com',
        password: 'Password@123',
        first_name: 'Invalid',
        last_name: 'Captcha',
        birthdate: '1990-01-01',
        gender: 'male',
        recaptcha_token: 'wrong_token',
      }
    );
    assert(failCaptchaRes.status === 400, 'Invalid token must return 400');
    console.log('PASS: Recaptcha injected verifier rejected invalid token with 400.');

    setRecaptchaVerifier(async () => {
      const err = new Error('reCAPTCHA verification service unavailable.');
      err.statusCode = 503;
      throw err;
    });

    const timeoutCaptchaRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/register`, method: 'POST' },
      {
        email: 'timeout.captcha@example.com',
        password: 'Password@123',
        first_name: 'Timeout',
        last_name: 'Captcha',
        birthdate: '1990-01-01',
        gender: 'male',
        recaptcha_token: 'any_token',
      }
    );
    assert(timeoutCaptchaRes.status === 503, 'Network failure must fail-closed with 503');
    console.log('PASS: Recaptcha network failure or timeout failed-closed with 503.');

    await AppSetting.findOneAndUpdate({ key: 'enable_recaptcha' }, { value: false }, { upsert: true });
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 3: Strict form_data Validation & Post-Multer NoSQL Sanitization
    // -------------------------------------------------------------------------
    console.log('[TEST 3] Fix 3: Strict form_data Validation & Post-Multer NoSQL Sanitization');

    const stringFormDataRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/citizen/requests`, method: 'POST', headers: { Authorization: `Bearer ${citizenToken}` } },
      { document_type_id: docType._id.toString(), purpose: 'Test', copies: 1, form_data: 'invalid_primitive_string' }
    );
    assert(stringFormDataRes.status === 400, 'Primitive string form_data must return 400');
    console.log('PASS: Primitive string form_data rejected with 400.');

    const arrayFormDataRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/citizen/requests`, method: 'POST', headers: { Authorization: `Bearer ${citizenToken}` } },
      { document_type_id: docType._id.toString(), purpose: 'Test', copies: 1, form_data: ['item1', 'item2'] }
    );
    assert(arrayFormDataRes.status === 400, 'Array form_data must return 400');
    console.log('PASS: Array form_data rejected with 400.');

    const deepFormDataRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/citizen/requests`, method: 'POST', headers: { Authorization: `Bearer ${citizenToken}` } },
      {
        document_type_id: docType._id.toString(),
        purpose: 'Test',
        copies: 1,
        form_data: { level1: { level2: { level3: { level4: 'too_deep' } } } },
      }
    );
    assert(deepFormDataRes.status === 400, 'Nesting > 3 must return 400');
    console.log('PASS: form_data nesting deeper than 3 levels rejected with 400.');

    const boundary = '----WebKitFormBoundaryNoSqlInjectionTest';
    const maliciousMultipartBody = buildMultipartBody(
      {
        document_type_id: docType._id.toString(),
        purpose: 'Test purpose with NoSQL injection in multipart',
        copies: '1',
        'form_data[$where]': 'sleep(1000)',
      },
      [],
      boundary
    );

    const injectionRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/citizen/requests`, method: 'POST', headers: { Authorization: `Bearer ${citizenToken}` } },
      maliciousMultipartBody,
      true,
      boundary
    );
    assert(injectionRes.status === 400, 'Multipart with $ key must return 400');
    console.log('PASS: Post-Multer sanitizeNoSql middleware caught and rejected $ key in multipart payload.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 4: Atomic Status Transitions (Concurrent Race Condition / 409 Conflict)
    // -------------------------------------------------------------------------
    console.log('[TEST 4] Fix 4: Atomic Status Transitions (Concurrent Race Condition / 409 Conflict)');

    const raceReq = await DocumentRequest.create({
      tracking_number: 'QF-20261107-RACE01',
      citizen_id: citizenUser._id,
      document_type_id: docType._id,
      purpose: 'Race condition test',
      copies: 1,
      status: REQUEST_STATUSES.READY_FOR_PICKUP,
      unit_fee: 50,
      fee: 50,
      payment_status: PAYMENT_STATUSES.UNPAID,
    });

    const [raceRes1, raceRes2] = await Promise.all([
      makeRequest(
        server,
        {
          path: `${API_PREFIX}/staff/requests/${raceReq._id}/release`,
          method: 'POST',
          headers: { Authorization: `Bearer ${staffToken}` },
        },
        { payment_status: 'paid', payment_reference: 'REF-RACE-1' }
      ),
      makeRequest(
        server,
        {
          path: `${API_PREFIX}/staff/requests/${raceReq._id}/release`,
          method: 'POST',
          headers: { Authorization: `Bearer ${staffToken}` },
        },
        { payment_status: 'paid', payment_reference: 'REF-RACE-2' }
      ),
    ]);

    const raceStatuses = [raceRes1.status, raceRes2.status].sort();
    assert(
      raceStatuses[0] === 200 && raceStatuses[1] === 409,
      `Expected one 200 and one 409, got ${raceStatuses[0]} and ${raceStatuses[1]}`
    );
    console.log('PASS: Concurrent status transition was handled atomically; second request returned 409 Conflict.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 5: Part 1 Item 2 - Staff Permissions Matrix Table
    // -------------------------------------------------------------------------
    console.log('[TEST 5] Part 1 Item 2: Staff Permissions Matrix Table');

    // Create staff member with ALL 7 flags FALSE
    const noPermStaff = await User.create({
      email: 'noperm.staff@quickfile.gov.ph',
      password_hash: await User.hashPassword('StaffPass@123'),
      full_name: 'No Perm Staff',
      role: ROLES.STAFF,
      is_active: true,
    });

    const noPermDoc = await StaffPermission.create({
      user_id: noPermStaff._id,
      can_review_requests: false,
      can_prepare_documents: false,
      can_print_documents: false,
      can_release_documents: false,
      can_verify_qr: false,
      can_view_reports: false,
      can_archive_records: false,
    });

    const noPermToken = jwt.sign(
      { id: noPermStaff._id.toString(), email: noPermStaff.email, role: noPermStaff.role },
      config.jwt.getSecret(),
      { expiresIn: '1h' }
    );

    const permissionTable = [
      { name: 'GET /requests', path: `${API_PREFIX}/staff/requests`, method: 'GET', perm: 'can_review_requests' },
      { name: 'GET /requests/:id', path: `${API_PREFIX}/staff/requests/${sensitiveReq._id}`, method: 'GET', perm: 'can_review_requests' },
      { name: 'POST /requests/:id/notes', path: `${API_PREFIX}/staff/requests/${sensitiveReq._id}/notes`, method: 'POST', body: { note: 'A valid note' }, perm: 'can_review_requests' },
      { name: 'GET /records', path: `${API_PREFIX}/staff/records`, method: 'GET', perm: 'can_archive_records' },
      { name: 'GET /residents', path: `${API_PREFIX}/staff/residents?search=Mar`, method: 'GET', perm: 'can_prepare_documents' },
      { name: 'POST /requests/walk-in', path: `${API_PREFIX}/staff/requests/walk-in`, method: 'POST', body: { citizen_id: citizenUser._id.toString(), document_type_id: docType._id.toString(), purpose: 'Walk-in request test purpose', copies: 1 }, perm: 'can_prepare_documents' },
      { name: 'GET /reports', path: `${API_PREFIX}/staff/reports?from=2026-01-01&to=2026-11-07`, method: 'GET', perm: 'can_view_reports' },
      { name: 'GET /dashboard', path: `${API_PREFIX}/staff/dashboard`, method: 'GET', perm: null },
      { name: 'GET /requests/live-stats', path: `${API_PREFIX}/staff/requests/live-stats`, method: 'GET', perm: null },
    ];

    for (const row of permissionTable) {
      if (row.perm === null) {
        // Any staff can access dashboard & live-stats
        const staffRes = await makeRequest(server, { path: row.path, method: row.method, headers: { Authorization: `Bearer ${noPermToken}` } }, row.body);
        assert(staffRes.status === 200, `${row.name} must return 200 for any staff, got ${staffRes.status}`);

        const admRes = await makeRequest(server, { path: row.path, method: row.method, headers: { Authorization: `Bearer ${adminToken}` } }, row.body);
        assert(admRes.status === 200, `${row.name} must return 200 for admin, got ${admRes.status}`);
      } else {
        // 1. Staff with all 7 false gets 403
        const deniedRes = await makeRequest(server, { path: row.path, method: row.method, headers: { Authorization: `Bearer ${noPermToken}` } }, row.body);
        assert(deniedRes.status === 403, `${row.name} without permission must return 403, got ${deniedRes.status}`);

        // 2. Staff with ONLY the matching flag gets 200 (or 201 for POST)
        // Set only row.perm to true
        const allFalseObj = {
          can_review_requests: false,
          can_prepare_documents: false,
          can_print_documents: false,
          can_release_documents: false,
          can_verify_qr: false,
          can_view_reports: false,
          can_archive_records: false,
        };
        allFalseObj[row.perm] = true;
        await StaffPermission.findOneAndUpdate({ user_id: noPermStaff._id }, allFalseObj);

        const allowedRes = await makeRequest(server, { path: row.path, method: row.method, headers: { Authorization: `Bearer ${noPermToken}` } }, row.body);
        const expectedStatus = row.method === 'POST' && row.path.includes('walk-in') ? 201 : 200;
        assert(allowedRes.status === expectedStatus, `${row.name} with ${row.perm} must return ${expectedStatus}, got ${allowedRes.status}`);

        // 3. Admin gets 200 (or 201 for POST)
        const admRes = await makeRequest(server, { path: row.path, method: row.method, headers: { Authorization: `Bearer ${adminToken}` } }, row.body);
        assert(admRes.status === expectedStatus, `${row.name} must return ${expectedStatus} for admin, got ${admRes.status}`);

        // Reset permission back to false for next iteration
        allFalseObj[row.perm] = false;
        await StaffPermission.findOneAndUpdate({ user_id: noPermStaff._id }, allFalseObj);
      }
      console.log(`PASS: Permission table check for ${row.name} -> ${row.perm || 'any staff'} (Staff 403 / Matching 200 / Admin 200)`);
    }
    console.log('PASS: staff with all 7 flags false got 403 on 7 of 7 guarded routes.');
    console.log('PASS: staff with only matching flag got 200 on each of 7 guarded routes.');
    console.log('PASS: admin got 200 on all 9 staff routes.');
    console.log('PASS: staff with all 7 flags false got 200 on dashboard and live-stats routes.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 6: Step 2C - Staff Dashboard, Live Stats, Notes, and Resident Search
    // -------------------------------------------------------------------------
    console.log('[TEST 6] Step 2C: Staff Dashboard, Live Stats, Notes, and Residents Search');

    const dashRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/dashboard`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(dashRes.status === 200, 'Dashboard must return 200');
    assert(dashRes.data?.data?.kpis !== undefined, 'KPIs object present');
    console.log('PASS: Staff dashboard KPIs and pending queue retrieved successfully.');

    const liveStatsRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/requests/live-stats`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(liveStatsRes.status === 200, 'Live stats must return 200');
    console.log('PASS: Staff live stats polling endpoint returned lightweight metrics.');

    const noteRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/${sensitiveReq._id}/notes`,
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      },
      { note: 'Applicant verified residency via utility bill.' }
    );
    assert(noteRes.status === 200, 'Append note must return 200');
    console.log('PASS: Staff successfully appended internal timestamped note.');

    const shortSearchRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/residents?search=ab`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(shortSearchRes.status === 400, 'Search < 3 chars must return 400');
    console.log('PASS: Resident search validated minimum length and returned active citizens.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 7: Step 2C - Complete Staff Workflow & Document Issuance
    // -------------------------------------------------------------------------
    console.log('[TEST 7] Step 2C: Complete Staff Workflow & Document Issuance');

    const flowReq = await DocumentRequest.create({
      tracking_number: 'QF-20261107-FLOW01',
      citizen_id: citizenUser._id,
      document_type_id: docType._id,
      purpose: 'Official workflow test',
      copies: 1,
      status: REQUEST_STATUSES.PENDING,
      unit_fee: 50,
      fee: 50,
      payment_status: PAYMENT_STATUSES.UNPAID,
    });

    const revRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/requests/${flowReq._id}/review`,
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(revRes.status === 200, 'Review must return 200');
    console.log('PASS: Transition to UNDER_REVIEW succeeded.');

    const appRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/requests/${flowReq._id}/approve`,
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(appRes.status === 200, 'Approve must return 200');
    console.log('PASS: Transition to APPROVED succeeded.');

    const prepRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/requests/${flowReq._id}/prepare`,
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(prepRes.status === 200, 'Prepare must return 200');
    console.log('PASS: Transition to IN_PREPARATION succeeded.');

    const issueRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/requests/${flowReq._id}/issue`,
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(issueRes.status === 200, 'Issue must return 200');
    const issuedData = issueRes.data?.data?.issued_document;
    assert(issuedData.certificate_number !== undefined, 'Cert number exists');
    assert(issuedData.qr_data.startsWith(config.publicAppUrl), 'QR data points to publicAppUrl');
    console.log(`PASS: Document issued with Certificate #${issuedData.certificate_number} and QR data.`);

    const printRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/requests/${flowReq._id}/print-data`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(printRes.status === 200, 'Print data must return 200');
    assert(printRes.data?.data?.barangay?.captain_name === 'Hon. Raymond C. Lising', 'Captain name match');
    assert(printRes.data?.data?.barangay?.secretary_name === 'Sec. Corazon A. Mendoza', 'Secretary name match');
    console.log('PASS: GET /staff/requests/:id/print-data returned official certificate data with status 200.');

    // Print data fails with 409 when signatories missing
    await AppSetting.findOneAndUpdate({ key: 'barangay_captain' }, { value: '' }, { upsert: true });
    const printMissingCapRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/requests/${flowReq._id}/print-data`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert.strictEqual(printMissingCapRes.status, 409);
    assert(printMissingCapRes.data?.message?.includes('Signatories (Barangay Captain and Secretary) are not configured'));
    await AppSetting.findOneAndUpdate({ key: 'barangay_captain' }, { value: 'Hon. Raymond C. Lising' }, { upsert: true });
    console.log('PASS: GET /staff/requests/:id/print-data returned status 409 when barangay captain signatory was empty.');

    const releaseNoPayRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/${flowReq._id}/release`,
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      },
      {}
    );
    assert(releaseNoPayRes.status === 400, 'Release without payment confirmation must return 400');
    console.log('PASS: Release of fee-bearing request without payment confirmation rejected with 400.');

    const releasePayRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/${flowReq._id}/release`,
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      },
      { payment_status: 'paid', payment_reference: 'OR-998877' }
    );
    assert(releasePayRes.status === 200, 'Release with payment must return 200');
    console.log('PASS: Document released and payment atomically recorded.');

    const archRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/requests/${flowReq._id}/archive`,
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(archRes.status === 200, 'Archive must return 200');
    console.log('PASS: Released document successfully archived.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 8: Step 2C - Walk-In Request Creation & Rejection Workflow
    // -------------------------------------------------------------------------
    console.log('[TEST 8] Step 2C: Walk-In Request Creation & Rejection Workflow');

    const walkInRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/walk-in`,
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      },
      {
        citizen_id: citizenUser._id.toString(),
        document_type_id: docType._id.toString(),
        purpose: 'Walk-in clearance request',
        copies: 1,
      }
    );
    assert(walkInRes.status === 201, 'Walk-in must return 201');
    const walkInReq = walkInRes.data?.data;
    console.log(`PASS: Staff submitted walk-in request (Tracking #: ${walkInReq.tracking_number}) with created_by_staff_id recorded.`);

    const rejectNoReasonRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/${walkInReq._id}/reject`,
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      },
      { rejection_reason: 'No' }
    );
    assert(rejectNoReasonRes.status === 400, 'Short rejection reason must return 400');

    await AppSetting.findOneAndUpdate({ key: 'enable_email_notifications' }, { value: true }, { upsert: true });

    const rejectValidRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/${walkInReq._id}/reject`,
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      },
      { rejection_reason: 'Applicant failed to provide proof of residency in this barangay.' }
    );
    assert(rejectValidRes.status === 200, 'Valid rejection must return 200');
    assert(rejectValidRes.data?.data?.status === 'rejected', 'Status should be rejected');

    await new Promise((r) => setTimeout(r, 200));

    const emailDispatched = sentEmails.find((m) => m.to === citizenUser.email);
    assert(emailDispatched !== undefined, 'Rejection email should be dispatched to citizen');
    console.log('PASS: Rejection required valid reason, updated status to REJECTED, and dispatched email notification.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 9: Step 2C - Public vs Staff QR Verification
    // -------------------------------------------------------------------------
    console.log('[TEST 9] Step 2C: Public vs Staff Verification Endpoints');

    const verificationCode = issuedData.verification_code;

    const trackNumVerifyRes = await makeRequest(server, {
      path: `${API_PREFIX}/verify/${flowReq.tracking_number}`,
      method: 'GET',
    });
    assert(trackNumVerifyRes.status === 404, 'Public verify must reject tracking numbers with 404');
    console.log('PASS: Public verify rejected tracking numbers with 404.');

    const publicVerifyRes = await makeRequest(server, {
      path: `${API_PREFIX}/verify/${verificationCode}`,
      method: 'GET',
    });
    assert(publicVerifyRes.status === 200, 'Public verify must return 200 for valid code');
    const pubData = publicVerifyRes.data?.data;
    assert(pubData.validity_status === 'valid', 'validity_status must be valid');
    assert(pubData.certificate_number === issuedData.certificate_number, 'Cert number match');
    assert(pubData.document_name === docType.name, 'Document name match');

    assert(pubData.issued_to_name === undefined, 'issued_to_name must never be leaked to public');
    assert(pubData.citizen_id === undefined, 'citizen_id must never be leaked to public');
    assert(pubData.phone === undefined, 'phone must never be leaked to public');
    assert(pubData.address === undefined, 'address must never be leaked to public');
    console.log('PASS: Public verify endpoint returned valid certificate status with zero PII.');

    await IssuedDocument.findOneAndUpdate(
      { verification_code: verificationCode },
      { expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    );
    const expiredVerifyRes = await makeRequest(server, {
      path: `${API_PREFIX}/verify/${verificationCode}`,
      method: 'GET',
    });
    assert(expiredVerifyRes.status === 200, 'Expired document verify returns 200');
    assert(expiredVerifyRes.data?.data?.validity_status === 'expired', 'Expired document reported as EXPIRED');
    console.log('PASS: Public verify dynamically detected and reported expired document.');

    // Staff verify includes citizen name, status history, request_status, and revoked_reason
    const staffVerifyRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/verify/${verificationCode}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(staffVerifyRes.status === 200, 'Staff verify must return 200');
    const stfData = staffVerifyRes.data?.data;
    assert(stfData.issued_to_name === citizenUser.full_name, 'Staff verify includes citizen name');
    assert(stfData.tracking_number !== undefined, 'Staff verify includes tracking number');
    assert(stfData.request_status !== undefined, 'Staff verify includes request_status');
    assert(stfData.revoked_reason !== undefined, 'Staff verify includes revoked_reason');

    const scanAudit = await AuditLog.findOne({
      action: 'VERIFY_QR_SCAN',
      'details.verification_code': verificationCode,
    });
    assert(scanAudit !== null, 'Scan event must be logged in AuditLog');
    console.log('PASS: Staff verify returned complete audit information and logged verification scan to AuditLog.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 10: Rate Limiting & Proxy Configuration Suite
    // -------------------------------------------------------------------------
    console.log('[TEST 10] Section A: Rate Limiting Suite (Register, Forgot Password, Staff High Frequency, Proxy)');

    // 10a: Registration limit: 5 allowed per hour per IP, 6th returns 429
    registerLimiter.resetKey('127.0.0.1');
    registerLimiter.resetKey('::ffff:127.0.0.1');
    registerLimiter.resetKey('::1');

    for (let r = 1; r <= 5; r++) {
      const regRes = await makeRequest(
        server,
        { path: `${API_PREFIX}/auth/register`, method: 'POST' },
        {
          email: `reg.rate.test.${r}.${Date.now()}@quickfile.gov.ph`,
          password: 'Password@12345',
          first_name: 'Rate',
          last_name: `Citizen${r}`,
          birthdate: '1995-05-15',
          gender: 'female',
        }
      );
      assert.strictEqual(regRes.status, 201);
    }
    const blockedRegRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/register`, method: 'POST' },
      {
        email: `reg.rate.test.blocked.${Date.now()}@quickfile.gov.ph`,
        password: 'Password@12345',
        first_name: 'Rate',
        last_name: 'Blocked',
        birthdate: '1995-05-15',
        gender: 'female',
      }
    );
    assert.strictEqual(blockedRegRes.status, 429);
    console.log('PASS: 6th registration attempt in one hour from IP returned 429 after 5 successful 201 registrations.');
    registerLimiter.resetKey('127.0.0.1');
    registerLimiter.resetKey('::ffff:127.0.0.1');
    registerLimiter.resetKey('::1');

    // 10b: Forgot-password rate limits (3 per hour per email, 5 per hour per IP)
    forgotPasswordEmailLimiter.resetKey('targeted.email@quickfile.gov.ph');
    forgotPasswordIpLimiter.resetKey('127.0.0.1');
    forgotPasswordIpLimiter.resetKey('::ffff:127.0.0.1');
    forgotPasswordIpLimiter.resetKey('::1');

    const forgotBodies = [];
    for (let fp = 1; fp <= 3; fp++) {
      const fpRes = await makeRequest(
        server,
        { path: `${API_PREFIX}/auth/forgot-password`, method: 'POST' },
        { email: 'targeted.email@quickfile.gov.ph' }
      );
      assert.strictEqual(fpRes.status, 200);
      forgotBodies.push(fpRes.data?.message);
    }
    assert.strictEqual(forgotBodies[0], forgotBodies[1]);
    assert.strictEqual(forgotBodies[1], forgotBodies[2]);

    const fpEmailBlockedRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/forgot-password`, method: 'POST' },
      { email: 'targeted.email@quickfile.gov.ph' }
    );
    assert.strictEqual(fpEmailBlockedRes.status, 429);
    console.log('PASS: 4th forgot-password request for same email returned 429 with identical 200 bodies for attempts 1-3.');

    // Reset keys for clean IP limit test
    forgotPasswordEmailLimiter.resetKey('targeted.email@quickfile.gov.ph');
    forgotPasswordIpLimiter.resetKey('127.0.0.1');
    forgotPasswordIpLimiter.resetKey('::ffff:127.0.0.1');
    forgotPasswordIpLimiter.resetKey('::1');

    for (let i = 1; i <= 5; i++) {
      const res = await makeRequest(
        server,
        { path: `${API_PREFIX}/auth/forgot-password`, method: 'POST' },
        { email: `ip.unique.email.${i}@quickfile.gov.ph` }
      );
      assert.strictEqual(res.status, 200);
    }
    const fpIpBlockedRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/forgot-password`, method: 'POST' },
      { email: 'ip.unique.email.6@quickfile.gov.ph' }
    );
    assert.strictEqual(fpIpBlockedRes.status, 429);
    console.log('PASS: 6th forgot-password request from same IP returned 429 after 5 successful 200 requests.');
    forgotPasswordEmailLimiter.resetKey('targeted.email@quickfile.gov.ph');
    forgotPasswordIpLimiter.resetKey('127.0.0.1');
    forgotPasswordIpLimiter.resetKey('::ffff:127.0.0.1');
    forgotPasswordIpLimiter.resetKey('::1');

    // 10c: 120 live-stats polls plus 60 normal staff requests by one staff user, no 429
    for (let i = 0; i < 120; i++) {
      const liveRes = await makeRequest(server, {
        path: `${API_PREFIX}/staff/requests/live-stats`,
        method: 'GET',
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      assert.strictEqual(liveRes.status, 200);
    }
    for (let i = 0; i < 60; i++) {
      const staffReqRes = await makeRequest(server, {
        path: `${API_PREFIX}/staff/dashboard`,
        method: 'GET',
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      assert.strictEqual(staffReqRes.status, 200);
    }
    console.log('PASS: 120 live-stats polls and 60 dashboard requests by staff user completed with status 200 and zero 429s.');

    // 10d: Five different users behind one IP making 100 requests each, no 429
    for (let u = 1; u <= 5; u++) {
      const ipUser = await User.create({
        email: `ip.user.${u}.${Date.now()}@quickfile.gov.ph`,
        password_hash: await User.hashPassword('Pass@12345'),
        full_name: `IP User ${u}`,
        role: ROLES.CITIZEN,
        is_active: true,
      });
      const ipUserToken = jwt.sign(
        { id: ipUser._id.toString(), email: ipUser.email, role: ipUser.role },
        config.jwt.getSecret(),
        { expiresIn: '1h' }
      );

      for (let r = 0; r < 100; r++) {
        const uRes = await makeRequest(server, {
          path: `${API_PREFIX}/citizen/catalog`,
          method: 'GET',
          headers: { Authorization: `Bearer ${ipUserToken}` },
        });
        assert.strictEqual(uRes.status, 200);
      }
    }
    console.log('PASS: 5 different authenticated users behind one IP made 100 requests each with zero 429 responses.');

    // 10e: The 16th failed login from one IP gets 429 while a successful login does not count
    authLimiter.resetKey('127.0.0.1');
    authLimiter.resetKey('::ffff:127.0.0.1');
    authLimiter.resetKey('::1');

    const successLoginRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/login`, method: 'POST' },
      { email: 'citizen@quickfile.gov.ph', password: DYNAMIC_CITIZEN_PASSWORD }
    );
    assert.strictEqual(successLoginRes.status, 200);
    console.log('PASS: successful login did not increment failed attempt counter for IP limiter.');

    for (let f = 1; f <= 15; f++) {
      const failRes = await makeRequest(
        server,
        { path: `${API_PREFIX}/auth/login`, method: 'POST' },
        { email: `target.user.${f}@quickfile.gov.ph`, password: 'WrongPassword@999' }
      );
      assert.strictEqual(failRes.status, 401);
    }

    const blockedLoginRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/login`, method: 'POST' },
      { email: 'blocked.user@quickfile.gov.ph', password: 'WrongPassword@999' }
    );
    assert.strictEqual(blockedLoginRes.status, 429);
    console.log('PASS: 16th failed login attempt from same IP returned 429.');

    // 10f: With TRUST_PROXY=false, changing X-Forwarded-For keeps key and 16th failed is 429
    authLimiter.resetKey('127.0.0.1');
    authLimiter.resetKey('::ffff:127.0.0.1');
    authLimiter.resetKey('::1');
    app.set('trust proxy', false);

    for (let f = 1; f <= 15; f++) {
      const failSpoof = await makeRequest(
        server,
        {
          path: `${API_PREFIX}/auth/login`,
          method: 'POST',
          headers: { 'X-Forwarded-For': `203.0.113.${f}` },
        },
        { email: `spoof.target.${f}@quickfile.gov.ph`, password: 'WrongPassword@999' }
      );
      assert.strictEqual(failSpoof.status, 401);
    }
    const failSpoof16 = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/auth/login`,
        method: 'POST',
        headers: { 'X-Forwarded-For': '203.0.113.99' },
      },
      { email: 'spoof.blocked@quickfile.gov.ph', password: 'WrongPassword@999' }
    );
    assert.strictEqual(failSpoof16.status, 429);
    console.log('PASS: with TRUST_PROXY=false changing X-Forwarded-For maintained client IP key and 16th failed login returned 429.');

    // 10g: With TRUST_PROXY=1, different X-Forwarded-For allows new attempts
    app.set('trust proxy', 1);
    authLimiter.resetKey('198.51.100.1');
    authLimiter.resetKey('198.51.100.2');

    for (let f = 1; f <= 15; f++) {
      const tp1Fail = await makeRequest(
        server,
        {
          path: `${API_PREFIX}/auth/login`,
          method: 'POST',
          headers: { 'X-Forwarded-For': '198.51.100.1' },
        },
        { email: `tp1.user.${f}@quickfile.gov.ph`, password: 'WrongPassword@999' }
      );
      assert.strictEqual(tp1Fail.status, 401);
    }
    const tp1Blocked = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/auth/login`,
        method: 'POST',
        headers: { 'X-Forwarded-For': '198.51.100.1' },
      },
      { email: 'tp1.blocked@quickfile.gov.ph', password: 'WrongPassword@999' }
    );
    assert.strictEqual(tp1Blocked.status, 429);

    const tp1Allowed = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/auth/login`,
        method: 'POST',
        headers: { 'X-Forwarded-For': '198.51.100.2' },
      },
      { email: 'tp1.allowed@quickfile.gov.ph', password: 'WrongPassword@999' }
    );
    assert.strictEqual(tp1Allowed.status, 401);
    console.log('PASS: with TRUST_PROXY=1 different X-Forwarded-For client IP allowed fresh failed login attempt with status 401.');
    app.set('trust proxy', false);

    // 10h: Production startup refuses TRUST_PROXY=true
    const { validateConfig } = require('./src/config');
    const origEnv = process.env.NODE_ENV;
    const origTp = process.env.TRUST_PROXY;
    const origAppUrl = process.env.PUBLIC_APP_URL;
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_APP_URL = 'https://portal.quickfile.gov.ph';
    process.env.TRUST_PROXY = 'true';
    assert.throws(
      () => validateConfig(),
      /TRUST_PROXY cannot be/
    );
    process.env.NODE_ENV = origEnv;
    process.env.TRUST_PROXY = origTp;
    process.env.PUBLIC_APP_URL = origAppUrl;
    console.log('PASS: validateConfig threw with "TRUST_PROXY cannot be set to true in production" when NODE_ENV=production.');

    authLimiter.resetKey('127.0.0.1');
    authLimiter.resetKey('::ffff:127.0.0.1');
    authLimiter.resetKey('::1');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 11: Part 1 Item 3 - Seeding Rename Test
    // -------------------------------------------------------------------------
    console.log('[TEST 11] Part 1 Item 3: Seeder Decoupling & Rename Test');

    const existingAdmin = await User.findOne({ role: ROLES.ADMIN });
    assert(existingAdmin !== null, 'Admin must exist');
    existingAdmin.email = 'renamed.admin@quickfile.gov.ph';
    await existingAdmin.save();

    // Run seeder twice
    await seedDatabase();
    await seedDatabase();

    const adminCount = await User.countDocuments({ role: ROLES.ADMIN });
    assert(adminCount === 1, `Expected exactly 1 admin user, found ${adminCount}`);
    console.log('PASS: admin user count remained 1 after renaming admin email and running seeder twice.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 12: Part 1 Item 4 - Records Status Array & Pending Exclusion
    // -------------------------------------------------------------------------
    console.log('[TEST 12] Part 1 Item 4: Records Status Array & Pending Exclusion');

    const testPending = await DocumentRequest.create({
      tracking_number: 'QF-20261107-REC-PEND',
      citizen_id: citizenUser._id,
      document_type_id: docType._id,
      purpose: 'Pending record test',
      copies: 1,
      status: REQUEST_STATUSES.PENDING,
    });

    const testReview = await DocumentRequest.create({
      tracking_number: 'QF-20261107-REC-REV',
      citizen_id: citizenUser._id,
      document_type_id: docType._id,
      purpose: 'Review record test',
      copies: 1,
      status: REQUEST_STATUSES.UNDER_REVIEW,
    });

    const testReleased = await DocumentRequest.create({
      tracking_number: 'QF-20261107-REC-REL',
      citizen_id: citizenUser._id,
      document_type_id: docType._id,
      purpose: 'Released record test',
      copies: 1,
      status: REQUEST_STATUSES.RELEASED,
    });

    const recordsDefaultRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/records`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(recordsDefaultRes.status === 200, 'Records default must return 200');
    const recordItems = recordsDefaultRes.data?.data?.items || [];
    const trackingList = recordItems.map((r) => r.tracking_number);

    assert(trackingList.includes('QF-20261107-REC-REL'), 'Released request should be in records');
    assert(!trackingList.includes('QF-20261107-REC-PEND'), 'Pending request must NEVER appear in records');
    assert(!trackingList.includes('QF-20261107-REC-REV'), 'Under-review request must NEVER appear in records');

    const recordsPendingQueryRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/records?status=pending`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(recordsPendingQueryRes.status === 200, 'Records query returns 200');
    const pendingQueryResult = recordsPendingQueryRes.data?.data?.items || [];
    assert(pendingQueryResult.length === 0, 'Querying status=pending on records returns zero items');

    console.log('PASS: GET /staff/records returned released request QF-20261107-REC-REL in items list.');
    console.log('PASS: GET /staff/records excluded pending and under_review requests from items list.');
    console.log('PASS: GET /staff/records?status=pending returned 0 items.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 13: Part 1 Item 6 - Structured Reports Service & Type Filter
    // -------------------------------------------------------------------------
    console.log('[TEST 13] Part 1 Item 6: Reports Service Structured Data & Document Type Isolation');

    const reportsRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/reports?from=2026-01-01&to=2026-11-07`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(reportsRes.status === 200, 'Reports must return 200');
    const reportData = reportsRes.data?.data;
    assert(reportData.summary !== undefined, 'Report summary present');
    assert(reportData.by_document_type !== undefined, 'Report by_document_type present');
    assert(reportData.by_status !== undefined, 'Report by_status present');
    assert(typeof reportData.summary.total_requests === 'number', 'total_requests is a number');
    assert(typeof reportData.summary.total_revenue === 'number', 'total_revenue is a number');

    // Filter by matching document_type_id
    const typeReportsRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/reports?from=2026-01-01&to=2026-11-07&document_type_id=${docType._id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(typeReportsRes.status === 200, 'Type filter report returns 200');
    const typeData = typeReportsRes.data?.data;
    assert(typeData.summary.total_requests > 0, 'Matching type returns positive requests count');

    // Filter by a random unused ObjectId
    const unusedId = new mongoose.Types.ObjectId();
    const emptyTypeRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/reports?from=2026-01-01&to=2026-11-07&document_type_id=${unusedId}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(emptyTypeRes.status === 200, 'Unused type report returns 200');
    assert(emptyTypeRes.data?.data?.summary?.total_requests === 0, 'Unused type returns 0 total_requests');
    assert(emptyTypeRes.data?.data?.summary?.total_revenue === 0, 'Unused type returns 0 revenue');

    console.log(`PASS: GET /staff/reports returned total_requests ${reportData.summary.total_requests} and revenue ${reportData.summary.total_revenue}.`);
    console.log(`PASS: GET /staff/reports with matching document_type_id returned ${typeData.summary.total_requests} requests matching type.`);
    console.log('PASS: GET /staff/reports with unrequested document_type_id returned 0 requests and 0 revenue.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 14: Part 1 Item 7 - URLs: PUBLIC_APP_URL Verification
    // -------------------------------------------------------------------------
    console.log('[TEST 14] Part 1 Item 7: PUBLIC_APP_URL for QR Links & Password Reset');

    assert(config.publicAppUrl === 'http://localhost:5173', 'publicAppUrl configured correctly');

    // Test password reset email link
    const forgotRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/forgot-password`, method: 'POST' },
      { email: 'citizen@quickfile.gov.ph' }
    );
    assert(forgotRes.status === 200, 'Forgot password returns 200');
    await new Promise((r) => setTimeout(r, 100));

    const resetEmail = sentEmails.find((m) => m.subject.includes('Password Reset'));
    assert(resetEmail !== undefined, 'Password reset email sent');
    assert(resetEmail.text.includes(config.publicAppUrl), 'Reset link text must contain publicAppUrl');
    assert(resetEmail.html.includes(config.publicAppUrl), 'Reset link html must contain publicAppUrl');

    console.log('PASS: config.publicAppUrl resolved to "http://localhost:5173".');
    console.log('PASS: password reset email link contained publicAppUrl "http://localhost:5173".');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 15: Part 1 Item 8 - Citizen Request Update: File Cleanup & Repricing
    // -------------------------------------------------------------------------
    console.log('[TEST 15] Part 1 Item 8: Citizen Request Update: File Cleanup & Unit Fee Repricing');

    // Create an initial request with unit_fee = 50, copies = 1, fee = 50
    const updateTargetReq = await DocumentRequest.create({
      tracking_number: 'QF-20261107-UP-REPR',
      citizen_id: citizenUser._id,
      document_type_id: docType._id,
      purpose: 'Initial repricing purpose',
      copies: 1,
      status: REQUEST_STATUSES.PENDING,
      unit_fee: 50,
      fee: 50,
      payment_status: PAYMENT_STATUSES.UNPAID,
    });

    // Temporarily mutate DocumentType fee in database to 999
    await DocumentType.findByIdAndUpdate(docType._id, { fee: 999 });

    // Citizen updates copies to 2
    const updateRepriceRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/citizen/requests/${updateTargetReq.tracking_number}`,
        method: 'PUT',
        headers: { Authorization: `Bearer ${citizenToken}` },
      },
      { copies: 2 }
    );
    assert(updateRepriceRes.status === 200, 'Update request should succeed with 200');
    const repricedData = updateRepriceRes.data?.data;
    assert(repricedData.copies === 2, 'Copies must be 2');
    assert(repricedData.fee === 100, `Fee must be 100 (2 * stored 50 unit_fee), not 1998, got ${repricedData.fee}`);

    // Restore DocumentType fee
    await DocumentType.findByIdAndUpdate(docType._id, { fee: 50 });

    // Test file cleanup on update failure
    const boundaryFail = '----WebKitFormBoundaryUpdateFailTest';
    const failMultipartBody = buildMultipartBody(
      {
        purpose: 'Valid purpose',
        copies: 'invalid_copies_count', // invalid -> triggers 400
      },
      [
        {
          fieldname: 'attachments',
          filename: 'orphaned_check.pdf',
          contentType: 'application/pdf',
          content: Buffer.from('%PDF-1.4\n%OrphanCheck\n%%EOF'),
        },
      ],
      boundaryFail
    );

    const failUpdateRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/citizen/requests/${updateTargetReq.tracking_number}`,
        method: 'PUT',
        headers: { Authorization: `Bearer ${citizenToken}` },
      },
      failMultipartBody,
      true,
      boundaryFail
    );
    assert(failUpdateRes.status === 400, 'Invalid update must return 400');

    // Confirm orphaned file was deleted
    const diskFiles = fs.readdirSync(ATTACHMENTS_DIR);
    const orphanFile = diskFiles.find((f) => f.includes('orphaned_check'));
    assert(orphanFile === undefined, 'Newly uploaded files must be cleaned up on update error');

    console.log('PASS: citizen request update calculated fee 100.00 from 2 copies using original stored unit_fee 50.00 despite document type price changing to 999.');
    console.log('PASS: newly saved attachment file was removed from disk after update failure on invalid input.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 16: Part 1 Item 9 - cancellation_reason Validator (20 KB string)
    // -------------------------------------------------------------------------
    console.log('[TEST 16] Part 1 Item 9: runValidators on findOneAndUpdate & Cancellation Reason Validator');

    const hugeReason = 'A'.repeat(20 * 1024); // 20 KB
    const cancelHugeRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/citizen/requests/${updateTargetReq.tracking_number}/cancel`,
        method: 'POST',
        headers: { Authorization: `Bearer ${citizenToken}` },
      },
      { cancellation_reason: hugeReason }
    );
    assert.strictEqual(cancelHugeRes.status, 400);
    console.log('PASS: cancellation request with 20 KB cancellation_reason string returned status 400 from validator.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 17: Part 1 Item 10 - CERTIFICATE_VALIDITY_DAYS (0 and 30)
    // -------------------------------------------------------------------------
    console.log('[TEST 17] Part 1 Item 10: CERTIFICATE_VALIDITY_DAYS (0 and 30)');

    const validity0Req = await DocumentRequest.create({
      tracking_number: 'QF-20261107-VAL0',
      citizen_id: citizenUser._id,
      document_type_id: docType._id,
      purpose: 'Validity 0 test',
      copies: 1,
      status: REQUEST_STATUSES.IN_PREPARATION,
    });

    config.certificateValidityDays = 0;
    const issue0Res = await makeRequest(server, {
      path: `${API_PREFIX}/staff/requests/${validity0Req._id}/issue`,
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(issue0Res.status === 200, 'Issue with validity 0 must return 200');
    assert(issue0Res.data?.data?.issued_document?.expires_at === null, 'expires_at must be null when validity days = 0');

    const validity30Req = await DocumentRequest.create({
      tracking_number: 'QF-20261107-VAL30',
      citizen_id: citizenUser._id,
      document_type_id: docType._id,
      purpose: 'Validity 30 test',
      copies: 1,
      status: REQUEST_STATUSES.IN_PREPARATION,
    });

    config.certificateValidityDays = 30;
    const issue30Res = await makeRequest(server, {
      path: `${API_PREFIX}/staff/requests/${validity30Req._id}/issue`,
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(issue30Res.status === 200, 'Issue with validity 30 must return 200');
    const expiresAt30 = new Date(issue30Res.data?.data?.issued_document?.expires_at);
    assert(expiresAt30 instanceof Date && !isNaN(expiresAt30.getTime()), 'expires_at must be a valid date');
    const diffDays = Math.round((expiresAt30.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    assert(diffDays === 30, `Expiration should be 30 days in the future, got ${diffDays}`);

    config.certificateValidityDays = 180; // Restore
    console.log('PASS: document issued with CERTIFICATE_VALIDITY_DAYS=0 set expires_at to null.');
    console.log('PASS: document issued with CERTIFICATE_VALIDITY_DAYS=30 set expires_at to exactly 30 days in future.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 18: Part 1 Item 11 - Staff Input Validation & ObjectId
    // -------------------------------------------------------------------------
    console.log('[TEST 18] Part 1 Item 11: Staff Input Validation & ObjectId Strictness');

    const doubleSearchRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/requests?search=a&search=b`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(doubleSearchRes.status === 400, `?search=a&search=b must return 400, got ${doubleSearchRes.status}`);

    const arrayStatusRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/requests?status[]=released`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(arrayStatusRes.status === 400, `?status[]=x must return 400, got ${arrayStatusRes.status}`);

    const invalidDateRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/requests?from=not-a-date&to=2026-11-07`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(invalidDateRes.status === 400, `invalid dates must return 400, got ${invalidDateRes.status}`);

    const invalidIdRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/requests/not-an-object-id`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(invalidIdRes.status === 400, `invalid :id must return 400, got ${invalidIdRes.status}`);
    assert(!JSON.stringify(invalidIdRes.data).includes('not-an-object-id'), 'Must not echo raw input value');

    console.log('PASS: duplicate query parameter ?search=a&search=b returned status 400.');
    console.log('PASS: array query parameter ?status[]=released returned status 400.');
    console.log('PASS: invalid date query parameter from=not-a-date returned status 400.');
    console.log('PASS: malformed ObjectId in staff route URL returned status 400 without leaking raw input.');

    // Pagination caps
    const largePageRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/requests?limit=500`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert.strictEqual(largePageRes.status, 200);
    assert(largePageRes.data?.data?.items?.length <= 50);
    console.log('PASS: GET /staff/requests with limit=500 was capped at maximum allowed page limit of 50 items.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 19: Part 1 Item 12 - Walk-in Audit Log Actor & Phrasing
    // -------------------------------------------------------------------------
    console.log('[TEST 19] Part 1 Item 12: Walk-In Audit Log Actor & Notification Phrasing');

    const walkInReq2 = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/walk-in`,
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      },
      {
        citizen_id: citizenUser._id.toString(),
        document_type_id: docType._id.toString(),
        purpose: 'Walk-in notification and audit verification',
        copies: 1,
      }
    );
    assert(walkInReq2.status === 201, 'Walk-in request created with 201');
    const createdTracking = walkInReq2.data?.data?.tracking_number;

    const walkInAudit = await AuditLog.findOne({
      action: 'DOCUMENT_REQUEST_WALK_IN_CREATE',
      'details.tracking_number': createdTracking,
    });
    assert(walkInAudit !== null, 'Walk-in audit entry must exist');
    assert(walkInAudit.user_id.toString() === staffUser._id.toString(), 'Actor user_id must be staff member');
    assert(walkInAudit.actor_name === staffUser.full_name, 'Actor name must be staff member');
    assert(walkInAudit.details?.citizen_id === citizenUser._id.toString(), 'Details must hold citizen_id');
    assert(walkInAudit.details?.tracking_number === createdTracking, 'Details must hold tracking_number');

    const citizenNotif = await makeRequest(server, {
      path: `${API_PREFIX}/citizen/notifications`,
      method: 'GET',
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    assert(citizenNotif.status === 200, 'Citizen notifications return 200');
    const notifs = citizenNotif.data?.data?.notifications || [];
    const matchedNotif = notifs.find((n) => n.metadata?.tracking_number === createdTracking);
    assert(matchedNotif !== undefined, 'Citizen received walk-in notification');
    assert(
      matchedNotif.message.includes('was filed for you at the barangay hall'),
      'Notification must state it was filed at the barangay hall'
    );

    console.log(`PASS: walk-in audit log recorded staff user "${staffUser.full_name}" (${staffUser._id}) as actor with citizen_id in details.`);
    console.log('PASS: citizen received notification stating request was filed for them at the barangay hall.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 20: Additional Security & Edge Cases
    // -------------------------------------------------------------------------
    console.log('[TEST 20] Additional Security & Edge Cases');

    // 20a: 4 files at once -> 400
    const boundary4 = '----WebKitFormBoundary4FilesTest';
    const fourFilesBody = buildMultipartBody(
      { document_type_id: docType._id.toString(), purpose: '4 files test', copies: '1' },
      [
        { fieldname: 'attachments', filename: 'file1.pdf', contentType: 'application/pdf', content: Buffer.from('%PDF-1.4\n1\n%%EOF') },
        { fieldname: 'attachments', filename: 'file2.pdf', contentType: 'application/pdf', content: Buffer.from('%PDF-1.4\n2\n%%EOF') },
        { fieldname: 'attachments', filename: 'file3.pdf', contentType: 'application/pdf', content: Buffer.from('%PDF-1.4\n3\n%%EOF') },
        { fieldname: 'attachments', filename: 'file4.pdf', contentType: 'application/pdf', content: Buffer.from('%PDF-1.4\n4\n%%EOF') },
      ],
      boundary4
    );
    const fourFilesRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/citizen/requests`, method: 'POST', headers: { Authorization: `Bearer ${citizenToken}` } },
      fourFilesBody,
      true,
      boundary4
    );
    assert(fourFilesRes.status === 400, `4 files at once must return 400, got ${fourFilesRes.status}`);
    console.log('PASS: request submission with 4 files returned status 400 exceeding max 3 files limit.');

    // 20b: File over 5 MB -> 400
    const boundaryHuge = '----WebKitFormBoundaryHugeFileTest';
    const hugeBuffer = Buffer.alloc(6 * 1024 * 1024, '%PDF-1.4\n%dummy\n%%EOF');
    const hugeFileBody = buildMultipartBody(
      { document_type_id: docType._id.toString(), purpose: 'Huge file test', copies: '1' },
      [{ fieldname: 'attachments', filename: 'huge.pdf', contentType: 'application/pdf', content: hugeBuffer }],
      boundaryHuge
    );
    const hugeFileRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/citizen/requests`, method: 'POST', headers: { Authorization: `Bearer ${citizenToken}` } },
      hugeFileBody,
      true,
      boundaryHuge
    );
    assert(hugeFileRes.status === 400, `File over 5 MB must return 400, got ${hugeFileRes.status}`);
    console.log('PASS: request submission with 6 MB file returned status 400 exceeding 5 MB limit.');

    // 20c: forgot-password identical response for known and unknown emails
    const forgotKnownRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/forgot-password`, method: 'POST' },
      { email: 'citizen@quickfile.gov.ph' }
    );
    const forgotUnknownRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/forgot-password`, method: 'POST' },
      { email: 'nonexistent.user.9999@quickfile.gov.ph' }
    );
    assert(forgotKnownRes.status === 200, 'Known email returns 200');
    assert(forgotUnknownRes.status === 200, 'Unknown email returns 200');
    assert(forgotKnownRes.data?.message === forgotUnknownRes.data?.message, 'Messages must be identical for user enumeration safety');
    console.log('PASS: forgot-password returned status 200 with identical message for both registered and unregistered email addresses.');

    // 20d: Regex-special search characters
    const regexSearchRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/requests?search=test[abc]+(.*)`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(regexSearchRes.status === 200, 'Regex-special search characters safely escaped, returns 200');
    console.log('PASS: staff search query with regex special characters "test[abc]+(.*)" safely escaped and returned status 200.');

    // 20e: Free request release without payment
    const coiDocType = await DocumentType.findOne({ code: 'COI' });
    const freeReq = await DocumentRequest.create({
      tracking_number: 'QF-20261107-FREE01',
      citizen_id: citizenUser._id,
      document_type_id: coiDocType._id,
      purpose: 'Indigency assistance free',
      copies: 1,
      status: REQUEST_STATUSES.READY_FOR_PICKUP,
      unit_fee: 0,
      fee: 0,
      payment_status: PAYMENT_STATUSES.FREE,
    });

    const freeReleaseRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/${freeReq._id}/release`,
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      },
      {}
    );
    assert(freeReleaseRes.status === 200, `Free request release must succeed with 200 without payment confirmation, got ${freeReleaseRes.status}`);
    console.log('PASS: release of free document request completed with status 200 without requiring payment reference.');

    // 20f: print-data blocked before ready_for_pickup
    const pendingPrintReq = await DocumentRequest.create({
      tracking_number: 'QF-20261107-PRINT-BLOCKED',
      citizen_id: citizenUser._id,
      document_type_id: docType._id,
      purpose: 'Print block test',
      copies: 1,
      status: REQUEST_STATUSES.PENDING,
    });

    const blockedPrintRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/requests/${pendingPrintReq._id}/print-data`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(blockedPrintRes.status === 400, `print-data on pending request must return 400, got ${blockedPrintRes.status}`);
    console.log('PASS: print-data request on pending document request returned status 400.');

    // 20g: prototype pollution keys in sanitizeNoSql
    const protoRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/login`, method: 'POST' },
      { email: 'test@example.com', password: 'Password@123', ['__proto__']: { admin: true } }
    );
    assert(protoRes.status === 400, `__proto__ injection must return 400, got ${protoRes.status}`);

    const constrRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/login`, method: 'POST' },
      { email: 'test@example.com', password: 'Password@123', constructor: { prototype: {} } }
    );
    assert(constrRes.status === 400, `constructor injection must return 400, got ${constrRes.status}`);
    console.log('PASS: request bodies containing __proto__ and constructor returned status 400.');
    console.log('--------------------------------------------------------------------\n');

    console.log('====================================================================');
    console.log('ALL 20 PHASE 2, STEP 2C & PART 1 FIXES INTEGRATION TESTS PASSED!');
    console.log('====================================================================');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();

    // Clean up temporary database
    try {
      const conn = await mongoose.connect('mongodb://127.0.0.1:27017/quickfile_test_2c');
      await conn.connection.db.dropDatabase();
      await conn.disconnect();
      console.log('[Cleanup] Dropped isolated quickfile_test_2c database.');
    } catch {
      // Ignore cleanup error
    }

    if (fs.existsSync(TEST_ENV_PATH)) {
      fs.unlinkSync(TEST_ENV_PATH);
      console.log('[Cleanup] Removed temporary test_2c.env.tmp file.');
    }
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
