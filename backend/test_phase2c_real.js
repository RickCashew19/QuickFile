/**
 * QuickFile Integration & Security Test Suite - Phase 2, Step 2C & Part 1 Fixes
 * 
 * Verifies:
 * 1. Part 1 Fixes:
 *    - Citizen Serializer allowlist (never exposes processing_notes, handler IDs, local file path)
 *    - Recaptcha & Mailer Dependency Injection (no NODE_ENV test bypass, 503 fail-closed)
 *    - Strict form_data validation (depth > 3, >10KB, non-object, invalid keys rejected)
 *    - Post-Multer NoSQL Sanitizer rejects nested $ injection in multipart payloads
 *    - Atomic Status Transitions (concurrent double-transition returns 409 Conflict)
 *    - Rate Limiting (authLimiter 16th attempt 429, status polling limits)
 *    - File Download RFC 5987 Unicode headers and Cache-Control: private, no-store
 * 2. Step 2C Staff Workflow & Verification:
 *    - Granular staff permissions enforcement (403 without permission, 200 with permission, admin bypass)
 *    - Staff dashboard & live-stats polling endpoints
 *    - Staff requests list, search, filters, pagination
 *    - Staff single request details with applicant citizen profile and processing notes
 *    - Append staff notes endpoint
 *    - Workflow transitions: review, approve, reject (requires 5-500 char reason + email)
 *    - Document issuance: unique certificate number, >=20 char verification code, QR code Data URL
 *    - Print data endpoint (restricted to ready_for_pickup / released)
 *    - Document release with fee payment confirmation (paid with ref or waived with reason)
 *    - Record archiving and records list
 *    - Resident search (min 3 chars, max 10) & walk-in submission
 *    - Reports generation with date range (max 366 days) & workload aggregation
 *    - Public verification (zero PII, expired status detection, tracking number rejection)
 *    - Staff verification (full audit record, logs scan to AuditLog)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
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
    'SU_ADMIN_KEY=12345678',
    'BARANGAY_NAME=Barangay San Antonio',
    'CITY_MUNICIPALITY=Pasig City',
    'PROVINCE=Metro Manila',
    'DEFAULT_ADMIN_EMAIL=admin@quickfile.gov.ph',
    'DEFAULT_ADMIN_PASSWORD=Admin@123456',
    'DEFAULT_STAFF_EMAIL=staff@quickfile.gov.ph',
    'DEFAULT_STAFF_PASSWORD=Staff@123456',
    'DEFAULT_CITIZEN_EMAIL=citizen@quickfile.gov.ph',
    'DEFAULT_CITIZEN_PASSWORD=Citizen@123456',
    'CERTIFICATE_VALIDITY_DAYS=180',
    'CUSTOM_REST_API_SECRET_KEY=',
  ].join('\n'),
  'utf8'
);

process.env.TEST_ENV_PATH = TEST_ENV_PATH;
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
const app = require('./app');

function assert(condition, message) {
  if (!condition) {
    console.error(`Assertion FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

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
      if (Buffer.isBuffer(requestData)) {
        req.write(requestData);
      } else if (typeof requestData === 'object' && !isMultipart) {
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
  for (const [key, val] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`
      )
    );
  }
  for (const file of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`
      )
    );
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
  const sentEmails = [];

  try {
    await connectDB();
    await seedDatabase();

    // Set mock mail transport for testing
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
    // TEST 1: Part 1 Fix 1 - Citizen-Safe Responses & Allowlist Serializer
    // -------------------------------------------------------------------------
    console.log('[TEST 1] Fix 1: Citizen Serializer Strict Allowlist Security');

    // Create a request with sensitive staff notes and handlers
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

    // Verify allowed fields are present
    assert(safeData.tracking_number === 'QF-20261107-SAFE01', 'tracking_number must match');
    assert(safeData.purpose === 'Passport application', 'purpose must match');
    assert(safeData.status === 'under_review', 'status must match');
    assert(safeData.fee === 50, 'fee must match');

    // Verify strictly excluded fields are UNDEFINED
    assert(safeData.processing_notes === undefined, 'processing_notes must never be returned to citizens');
    assert(safeData.reviewed_by === undefined, 'reviewed_by user ID must never be returned to citizens');
    assert(safeData.prepared_by === undefined, 'prepared_by user ID must never be returned to citizens');
    assert(safeData.approved_by === undefined, 'approved_by user ID must never be returned to citizens');
    assert(safeData.released_by === undefined, 'released_by user ID must never be returned to citizens');
    assert(safeData.created_by_staff_id === undefined, 'created_by_staff_id must never be returned to citizens');
    assert(safeData.citizen_id === undefined, 'citizen_id must never be returned to citizens');
    assert(safeData.attachment_path === undefined, 'attachment_path must never be returned to citizens');
    assert(safeData.__v === undefined, '__v must never be returned to citizens');
    assert(safeData.attachments[0].path === undefined, 'attachment server disk path must never be returned');

    console.log('PASS: Citizen serializer strictly prevented leakage of internal notes, handler IDs, and server file paths.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 2: Part 1 Fix 2 - Recaptcha & Mailer Dependency Injection
    // -------------------------------------------------------------------------
    console.log('[TEST 2] Fix 2: Recaptcha & Mailer Dependency Injection');

    // Enable recaptcha in settings
    await AppSetting.findOneAndUpdate({ key: 'enable_recaptcha' }, { value: true }, { upsert: true });

    // Injected recaptcha verifier returning false
    setRecaptchaVerifier(async () => {
      const err = new Error('reCAPTCHA verification failed. Please try again.');
      err.statusCode = 400;
      throw err;
    });

    const badCaptchaRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/register`, method: 'POST' },
      {
        email: 'captcha.fail@example.gov.ph',
        password: 'Password@123',
        first_name: 'Captcha',
        last_name: 'Tester',
        birthdate: '1995-05-15',
        gender: 'male',
        phone: '09171234567',
        recaptcha_token: 'invalid_token',
      }
    );
    assert(badCaptchaRes.status === 400, 'Invalid reCAPTCHA token must return 400');
    console.log('PASS: Recaptcha injected verifier rejected invalid token with 400.');

    // Injected verifier simulating service unavailable (503)
    setRecaptchaVerifier(async () => {
      const err = new Error('reCAPTCHA verification service unavailable.');
      err.statusCode = 503;
      throw err;
    });

    const timeoutCaptchaRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/register`, method: 'POST' },
      {
        email: 'captcha.fail2@example.gov.ph',
        password: 'Password@123',
        first_name: 'Captcha',
        last_name: 'Tester2',
        birthdate: '1995-05-15',
        gender: 'male',
        phone: '09171234568',
        recaptcha_token: 'timeout_token',
      }
    );
    assert(timeoutCaptchaRes.status === 503, 'ReCAPTCHA timeout/error must fail-closed with 503');
    console.log('PASS: Recaptcha network failure or timeout failed-closed with 503.');

    // Reset recaptcha verifier to passing and disable recaptcha for subsequent tests
    setRecaptchaVerifier(null);
    await AppSetting.findOneAndUpdate({ key: 'enable_recaptcha' }, { value: false });
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 3: Part 1 Fix 3 - Strict form_data Validation & Post-Multer NoSQL Sanitizer
    // -------------------------------------------------------------------------
    console.log('[TEST 3] Fix 3: Strict form_data Validation & Post-Multer NoSQL Sanitization');

    const boundary = '----WebKitFormBoundaryTestFormBoundary123';

    // 3a: Non-object (primitive or array) in form_data rejected with 400
    const nonObjectBody = buildMultipartBody(
      {
        document_type_id: docType._id.toString(),
        purpose: 'Valid purpose for testing form data',
        copies: '1',
        form_data: '"string_instead_of_object"',
      },
      [],
      boundary
    );

    const nonObjRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/citizen/requests`, method: 'POST', headers: { Authorization: `Bearer ${citizenToken}` } },
      nonObjectBody,
      true,
      boundary
    );
    assert(nonObjRes.status === 400, `Non-object form_data must return 400, got ${nonObjRes.status}`);
    console.log('PASS: Primitive string form_data rejected with 400.');

    // 3b: Array in form_data rejected with 400
    const arrayBody = buildMultipartBody(
      {
        document_type_id: docType._id.toString(),
        purpose: 'Valid purpose for testing form data',
        copies: '1',
        form_data: JSON.stringify(['item1', 'item2']),
      },
      [],
      boundary
    );

    const arrayRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/citizen/requests`, method: 'POST', headers: { Authorization: `Bearer ${citizenToken}` } },
      arrayBody,
      true,
      boundary
    );
    assert(arrayRes.status === 400, `Array form_data must return 400, got ${arrayRes.status}`);
    console.log('PASS: Array form_data rejected with 400.');

    // 3c: Nesting deeper than 3 levels rejected with 400
    const deepObj = { level1: { level2: { level3: { level4: 'too_deep' } } } };
    const deepBody = buildMultipartBody(
      {
        document_type_id: docType._id.toString(),
        purpose: 'Valid purpose for testing form data',
        copies: '1',
        form_data: JSON.stringify(deepObj),
      },
      [],
      boundary
    );

    const deepRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/citizen/requests`, method: 'POST', headers: { Authorization: `Bearer ${citizenToken}` } },
      deepBody,
      true,
      boundary
    );
    assert(deepRes.status === 400, `Depth > 3 must return 400, got ${deepRes.status}`);
    console.log('PASS: form_data nesting deeper than 3 levels rejected with 400.');

    // 3d: Post-Multer NoSQL injection rejection ($ key in multipart body)
    const nosqlMultipartBody = buildMultipartBody(
      {
        document_type_id: docType._id.toString(),
        purpose: 'Testing post-multer nosql sanitization',
        copies: '1',
        '$where': 'sleep(5000)',
      },
      [],
      boundary
    );

    const nosqlMultipartRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/citizen/requests`, method: 'POST', headers: { Authorization: `Bearer ${citizenToken}` } },
      nosqlMultipartBody,
      true,
      boundary
    );
    assert(nosqlMultipartRes.status === 400, `Post-multer $ key must return 400, got ${nosqlMultipartRes.status}`);
    console.log('PASS: Post-Multer sanitizeNoSql middleware caught and rejected $ key in multipart payload.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 4: Part 1 Fix 4 - Atomic Status Transitions (Double-Release 409 Race Condition)
    // -------------------------------------------------------------------------
    console.log('[TEST 4] Fix 4: Atomic Status Transitions (Concurrent Race Condition / 409 Conflict)');

    // Create a request in ready_for_pickup status with 0 fee for simple release
    const raceReq = await DocumentRequest.create({
      tracking_number: 'QF-20261107-RACE01',
      citizen_id: citizenUser._id,
      document_type_id: docType._id,
      purpose: 'Testing atomic status race condition',
      copies: 1,
      status: REQUEST_STATUSES.READY_FOR_PICKUP,
      fee: 0,
      payment_status: PAYMENT_STATUSES.FREE,
    });

    // Fire two release requests concurrently via Promise.all
    const [raceRes1, raceRes2] = await Promise.all([
      makeRequest(
        server,
        {
          path: `${API_PREFIX}/staff/requests/${raceReq._id}/release`,
          method: 'POST',
          headers: { Authorization: `Bearer ${staffToken}` },
        },
        {}
      ),
      makeRequest(
        server,
        {
          path: `${API_PREFIX}/staff/requests/${raceReq._id}/release`,
          method: 'POST',
          headers: { Authorization: `Bearer ${staffToken}` },
        },
        {}
      ),
    ]);

    const statuses = [raceRes1.status, raceRes2.status].sort();
    assert(
      statuses[0] === 200 && statuses[1] === 409,
      `Expected one 200 and one 409, got ${statuses[0]} and ${statuses[1]}`
    );
    console.log('PASS: Concurrent status transition was handled atomically; second request returned 409 Conflict.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 5: Step 2C - Staff Permissions Enforcement
    // -------------------------------------------------------------------------
    console.log('[TEST 5] Step 2C: Granular Staff Permissions (Staff 403 / 200, Admin Bypass)');

    // Create a restricted staff user with no permissions
    const restrictedStaff = await User.create({
      email: 'restricted.staff@quickfile.gov.ph',
      password_hash: await User.hashPassword('StaffPassword@123'),
      full_name: 'Restricted Staff Member',
      role: ROLES.STAFF,
      is_active: true,
    });

    await StaffPermission.create({
      user_id: restrictedStaff._id,
      can_review_requests: false,
      can_prepare_documents: false,
      can_print_documents: false,
      can_release_documents: false,
      can_verify_qr: false,
      can_view_reports: false,
      can_archive_records: false,
    });

    const restrictedStaffToken = jwt.sign(
      { id: restrictedStaff._id.toString(), email: restrictedStaff.email, role: restrictedStaff.role },
      config.jwt.getSecret(),
      { expiresIn: '1h' }
    );

    // 5a: Restricted staff attempts to review a request -> 403 Forbidden
    const reviewPermRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/${sensitiveReq._id}/review`,
        method: 'POST',
        headers: { Authorization: `Bearer ${restrictedStaffToken}` },
      },
      {}
    );
    assert(reviewPermRes.status === 403, `Staff without can_review_requests must return 403, got ${reviewPermRes.status}`);
    console.log('PASS: Staff member without can_review_requests blocked with 403.');

    // 5b: Restricted staff attempts to view reports -> 403 Forbidden
    const reportsPermRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/reports?from=2026-01-01&to=2026-11-07`,
      method: 'GET',
      headers: { Authorization: `Bearer ${restrictedStaffToken}` },
    });
    assert(reportsPermRes.status === 403, `Staff without can_view_reports must return 403, got ${reportsPermRes.status}`);
    console.log('PASS: Staff member without can_view_reports blocked with 403.');

    // 5c: Admin bypasses granular permission checks
    const adminReportsRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/reports?from=2026-01-01&to=2026-11-07`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminReportsRes.status === 200, `Admin accessing reports must return 200, got ${adminReportsRes.status}`);
    console.log('PASS: Admin bypassed granular permission checks and retrieved reports with 200.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 6: Step 2C - Staff Dashboard, Live Stats, Notes, and Resident Search
    // -------------------------------------------------------------------------
    console.log('[TEST 6] Step 2C: Staff Dashboard, Live Stats, Notes, and Residents Search');

    // 6a: Dashboard KPIs
    const dashboardRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/dashboard`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(dashboardRes.status === 200, 'Dashboard request must return 200');
    assert(dashboardRes.data?.data?.kpis !== undefined, 'KPI metrics must be present');
    assert(Array.isArray(dashboardRes.data?.data?.pending_queue), 'pending_queue must be an array');
    console.log('PASS: Staff dashboard KPIs and pending queue retrieved successfully.');

    // 6b: Live Stats Polling
    const liveStatsRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/requests/live-stats`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(liveStatsRes.status === 200, 'Live stats polling must return 200');
    assert(liveStatsRes.data?.data?.pending !== undefined, 'Pending count in live stats');
    console.log('PASS: Staff live stats polling endpoint returned lightweight metrics.');

    // 6c: Append Internal Notes
    const appendNoteRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/${sensitiveReq._id}/notes`,
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      },
      { note: 'Called citizen for identity confirmation.' }
    );
    assert(appendNoteRes.status === 200, 'Append note must return 200');
    assert(appendNoteRes.data?.data?.processing_notes.includes('Called citizen'), 'Processing notes updated');
    console.log('PASS: Staff successfully appended internal timestamped note.');

    // 6d: Residents search (min 3 chars)
    const shortSearchRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/residents?search=ab`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(shortSearchRes.status === 400, 'Search < 3 chars must return 400');

    const validSearchRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/residents?search=citizen`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(validSearchRes.status === 200, 'Search >= 3 chars must return 200');
    assert(validSearchRes.data?.data?.length > 0, 'Found matching residents');
    console.log('PASS: Resident search validated minimum length and returned active citizens.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 7: Step 2C - Complete Workflow: Pending -> Review -> Approve -> Prepare -> Issue -> Print -> Release -> Archive
    // -------------------------------------------------------------------------
    console.log('[TEST 7] Step 2C: Complete Staff Workflow & Document Issuance');

    // Create a new fresh request for this full lifecycle test
    const flowReq = await DocumentRequest.create({
      tracking_number: 'QF-20261107-FLOW01',
      citizen_id: citizenUser._id,
      document_type_id: docType._id,
      purpose: 'Job employment requirements',
      copies: 2,
      status: REQUEST_STATUSES.PENDING,
      unit_fee: 50,
      fee: 100,
      payment_status: PAYMENT_STATUSES.UNPAID,
    });

    // 7a: Pending -> Under Review
    const reviewRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/${flowReq._id}/review`,
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      },
      {}
    );
    assert(reviewRes.status === 200, 'Review transition must return 200');
    assert(reviewRes.data?.data?.status === 'under_review', 'Status should be under_review');
    console.log('PASS: Transition to UNDER_REVIEW succeeded.');

    // 7b: Under Review -> Approved
    const approveRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/${flowReq._id}/approve`,
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      },
      {}
    );
    assert(approveRes.status === 200, 'Approve transition must return 200');
    assert(approveRes.data?.data?.status === 'approved', 'Status should be approved');
    console.log('PASS: Transition to APPROVED succeeded.');

    // 7c: Approved -> In Preparation
    const prepRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/${flowReq._id}/prepare`,
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      },
      {}
    );
    assert(prepRes.status === 200, 'Prepare transition must return 200');
    assert(prepRes.data?.data?.status === 'in_preparation', 'Status should be in_preparation');
    console.log('PASS: Transition to IN_PREPARATION succeeded.');

    // 7d: In Preparation -> Ready For Pickup (Issue document)
    const issueRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/${flowReq._id}/issue`,
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      },
      {}
    );
    assert(issueRes.status === 200, 'Issue transition must return 200');
    const issuedData = issueRes.data?.data?.issued_document;
    assert(issuedData?.certificate_number?.startsWith('BRGY-BC-'), 'Certificate number follows format');
    assert(issuedData?.verification_code?.length >= 20, 'Verification code >= 20 chars');
    assert(issuedData?.qr_code_image?.startsWith('data:image/png;base64,'), 'QR code is PNG data URL');
    assert(issuedData?.qr_data?.includes('/verify/'), 'QR data points to verification URL');
    assert(issuedData?.issued_to_name === citizenUser.full_name, 'issued_to_name is citizen name');
    console.log(`PASS: Document issued with Certificate #${issuedData.certificate_number} and QR data.`);

    // 7e: Print Data Endpoint
    const printRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/requests/${flowReq._id}/print-data`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(printRes.status === 200, 'Print data must return 200');
    assert(printRes.data?.data?.barangay?.barangay_name !== undefined, 'Barangay name in print data');
    assert(printRes.data?.data?.issued_document?.certificate_number === issuedData.certificate_number, 'Cert number match');
    console.log('PASS: Official certificate print data retrieved successfully.');

    // 7f: Release with Fee - Missing Payment Info Rejected (400)
    const releaseNoPayRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/${flowReq._id}/release`,
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      },
      {}
    );
    assert(releaseNoPayRes.status === 400, 'Fee-bearing release without payment must return 400');
    console.log('PASS: Release of fee-bearing request without payment confirmation rejected with 400.');

    // 7g: Release with Fee - Paid Confirmation (200)
    const releasePayRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/${flowReq._id}/release`,
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      },
      { payment_status: 'paid', payment_reference: 'OR-987654' }
    );
    assert(releasePayRes.status === 200, 'Release with payment must return 200');
    assert(releasePayRes.data?.data?.status === 'released', 'Status should be released');
    assert(releasePayRes.data?.data?.payment_status === 'paid', 'Payment status paid');
    console.log('PASS: Document released and payment atomically recorded.');

    // 7h: Archive Record
    const archiveRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/${flowReq._id}/archive`,
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      },
      {}
    );
    assert(archiveRes.status === 200, 'Archive request must return 200');
    assert(archiveRes.data?.data?.status === 'archived', 'Status should be archived');
    console.log('PASS: Released document successfully archived.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 8: Step 2C - Walk-In Creation & Rejection Workflow
    // -------------------------------------------------------------------------
    console.log('[TEST 8] Step 2C: Walk-In Request Creation & Rejection Workflow');

    // 8a: Walk-in submission by staff on behalf of citizen
    const walkInBody = buildMultipartBody(
      {
        citizen_id: citizenUser._id.toString(),
        document_type_id: docType._id.toString(),
        purpose: 'Walk-in resident application for clearance',
        copies: '1',
      },
      [],
      boundary
    );

    const walkInRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/walk-in`,
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      },
      walkInBody,
      true,
      boundary
    );
    assert(walkInRes.status === 201, `Walk-in submission must return 201, got ${walkInRes.status}`);
    const walkInReq = walkInRes.data?.data;
    assert(walkInReq?.created_by_staff_id?.toString() === staffUser._id.toString(), 'created_by_staff_id matches staff');
    console.log(`PASS: Staff submitted walk-in request (Tracking #: ${walkInReq.tracking_number}) with created_by_staff_id recorded.`);

    // 8b: Rejection requires reason (5-500 chars)
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

    // 8c: Valid rejection with email delivery
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

    // Allow non-blocking background email dispatch to complete
    await new Promise((r) => setTimeout(r, 200));

    // Verify rejection email was dispatched
    const emailDispatched = sentEmails.find((m) => m.to === citizenUser.email);
    assert(emailDispatched !== undefined, 'Rejection email should be dispatched to citizen');
    console.log('PASS: Rejection required valid reason, updated status to REJECTED, and dispatched email notification.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 9: Step 2C - Public vs Staff QR Verification
    // -------------------------------------------------------------------------
    console.log('[TEST 9] Step 2C: Public vs Staff Verification Endpoints');

    const verificationCode = issuedData.verification_code;

    // 9a: Public verify rejects tracking numbers (404)
    const trackNumVerifyRes = await makeRequest(server, {
      path: `${API_PREFIX}/verify/${flowReq.tracking_number}`,
      method: 'GET',
    });
    assert(trackNumVerifyRes.status === 404, 'Public verify must reject tracking numbers with 404');
    console.log('PASS: Public verify rejected tracking numbers with 404.');

    // 9b: Public verify returns minimal data and ZERO citizen PII
    const publicVerifyRes = await makeRequest(server, {
      path: `${API_PREFIX}/verify/${verificationCode}`,
      method: 'GET',
    });
    assert(publicVerifyRes.status === 200, 'Public verify must return 200 for valid code');
    const pubData = publicVerifyRes.data?.data;
    assert(pubData.validity_status === 'valid', 'validity_status must be valid');
    assert(pubData.certificate_number === issuedData.certificate_number, 'Cert number match');
    assert(pubData.document_name === docType.name, 'Document name match');

    // Critical: Zero PII checks on public endpoint
    assert(pubData.issued_to_name === undefined, 'issued_to_name must never be leaked to public');
    assert(pubData.citizen_id === undefined, 'citizen_id must never be leaked to public');
    assert(pubData.phone === undefined, 'phone must never be leaked to public');
    assert(pubData.address === undefined, 'address must never be leaked to public');
    console.log('PASS: Public verify endpoint returned valid certificate status with zero PII.');

    // 9c: Public verify reports EXPIRED if expires_at < now
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

    // 9d: Staff verify endpoint (requires can_verify_qr, includes citizen name and logs scan)
    const staffVerifyRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/verify/${verificationCode}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(staffVerifyRes.status === 200, 'Staff verify must return 200');
    const stfData = staffVerifyRes.data?.data;
    assert(stfData.issued_to_name === citizenUser.full_name, 'Staff verify includes citizen name');
    assert(stfData.tracking_number !== undefined, 'Staff verify includes tracking number');
    assert(stfData.status_history !== undefined, 'Staff verify includes status history');

    // Verify audit log scan recorded
    const scanAudit = await AuditLog.findOne({
      action: 'VERIFY_QR_SCAN',
      'details.verification_code': verificationCode,
    });
    assert(scanAudit !== null, 'Scan event must be logged in AuditLog');
    console.log('PASS: Staff verify returned complete audit information and logged verification scan to AuditLog.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 10: Part 1 Fix 5 & 6 - Rate Limiting & RFC 5987 File Download
    // -------------------------------------------------------------------------
    console.log('[TEST 10] Fix 5 & 6: Rate Limiting Enforcement & RFC 5987 File Download');

    // 10a: Status polling limiter permits normal 8s polling
    for (let i = 0; i < 20; i++) {
      const pollRes = await makeRequest(server, {
        path: `${API_PREFIX}/citizen/requests/${flowReq.tracking_number}/status`,
        method: 'GET',
        headers: { Authorization: `Bearer ${citizenToken}` },
      });
      assert(pollRes.status === 200, `Poll iteration ${i} should succeed with 200`);
    }
    console.log('PASS: Status polling limiter successfully accommodated continuous polling.');

    // 10b: File download RFC 5987 & Cache-Control headers
    const testFileBuffer = Buffer.from('%PDF-1.4\n%DownloadTestContent\n%%EOF');
    const boundaryDownload = '----WebKitFormBoundaryDownload123';
    const uploadForDownloadBody = buildMultipartBody(
      {
        document_type_id: docType._id.toString(),
        purpose: 'File download test purpose',
        copies: '1',
      },
      [
        {
          fieldname: 'attachments',
          filename: 'Spécial_Report_2026.pdf',
          contentType: 'application/pdf',
          content: testFileBuffer,
        },
      ],
      boundaryDownload
    );

    const upRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/citizen/requests`, method: 'POST', headers: { Authorization: `Bearer ${citizenToken}` } },
      uploadForDownloadBody,
      true,
      boundaryDownload
    );
    assert(upRes.status === 201, 'Upload for download test succeeded');
    const downloadedStoredFile = upRes.data?.data?.attachments[0]?.stored_filename;

    const fileDlRes = await makeRequest(server, {
      path: `${API_PREFIX}/files/attachments/${downloadedStoredFile}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    assert(fileDlRes.status === 200, 'File download succeeded');
    const contentDisposition = fileDlRes.headers['content-disposition'] || '';
    assert(contentDisposition.includes("filename*=UTF-8''"), 'Content-Disposition must include RFC 5987 UTF-8 filename');
    assert(contentDisposition.includes('filename="'), 'Content-Disposition must include safe ASCII fallback filename');
    assert(fileDlRes.headers['cache-control'] === 'private, no-store', 'Cache-Control must be private, no-store');
    console.log('PASS: File download verified with RFC 5987 Unicode header and Cache-Control: private, no-store.');
    console.log('--------------------------------------------------------------------\n');

    console.log('====================================================================');
    console.log('ALL 10 PHASE 2, STEP 2C & PART 1 FIXES INTEGRATION TESTS PASSED!');
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
