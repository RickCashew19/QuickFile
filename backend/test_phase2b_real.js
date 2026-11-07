/**
 * Comprehensive Phase 2, Step 2B Real Integration Test Suite
 * Tests All Fixes and Step 2B (Requests, Uploads, File Protection, Workflow)
 * Against isolated quickfile_test DB and temporary env file.
 * Never prints or leaks secrets.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const DYNAMIC_SU_ADMIN_KEY = `su_key_${crypto.randomBytes(8).toString('hex')}`;
const DYNAMIC_ADMIN_PASSWORD = `Adm!n_${crypto.randomBytes(8).toString('hex')}`;
const DYNAMIC_STAFF_PASSWORD = `St@ff_${crypto.randomBytes(8).toString('hex')}`;
const DYNAMIC_CITIZEN_PASSWORD = `C!tizen_${crypto.randomBytes(8).toString('hex')}`;

// Setup test-specific environment paths and database
const TEST_ENV_PATH = path.resolve(__dirname, 'test_2b.env.tmp');
const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/quickfile_test';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = TEST_MONGO_URI;
process.env.ENV_FILE = TEST_ENV_PATH;
process.env.SU_ADMIN_KEY = DYNAMIC_SU_ADMIN_KEY;
process.env.JWT_SECRET = 'quickfile_test_isolated_secret_key_2026_at_least_32_chars';
process.env.FRONTEND_URL = 'http://localhost:5173,https://portal.quickfile.gov.ph';
process.env.BARANGAY_NAME = 'Barangay 11';
process.env.CITY_MUNICIPALITY = 'Malaybalay';
process.env.PROVINCE = 'Bukidnon';
process.env.DEFAULT_ADMIN_PASSWORD = DYNAMIC_ADMIN_PASSWORD;
process.env.DEFAULT_STAFF_PASSWORD = DYNAMIC_STAFF_PASSWORD;
process.env.DEFAULT_CITIZEN_PASSWORD = DYNAMIC_CITIZEN_PASSWORD;
process.env.TRUST_PROXY = 'false';

// Write initial temporary env file for tests
fs.writeFileSync(
  TEST_ENV_PATH,
  [
    'PORT=5000',
    'NODE_ENV=test',
    'TRUST_PROXY=false',
    `MONGO_URI=${TEST_MONGO_URI}`,
    'JWT_SECRET=quickfile_test_isolated_secret_key_2026_at_least_32_chars',
    'FRONTEND_URL=http://localhost:5173,https://portal.quickfile.gov.ph',
    `SU_ADMIN_KEY=${DYNAMIC_SU_ADMIN_KEY}`,
    'BARANGAY_NAME=Barangay 11',
    'CITY_MUNICIPALITY=Malaybalay',
    'PROVINCE=Bukidnon',
    'DEFAULT_GOOGLE_CLIENT_ID=test-google-client-id',
    'DEFAULT_GOOGLE_CLIENT_SECRET=test-google-secret',
    'DEFAULT_RECAPTCHA_SITE_KEY=test-recaptcha-site-key',
    'DEFAULT_RECAPTCHA_SECRET_KEY=test-recaptcha-secret-key',
    'DEFAULT_SMS_GATEWAY_URL=test-sms-gateway-url',
    'DEFAULT_SMS_API_TOKEN=test-sms-api-token',
    `DEFAULT_ADMIN_PASSWORD=${DYNAMIC_ADMIN_PASSWORD}`,
    `DEFAULT_STAFF_PASSWORD=${DYNAMIC_STAFF_PASSWORD}`,
    `DEFAULT_CITIZEN_PASSWORD=${DYNAMIC_CITIZEN_PASSWORD}`,
    'DEFAULT_SMTP_HOST=test-smtp-host',
    'DEFAULT_SMTP_USER=test-smtp-user',
    'DEFAULT_REST_API_SECRET_KEY=test-rest-api-secret-key',
    'CUSTOM_GOOGLE_CLIENT_ID=',
    'CUSTOM_GOOGLE_CLIENT_SECRET=',
    'CUSTOM_SMS_API_TOKEN=',
  ].join('\n'),
  'utf8'
);

const app = require('./app');
const { connectDB } = require('./src/config/db');
const { seedDatabase } = require('./src/utils/seeder');
const { validateConfig, config } = require('./src/config');
const {
  User,
  CitizenProfile,
  DocumentType,
  DocumentRequest,
  StaffDetail,
  StaffPermission,
  Notification,
  PasswordReset,
  AppSetting,
  AuditLog,
} = require('./src/models');
const { API_PREFIX, ROLES, REQUEST_STATUSES } = require('./src/config/constants');
const authService = require('./src/modules/auth/auth.service');
const { transitionRequestStatus } = require('./src/modules/request/requestTransition');
const { ATTACHMENTS_DIR } = require('./src/utils/fileUpload');

function makeRequest(server, options, body = null, isMultipart = false, boundary = '') {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: '127.0.0.1',
      port,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        ...(isMultipart
          ? { 'Content-Type': `multipart/form-data; boundary=${boundary}` }
          : { 'Content-Type': 'application/json' }),
        ...(options.headers || {}),
      },
    };

    const req = http.request(reqOptions, (res) => {
      let data = [];
      res.on('data', (chunk) => data.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(data);
        const text = buffer.toString('utf8');
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed,
          rawBuffer: buffer,
        });
      });
    });

    req.on('error', reject);

    if (body) {
      if (Buffer.isBuffer(body)) {
        req.write(body);
      } else if (typeof body === 'string') {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
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

const assert = require('assert');

async function runTests() {
  console.log('====================================================================');
  console.log('STARTING PHASE 2, STEP 2B INTEGRATION & SECURITY TEST SUITE');
  console.log('====================================================================\n');

  await connectDB();
  await seedDatabase();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Fix 1 - Seeder / Config Invariants
    // -------------------------------------------------------------------------
    console.log('[TEST 1] Fix 1: Seeder/Config Password & Production Invariants');

    // 1a: Short password refused
    const origPass = config.seed.citizenPassword;
    try {
      config.seed.citizenPassword = 'short';
      let caught = false;
      try {
        await seedDatabase();
      } catch (err) {
        caught = true;
        assert(err.message.includes('shorter than 8 characters'), 'Message should indicate short password');
      }
      assert(caught, 'Seeder must reject password < 8 characters');
      console.log('PASS: Seeder refused password shorter than 8 characters.');
    } finally {
      config.seed.citizenPassword = origPass;
    }

    // 1b: Production short JWT secret & "change_me" rejection
    const origEnv = process.env.NODE_ENV;
    const origSecret = process.env.JWT_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'short_secret';
      let caught = false;
      try {
        validateConfig();
      } catch (err) {
        caught = true;
        assert(err.message.includes('at least 32 characters'), 'Message should require 32 chars');
      }
      assert(caught, 'Production must reject JWT secret < 32 chars');
      console.log('PASS: Production configuration rejected JWT_SECRET shorter than 32 characters.');

      // Test "change_me" prefix rejection in production
      process.env.JWT_SECRET = 'valid_secret_length_that_exceeds_32_characters_easily';
      const origBarangay = process.env.BARANGAY_NAME;
      process.env.BARANGAY_NAME = 'change_me_barangay';
      let caughtChangeMe = false;
      try {
        validateConfig();
      } catch (err) {
        caughtChangeMe = true;
        assert(err.message.includes('change_me'), 'Message should reject change_me');
      }
      assert(caughtChangeMe, 'Production must reject variables starting with change_me');
      console.log('PASS: Production configuration rejected required variable starting with "change_me".');
      process.env.BARANGAY_NAME = origBarangay;
    } finally {
      process.env.NODE_ENV = origEnv;
      process.env.JWT_SECRET = origSecret;
    }
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 2: Fix 2 - Google Login Hardening & Token Verifier Injection
    // -------------------------------------------------------------------------
    console.log('[TEST 2] Fix 2: Google Login Hardening (Citizen only, email_verified, no invented profile data)');

    await AppSetting.updateOne({ key: 'enable_google_login' }, { value: true });

    // 2a: Mock verifier injection: reject unverified email
    authService.setGoogleTokenVerifier(async () => ({
      sub: 'google-sub-unverified',
      email: 'unverified@example.com',
      email_verified: false,
      name: 'Unverified Citizen',
    }));

    const unverifiedRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/google`, method: 'POST' },
      { id_token: 'dummy-token' }
    );
    assert(unverifiedRes.status === 400, 'Unverified Google email should return 400');
    console.log('PASS: Google login rejected unverified email address.');

    // 2b: Never log in or link staff/admin through Google
    authService.setGoogleTokenVerifier(async () => ({
      sub: 'google-sub-admin',
      email: 'admin@quickfile.gov.ph',
      email_verified: true,
      name: 'Barangay Administrator',
    }));

    const adminGoogleRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/google`, method: 'POST' },
      { id_token: 'dummy-token' }
    );
    assert(adminGoogleRes.status === 403, 'Staff/Admin Google login must be rejected with 403');
    console.log('PASS: Google OAuth rejected login for admin account with 403.');

    // 2c: New Google citizen: birthdate and gender left empty, profile_complete: false
    authService.setGoogleTokenVerifier(async () => ({
      sub: 'google-sub-new-citizen-2026',
      email: 'google.new.resident@example.com',
      email_verified: true,
      name: 'Gabriela Silang',
      given_name: 'Gabriela',
      family_name: 'Silang',
    }));

    const newGoogleCitizenRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/google`, method: 'POST' },
      { id_token: 'dummy-token' }
    );
    assert(newGoogleCitizenRes.status === 200, 'New Google citizen registration should succeed');
    const createdProfile = newGoogleCitizenRes.data?.data?.profile;
    assert(createdProfile.birthdate === null, 'Birthdate must NOT be invented');
    assert(createdProfile.gender === '', 'Gender must NOT be invented');
    assert(createdProfile.profile_complete === false, 'profile_complete must be false');
    console.log('PASS: Google citizen profile created without invented birthdate/gender and with profile_complete: false.');

    // Clean up verifier
    authService.setGoogleTokenVerifier(null);
    await AppSetting.updateOne({ key: 'enable_google_login' }, { value: false });
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 3: Fix 4 - NoSQL Injection & Type Validation
    // -------------------------------------------------------------------------
    console.log('[TEST 3] Fix 4: NoSQL Injection & Type Validation');

    // 3a: Operator in object key ($gt)
    const nosqlOpRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/login`, method: 'POST' },
      { email: { $gt: '' }, password: 'SomePassword@123' }
    );
    assert(nosqlOpRes.status === 400, `NoSQL operator $gt should return 400, got ${nosqlOpRes.status}`);
    console.log('PASS: Body with {"email": {"$gt": ""}} returned 400.');

    // 3b: Key containing $where
    const nosqlWhereRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/login`, method: 'POST' },
      { email: 'citizen@quickfile.gov.ph', password: 'Password@123', $where: 'sleep(1000)' }
    );
    assert(nosqlWhereRes.status === 400, `$where key should return 400, got ${nosqlWhereRes.status}`);
    console.log('PASS: Body with $where key returned 400.');

    // 3c: Type validation (non-string types for string fields)
    const nonStringTypeRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/login`, method: 'POST' },
      { email: 12345, password: 'Password@123' }
    );
    assert(nonStringTypeRes.status === 400, 'Non-string email must return 400');
    console.log('PASS: Non-string input returned 400 validation error.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 4: Fix 5 - Profile Update Strict Allowlist
    // -------------------------------------------------------------------------
    console.log('[TEST 4] Fix 5: Profile Update Strict Allowlist (Ignored restricted fields)');

    // Login default citizen
    const citizenLoginRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/login`, method: 'POST' },
      { email: 'citizen@quickfile.gov.ph', password: DYNAMIC_CITIZEN_PASSWORD }
    );
    assert(citizenLoginRes.status === 200, 'Citizen login failed');
    const citizenToken = citizenLoginRes.data.data.access_token;
    const citizenUser = citizenLoginRes.data.data.user;

    // Send forbidden fields: verification_status, verified_at, verified_by, rejection_reason, user_id, role
    const updateForbiddenRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/citizen/profile`,
        method: 'PUT',
        headers: { Authorization: `Bearer ${citizenToken}` },
      },
      {
        occupation: 'Senior Research Analyst',
        verification_status: 'verified_hacked',
        verified_at: '2099-01-01',
        verified_by: citizenUser._id,
        rejection_reason: 'Tampered rejection',
        user_id: '6aeeb4b818046d7f93c5cd4c',
        role: 'admin',
      }
    );
    assert(updateForbiddenRes.status === 200, 'Profile update should return 200');

    // Verify database state: forbidden fields were strictly ignored
    const reloadedProfile = await CitizenProfile.findOne({ user_id: citizenUser._id });
    const reloadedUser = await User.findById(citizenUser._id);

    assert(reloadedProfile.occupation === 'Senior Research Analyst', 'Allowed field occupation updated');
    assert(reloadedProfile.verification_status !== 'verified_hacked', 'verification_status was NOT tampered');
    assert(reloadedUser.role === ROLES.CITIZEN, 'User role was NOT tampered');
    assert(reloadedProfile.user_id.toString() === citizenUser._id.toString(), 'user_id was NOT tampered');
    console.log('PASS: Profile update strictly ignored restricted fields (verification_status, role, user_id).');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 5: Fix 6 - Password Reset Token Invalidation (password_changed_at)
    // -------------------------------------------------------------------------
    console.log('[TEST 5] Fix 6: Password Reset Token Invalidation (password_changed_at)');

    // Generate a fresh citizen token
    const tokenBeforeReset = citizenToken;

    // Request password reset and execute it
    const crypto = require('crypto');
    const testRawToken = 'test_token_invalidation_hex_value_12345';
    const testTokenHash = crypto.createHash('sha256').update(testRawToken).digest('hex');

    await PasswordReset.create({
      user_id: citizenUser._id,
      email: citizenUser.email,
      token_hash: testTokenHash,
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
      used: false,
    });

    // Short delay to ensure timestamp separation
    await new Promise((r) => setTimeout(r, 1100));

    // Reset password
    const resetRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/reset-password`, method: 'POST' },
      { token: testRawToken, new_password: 'UpdatedCitizenPassword@2026' }
    );
    assert(resetRes.status === 200, 'Password reset should succeed');

    // Old token used after password reset must be REJECTED with 401
    const oldTokenRes = await makeRequest(server, {
      path: `${API_PREFIX}/citizen/profile`,
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenBeforeReset}` },
    });
    assert(
      oldTokenRes.status === 401,
      `Token issued before password change should return 401, got ${oldTokenRes.status}`
    );
    assert(oldTokenRes.data?.code === 'TOKEN_INVALIDATED', 'Error code should be TOKEN_INVALIDATED');
    console.log('PASS: JWT issued before password change was rejected with 401 TOKEN_INVALIDATED.');

    // Login with new password to get active token
    const newLoginRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/login`, method: 'POST' },
      { email: citizenUser.email, password: 'UpdatedCitizenPassword@2026' }
    );
    assert(newLoginRes.status === 200, 'Login with new password succeeded');
    const activeCitizenToken = newLoginRes.data.data.access_token;
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 6: Step 2B.A - Status Workflow Transition Graph Enforcement
    // -------------------------------------------------------------------------
    console.log('[TEST 6] Step 2B.A: Status Workflow Transitions (Valid transitions & Invalid jumps)');

    const dummyDocType = await DocumentType.findOne({ is_active: true });
    const testRequest = await DocumentRequest.create({
      tracking_number: 'QF-20261107-WFTEST',
      citizen_id: citizenUser._id,
      document_type_id: dummyDocType._id,
      purpose: 'Testing workflow transitions',
      copies: 1,
      status: REQUEST_STATUSES.PENDING,
      fee: 50,
    });

    const adminUser = await User.findOne({ role: ROLES.ADMIN });

    // 6a: Invalid jump: pending -> released (must be rejected with 400)
    let caughtInvalidJump = false;
    try {
      await transitionRequestStatus({
        request: testRequest,
        newStatus: REQUEST_STATUSES.RELEASED,
        actorUser: adminUser,
      });
    } catch (err) {
      caughtInvalidJump = true;
      assert(err.statusCode === 400, 'Invalid transition must return 400');
    }
    assert(caughtInvalidJump, 'transitionRequestStatus must reject invalid jumps');
    console.log('PASS: Invalid status jump (pending -> released) correctly rejected with 400.');

    // 6b: Valid transition: pending -> under_review
    await transitionRequestStatus({
      request: testRequest,
      newStatus: REQUEST_STATUSES.UNDER_REVIEW,
      actorUser: adminUser,
    });
    assert(testRequest.status === REQUEST_STATUSES.UNDER_REVIEW, 'Status should be under_review');
    assert(testRequest.reviewed_by.toString() === adminUser._id.toString(), 'reviewed_by set');
    console.log('PASS: Valid status transition (pending -> under_review) succeeded and updated actor stamp.');

    // Clean up test request
    await DocumentRequest.deleteOne({ _id: testRequest._id });
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 7: Step 2B.B & C - Document Request Submission, Magic Bytes & Server Fee
    // -------------------------------------------------------------------------
    console.log('[TEST 7] Step 2B.B & C: Request Submission, Magic Bytes Validation & Server-Calculated Fee');

    // 7a: Missing token returns 401
    const unauthReqRes = await makeRequest(server, {
      path: `${API_PREFIX}/citizen/requests`,
      method: 'POST',
    });
    assert(unauthReqRes.status === 401, 'Missing token should return 401');
    console.log('PASS: Unauthenticated request returned 401.');

    // 7b: Wrong role returns 403 (Admin hitting citizen request endpoint)
    const adminLoginRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/login`, method: 'POST' },
      { email: 'admin@quickfile.gov.ph', password: DYNAMIC_ADMIN_PASSWORD }
    );
    const adminToken = adminLoginRes.data.data.access_token;

    const wrongRoleRes = await makeRequest(server, {
      path: `${API_PREFIX}/citizen/requests`,
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(wrongRoleRes.status === 403, 'Admin hitting citizen endpoint should return 403');
    console.log('PASS: Admin role rejected from citizen request route with 403.');

    // 7c: Upload rejection of fake file (e.g. .exe bytes renamed to .pdf)
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const fakeExeBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00FakeWindowsExecutableHeader');

    const fakeFileBody = buildMultipartBody(
      {
        document_type_id: dummyDocType._id.toString(),
        purpose: 'Attempting malicious upload',
        copies: '1',
      },
      [
        {
          fieldname: 'attachments',
          filename: 'disguised_virus.pdf',
          contentType: 'application/pdf',
          content: fakeExeBuffer,
        },
      ],
      boundary
    );

    const fakeUploadRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/citizen/requests`,
        method: 'POST',
        headers: { Authorization: `Bearer ${activeCitizenToken}` },
      },
      fakeFileBody,
      true,
      boundary
    );
    assert(fakeUploadRes.status === 400, `Fake file must return 400, got ${fakeUploadRes.status}`);
    console.log(`PASS: Fake file (.exe disguised as .pdf) rejected via magic bytes check: "${fakeUploadRes.data?.message}"`);

    // 7d: Successful submission with valid PDF and JPG (Client attempts to spoof fee: $0, server enforces doc fee)
    const validPdfBuffer = Buffer.from('%PDF-1.4\n%ValidPDFContent\n%%EOF');
    const validJpgBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

    const validSubmissionBody = buildMultipartBody(
      {
        document_type_id: dummyDocType._id.toString(),
        purpose: 'Employment application requirements',
        copies: '2',
        fee: '0', // Attempted client fee spoofing
        payment_status: 'paid', // Attempted client payment status spoofing
      },
      [
        {
          fieldname: 'attachments',
          filename: 'valid_id.pdf',
          contentType: 'application/pdf',
          content: validPdfBuffer,
        },
        {
          fieldname: 'attachments',
          filename: 'valid_photo.jpg',
          contentType: 'image/jpeg',
          content: validJpgBuffer,
        },
      ],
      boundary
    );

    const submitRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/citizen/requests`,
        method: 'POST',
        headers: { Authorization: `Bearer ${activeCitizenToken}` },
      },
      validSubmissionBody,
      true,
      boundary
    );
    assert(submitRes.status === 201, `Valid submission failed with status ${submitRes.status}`);

    const createdReq = submitRes.data?.data;
    assert(createdReq?.tracking_number?.startsWith('QF-'), 'Tracking number must follow QF-YYYYMMDD-XXXXXX');
    assert(createdReq?.copies === 2, 'Copies must be 2');

    // Server-derived fee: docType.fee (50) * 2 = 100, payment_status: unpaid
    const expectedFee = (dummyDocType.fee || 0) * 2;
    assert(createdReq?.fee === expectedFee, `Fee must be calculated on server! Expected ${expectedFee}, got ${createdReq?.fee}`);
    assert(createdReq?.payment_status === 'unpaid', 'Payment status must be unpaid (server controlled)');

    // Attachments consistency
    assert(createdReq?.attachments?.length === 2, 'Must have 2 attachments');
    assert(createdReq?.attachments[0]?.original_name === 'valid_id.pdf', 'attachments must contain primary file');
    assert(createdReq?.attachment_path === undefined, 'attachment_path must never be returned to citizens (Fix 1)');
    assert(createdReq?.processing_notes === undefined, 'processing_notes must never be returned to citizens (Fix 1)');

    // Check files actually exist on disk with random filenames
    for (const att of createdReq.attachments) {
      const diskPath = path.join(ATTACHMENTS_DIR, att.stored_filename);
      assert(fs.existsSync(diskPath), `Stored file ${att.stored_filename} must exist on disk`);
      assert(att.stored_filename !== att.original_name, 'Stored filename must be randomized, not original');
    }
    console.log(`PASS: Request created with tracking number "${createdReq.tracking_number}" and server-enforced fee (${createdReq.fee}).`);
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 8: Step 2B.B - Requests List, Get, Status Polling, Update & Cancel
    // -------------------------------------------------------------------------
    console.log('[TEST 8] Step 2B.B: List, Status Polling, Cross-Citizen 404, Update, and Cancel');

    const trackingNumber = createdReq.tracking_number;

    // 8a: GET /citizen/requests (paginated)
    const listRes = await makeRequest(server, {
      path: `${API_PREFIX}/citizen/requests`,
      method: 'GET',
      headers: { Authorization: `Bearer ${activeCitizenToken}` },
    });
    assert(listRes.status === 200, 'List requests should succeed');
    assert(Array.isArray(listRes.data?.data?.requests), 'requests should be array');
    assert(listRes.data?.data?.pagination?.total >= 1, 'Total pagination count >= 1');
    console.log(`PASS: Retrieved paginated requests list (Total: ${listRes.data?.data?.pagination?.total}).`);

    // 8b: GET /citizen/requests/:trackingNumber (owner succeeds)
    const getOwnerRes = await makeRequest(server, {
      path: `${API_PREFIX}/citizen/requests/${trackingNumber}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${activeCitizenToken}` },
    });
    assert(getOwnerRes.status === 200, 'Owner get request should succeed');
    console.log('PASS: Owner successfully retrieved request details.');

    // 8c: Cross-Citizen Request Isolation: Another citizen gets 404!
    const anotherCitizen = await User.create({
      email: 'another.citizen@example.gov.ph',
      password_hash: await User.hashPassword('CitizenPassword@123'),
      full_name: 'Juan Another Citizen',
      role: ROLES.CITIZEN,
      is_active: true,
    });
    const anotherToken = jwt.sign(
      { id: anotherCitizen._id.toString(), email: anotherCitizen.email, role: anotherCitizen.role },
      config.jwt.getSecret(),
      { expiresIn: '1h' }
    );

    const crossCitizenReqRes = await makeRequest(server, {
      path: `${API_PREFIX}/citizen/requests/${trackingNumber}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${anotherToken}` },
    });
    assert(
      crossCitizenReqRes.status === 404,
      `Cross-citizen request access must return 404, got ${crossCitizenReqRes.status}`
    );
    console.log('PASS: Another citizen requesting document request returned 404.');

    // 8d: Lightweight status polling endpoint
    const statusPollingRes = await makeRequest(server, {
      path: `${API_PREFIX}/citizen/requests/${trackingNumber}/status`,
      method: 'GET',
      headers: { Authorization: `Bearer ${activeCitizenToken}` },
    });
    assert(statusPollingRes.status === 200, 'Status polling should succeed');
    assert(statusPollingRes.data?.data?.status === 'pending', 'Status should be pending');
    assert(statusPollingRes.data?.data?.tracking_number === trackingNumber, 'Tracking number match');
    console.log(`PASS: Status polling endpoint returned lightweight status: "${statusPollingRes.data?.data?.status}".`);

    // 8e: PUT /citizen/requests/:trackingNumber (update pending request)
    const updateBody = buildMultipartBody(
      {
        purpose: 'Updated employment requirements',
        copies: '3',
      },
      [],
      boundary
    );

    const updateReqRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/citizen/requests/${trackingNumber}`,
        method: 'PUT',
        headers: { Authorization: `Bearer ${activeCitizenToken}` },
      },
      updateBody,
      true,
      boundary
    );
    assert(updateReqRes.status === 200, `Update request failed with status ${updateReqRes.status}`);
    assert(updateReqRes.data?.data?.copies === 3, 'Copies updated to 3');
    assert(updateReqRes.data?.data?.fee === (dummyDocType.fee || 0) * 3, 'Fee recalculated for 3 copies');
    console.log('PASS: Pending request updated successfully with recalculated fee.');

    // 8f: POST /citizen/requests/:trackingNumber/cancel
    const cancelRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/citizen/requests/${trackingNumber}/cancel`,
        method: 'POST',
        headers: { Authorization: `Bearer ${activeCitizenToken}` },
      },
      { cancellation_reason: 'No longer needed' }
    );
    assert(cancelRes.status === 200, `Cancel request failed with status ${cancelRes.status}`);
    assert(cancelRes.data?.data?.status === 'cancelled', 'Request status should now be cancelled');
    console.log('PASS: Pending request cancelled successfully.');

    // 8g: Attempting to edit or cancel a non-pending request must fail with 400
    const editCancelledRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/citizen/requests/${trackingNumber}`,
        method: 'PUT',
        headers: { Authorization: `Bearer ${activeCitizenToken}` },
      },
      updateBody,
      true,
      boundary
    );
    assert(editCancelledRes.status === 400, 'Editing non-pending request must return 400');
    console.log(`PASS: Editing non-pending request rejected with 400: "${editCancelledRes.data?.message}"`);
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 9: Step 2B.D - Protected File Endpoint & Security Headers
    // -------------------------------------------------------------------------
    console.log('[TEST 9] Step 2B.D: Protected File Endpoint & Security');

    const storedFilename = createdReq.attachments[0].stored_filename;

    // 9a: Path traversal attempt (e.g. ../../) rejected with 400
    const traversalRes = await makeRequest(server, {
      path: `${API_PREFIX}/files/attachments/..%2F..%2Fetc%2Fpasswd`,
      method: 'GET',
      headers: { Authorization: `Bearer ${activeCitizenToken}` },
    });
    assert(traversalRes.status === 400, `Path traversal must return 400, got ${traversalRes.status}`);
    console.log('PASS: Path traversal attempt on file endpoint blocked with 400.');

    // 9b: Owner citizen successfully downloads file (with secure headers)
    const downloadOwnerRes = await makeRequest(server, {
      path: `${API_PREFIX}/files/attachments/${storedFilename}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${activeCitizenToken}` },
    });
    assert(downloadOwnerRes.status === 200, `Owner download should succeed, got ${downloadOwnerRes.status}`);
    assert(downloadOwnerRes.headers['x-content-type-options'] === 'nosniff', 'nosniff header must be present');
    assert(downloadOwnerRes.headers['content-disposition']?.includes('inline; filename='), 'Content-Disposition must be safe');
    console.log('PASS: Owner downloaded file with nosniff and safe Content-Disposition.');

    // 9c: Another citizen accessing this file gets 404
    const downloadOtherRes = await makeRequest(server, {
      path: `${API_PREFIX}/files/attachments/${storedFilename}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${anotherToken}` },
    });
    assert(downloadOtherRes.status === 404, `Cross-citizen file download must return 404, got ${downloadOtherRes.status}`);
    console.log('PASS: Non-owner citizen accessing attachment returned 404.');

    // 9d: Staff with can_review_requests downloads file (200)
    const staffUser = await User.findOne({ role: ROLES.STAFF });
    const staffLoginRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/login`, method: 'POST' },
      { email: staffUser.email, password: DYNAMIC_STAFF_PASSWORD }
    );
    const staffToken = staffLoginRes.data.data.access_token;

    const staffDownloadRes = await makeRequest(server, {
      path: `${API_PREFIX}/files/attachments/${storedFilename}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(staffDownloadRes.status === 200, 'Authorized staff download should succeed');
    console.log('PASS: Staff with can_review_requests successfully accessed attachment.');

    // 9e: Staff WITHOUT can_review_requests gets 403
    await StaffPermission.updateOne({ user_id: staffUser._id }, { can_review_requests: false });
    const staffBlockedRes = await makeRequest(server, {
      path: `${API_PREFIX}/files/attachments/${storedFilename}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(staffBlockedRes.status === 403, `Staff without permission should get 403, got ${staffBlockedRes.status}`);
    console.log('PASS: Staff without can_review_requests blocked with 403.');

    // Restore permission
    await StaffPermission.updateOne({ user_id: staffUser._id }, { can_review_requests: true });

    // 9f: Admin downloads file (200)
    const adminDownloadRes = await makeRequest(server, {
      path: `${API_PREFIX}/files/attachments/${storedFilename}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminDownloadRes.status === 200, 'Admin download should succeed');
    console.log('PASS: Admin successfully downloaded attachment.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 10: File Cleanup After Failed Request
    // -------------------------------------------------------------------------
    console.log('[TEST 10] Rollback: File Cleanup on Request Failure');

    // Submit request with an invalid/non-existent document type ID after files are saved
    const nonExistentDocTypeId = new mongoose.Types.ObjectId();
    const rollbackBody = buildMultipartBody(
      {
        document_type_id: nonExistentDocTypeId.toString(),
        purpose: 'Testing rollback cleanup',
        copies: '1',
      },
      [
        {
          fieldname: 'attachments',
          filename: 'rollback_test.pdf',
          contentType: 'application/pdf',
          content: validPdfBuffer,
        },
      ],
      boundary
    );

    const beforeFiles = fs.readdirSync(ATTACHMENTS_DIR);

    const failedReqRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/citizen/requests`,
        method: 'POST',
        headers: { Authorization: `Bearer ${activeCitizenToken}` },
      },
      rollbackBody,
      true,
      boundary
    );
    assert(failedReqRes.status === 400, 'Invalid document type must fail with 400');

    const afterFiles = fs.readdirSync(ATTACHMENTS_DIR);
    assert(
      beforeFiles.length === afterFiles.length,
      `No orphan files should remain after failed request! Before: ${beforeFiles.length}, After: ${afterFiles.length}`
    );
    console.log('PASS: File cleanup verified: no orphaned files left after request failure.');

    // -------------------------------------------------------------------------
    // TEST 11: Body Limit (Section C) - 20 KB Validator Rejection & 150 KB 413
    // -------------------------------------------------------------------------
    console.log('[TEST 11] Section C: Body Limit (20 KB cancellation_reason & 150 KB Payload)');

    const cancelTestReq = await DocumentRequest.create({
      tracking_number: 'QF-20261107-CANCEL-TEST',
      citizen_id: citizenUser._id,
      document_type_id: dummyDocType._id,
      purpose: 'Testing cancellation validator length check',
      copies: 1,
      unit_fee: 50.0,
      fee: 50.0,
      payment_status: 'unpaid',
      status: REQUEST_STATUSES.PENDING,
    });

    const reason20kb = 'C'.repeat(20 * 1024);
    const cancel20kbRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/citizen/requests/${cancelTestReq.tracking_number}/cancel`,
        method: 'POST',
        headers: { Authorization: `Bearer ${activeCitizenToken}` },
      },
      { cancellation_reason: reason20kb }
    );
    assert.strictEqual(cancel20kbRes.status, 400);
    assert(cancel20kbRes.data?.message?.includes('500 characters'), `Expected 500 characters error, got: ${cancel20kbRes.data?.message}`);
    console.log('PASS: 20 KB cancellation_reason string accepted by body parser and rejected by validator with status 400.');

    const huge150kbBody = { dummy: 'X'.repeat(150 * 1024) };
    const payload150kbRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/citizen/requests/${cancelTestReq.tracking_number}/cancel`,
        method: 'POST',
        headers: { Authorization: `Bearer ${activeCitizenToken}` },
      },
      huge150kbBody
    );
    assert.strictEqual(payload150kbRes.status, 413);
    assert.strictEqual(payload150kbRes.data?.success, false);
    assert(!('stack' in (payload150kbRes.data || {})));
    console.log('PASS: 150 KB request body rejected by body parser with status 413 and no stack trace in response.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 12: Citizen Request Edit - Derive Missing unit_fee (Section D.2)
    // -------------------------------------------------------------------------
    console.log('[TEST 12] Section D.2: Request Edit Derives Missing unit_fee from fee / copies');
    const legacyReq = await DocumentRequest.create({
      tracking_number: 'QF-20261107-DERIVE-FEE',
      citizen_id: citizenUser._id,
      document_type_id: dummyDocType._id,
      purpose: 'Legacy fee derivation test',
      copies: 2,
      unit_fee: 0,
      fee: 100.0,
      payment_status: 'unpaid',
      status: REQUEST_STATUSES.PENDING,
    });

    const editLegacyRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/citizen/requests/${legacyReq.tracking_number}`,
        method: 'PUT',
        headers: { Authorization: `Bearer ${activeCitizenToken}` },
      },
      { copies: 4 }
    );
    assert.strictEqual(editLegacyRes.status, 200);
    assert.strictEqual(editLegacyRes.data?.data?.unit_fee, 50.0);
    assert.strictEqual(editLegacyRes.data?.data?.fee, 200.0);
    console.log('PASS: request edit derived unit_fee 50.00 from fee 100.00 and copies 2 when stored unit_fee was 0.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 13: High-Frequency Polling (Section G.4) - 130 Citizen Status Polls
    // -------------------------------------------------------------------------
    console.log('[TEST 13] Section G.4: High-Frequency Polling (130 Citizen Status Polls with no 429)');
    let pollFailures = 0;
    for (let p = 1; p <= 130; p++) {
      const pollRes = await makeRequest(server, {
        path: `${API_PREFIX}/citizen/requests/${trackingNumber}/status`,
        method: 'GET',
        headers: { Authorization: `Bearer ${activeCitizenToken}` },
      });
      if (pollRes.status !== 200) {
        pollFailures++;
      }
    }
    assert.strictEqual(pollFailures, 0);
    console.log('PASS: 130 consecutive citizen status polling requests completed with status 200 and zero 429s.');
    console.log('--------------------------------------------------------------------\n');
    console.log('--------------------------------------------------------------------\n');

    console.log('====================================================================');
    console.log('ALL 13 STEP 2B & FIXES INTEGRATION TESTS PASSED SUCCESSFULLY.');
    console.log('====================================================================');
  } finally {
    server.close();

    // Clean up files in attachments directory created during test
    try {
      const files = fs.readdirSync(ATTACHMENTS_DIR);
      for (const f of files) {
        if (f !== '.gitkeep') {
          fs.unlinkSync(path.join(ATTACHMENTS_DIR, f));
        }
      }
    } catch {}

    try {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
      console.log('[Cleanup] Dropped isolated quickfile_test database.');
    } catch {}

    if (fs.existsSync(TEST_ENV_PATH)) {
      fs.unlinkSync(TEST_ENV_PATH);
      console.log('[Cleanup] Removed temporary test_2b.env.tmp file.');
    }

    // process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
