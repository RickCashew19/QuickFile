/**
 * Comprehensive Phase 2, Step 2A Real Integration Test Suite
 * Tests Carry-Over Fixes and all Step 2A endpoints against isolated quickfile_test DB
 * Never logs or prints secrets.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

// Dynamic test credentials generated at runtime (never matches real .env)
const DYNAMIC_SU_ADMIN_KEY = `su_key_${crypto.randomBytes(8).toString('hex')}`;
const DYNAMIC_ADMIN_PASSWORD = `Adm!n_${crypto.randomBytes(8).toString('hex')}`;
const DYNAMIC_STAFF_PASSWORD = `St@ff_${crypto.randomBytes(8).toString('hex')}`;
const DYNAMIC_CITIZEN_PASSWORD = `C!tizen_${crypto.randomBytes(8).toString('hex')}`;

// Setup test-specific environment paths and database
const TEST_ENV_PATH = path.resolve(__dirname, 'test_2a.env.tmp');
const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/quickfile_test';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = TEST_MONGO_URI;
process.env.TEST_ENV_PATH = TEST_ENV_PATH;
process.env.SU_ADMIN_KEY = DYNAMIC_SU_ADMIN_KEY;
process.env.JWT_SECRET = 'quickfile_test_isolated_secret_key_2026';
process.env.FRONTEND_URL = 'http://localhost:5173,https://portal.quickfile.gov.ph';
process.env.BARANGAY_NAME = 'Barangay 11';
process.env.CITY_MUNICIPALITY = 'Malaybalay';
process.env.PROVINCE = 'Bukidnon';
process.env.DEFAULT_ADMIN_PASSWORD = DYNAMIC_ADMIN_PASSWORD;
process.env.DEFAULT_STAFF_PASSWORD = DYNAMIC_STAFF_PASSWORD;
process.env.DEFAULT_CITIZEN_PASSWORD = DYNAMIC_CITIZEN_PASSWORD;

// Write initial temporary env file for tests
fs.writeFileSync(
  TEST_ENV_PATH,
  [
    'PORT=5000',
    'NODE_ENV=test',
    `MONGO_URI=${TEST_MONGO_URI}`,
    'JWT_SECRET=quickfile_test_isolated_secret_key_2026',
    'FRONTEND_URL=http://localhost:5173,https://portal.quickfile.gov.ph',
    `SU_ADMIN_KEY=${DYNAMIC_SU_ADMIN_KEY}`,
    'BARANGAY_NAME=Barangay 11',
    'CITY_MUNICIPALITY=Malaybalay',
    'PROVINCE=Bukidnon',
    'DEFAULT_GOOGLE_CLIENT_ID=test-google-id.apps.googleusercontent.com',
    'DEFAULT_GOOGLE_CLIENT_SECRET=test-google-secret',
    'DEFAULT_RECAPTCHA_SITE_KEY=test-recaptcha-site-key',
    'DEFAULT_RECAPTCHA_SECRET_KEY=test-recaptcha-secret-key',
    'DEFAULT_SMS_GATEWAY_URL=https://dashboard.philsms.com/api/v3/',
    'DEFAULT_SMS_API_TOKEN=test-sms-token-rand',
    'DEFAULT_SMTP_HOST=smtp.gmail.com',
    'DEFAULT_SMTP_USER=test@gmail.com',
    'DEFAULT_REST_API_SECRET_KEY=test-rest-api-secret',
    'CUSTOM_GOOGLE_CLIENT_ID=',
    'CUSTOM_GOOGLE_CLIENT_SECRET=',
    'CUSTOM_SMS_API_TOKEN=',
    `DEFAULT_ADMIN_PASSWORD=${DYNAMIC_ADMIN_PASSWORD}`,
    `DEFAULT_STAFF_PASSWORD=${DYNAMIC_STAFF_PASSWORD}`,
    `DEFAULT_CITIZEN_PASSWORD=${DYNAMIC_CITIZEN_PASSWORD}`,
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
  Notification,
  PasswordReset,
  AppSetting,
  AuditLog,
} = require('./src/models');
const { API_PREFIX, ROLES } = require('./src/config/constants');
const { verifyRecaptcha } = require('./src/utils/recaptcha');
const notificationService = require('./src/modules/notification/notification.service');
const authService = require('./src/modules/auth/auth.service');

function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: '127.0.0.1',
      port,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed,
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`Assertion FAILED: ${message}`);
    throw new Error(message);
  }
}

async function runTests() {
  console.log('====================================================================');
  console.log('STARTING PHASE 2, STEP 2A INTEGRATION & SECURITY TEST SUITE');
  console.log('====================================================================\n');

  await connectDB();
  await seedDatabase();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Carry-Over Fix #3: MONGO_URI Required in .env
    // -------------------------------------------------------------------------
    console.log('[TEST 1] Invariant Check: MONGO_URI Required (no fallback)');
    const savedUri = process.env.MONGO_URI;
    try {
      delete process.env.MONGO_URI;
      let caught = false;
      try {
        validateConfig();
      } catch (err) {
        caught = true;
        console.log(`PASS: validateConfig correctly rejected missing MONGO_URI: "${err.message}"`);
      }
      assert(caught, 'validateConfig should throw when MONGO_URI is missing');
    } finally {
      process.env.MONGO_URI = savedUri;
    }
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 2: Carry-Over Fix #2: CORS (Origin check, JSON 403, Comma-separated)
    // -------------------------------------------------------------------------
    console.log('[TEST 2] CORS Policy Verification');

    // 2a: Allowed origin 1 (localhost:5173)
    const corsAllowed1 = await makeRequest(server, {
      path: `${API_PREFIX}/health`,
      method: 'GET',
      headers: { Origin: 'http://localhost:5173' },
    });
    assert(corsAllowed1.status === 200, `Allowed origin 1 should get 200, got ${corsAllowed1.status}`);
    assert(
      corsAllowed1.headers['access-control-allow-origin'] === 'http://localhost:5173',
      'CORS header should reflect allowed origin'
    );
    assert(!corsAllowed1.headers['access-control-allow-credentials'], 'credentials: true should NOT be set');
    console.log('PASS: Allowed origin 1 (http://localhost:5173) accepted without credentials header.');

    // 2b: Allowed origin 2 (https://portal.quickfile.gov.ph)
    const corsAllowed2 = await makeRequest(server, {
      path: `${API_PREFIX}/health`,
      method: 'GET',
      headers: { Origin: 'https://portal.quickfile.gov.ph' },
    });
    assert(corsAllowed2.status === 200, `Allowed origin 2 should get 200, got ${corsAllowed2.status}`);
    assert(
      corsAllowed2.headers['access-control-allow-origin'] === 'https://portal.quickfile.gov.ph',
      'CORS header should reflect allowed origin 2'
    );
    console.log('PASS: Allowed origin 2 (https://portal.quickfile.gov.ph) accepted.');

    // 2c: Blocked origin returns JSON 403, NOT 500
    const corsBlocked = await makeRequest(server, {
      path: `${API_PREFIX}/health`,
      method: 'GET',
      headers: { Origin: 'https://evil-unauthorized-site.com' },
    });
    assert(corsBlocked.status === 403, `Blocked origin should return 403, got ${corsBlocked.status}`);
    assert(corsBlocked.data?.success === false, 'Blocked CORS should return JSON success: false');
    assert(typeof corsBlocked.data?.message === 'string', 'Blocked CORS should return descriptive message');
    console.log(`PASS: Blocked origin returned JSON 403: "${corsBlocked.data?.message}"`);
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 3: Carry-Over Fix #1: .env Writer Round-Trip Verification
    // (spaces, #, quotes, backslash, literal \n, rejection of raw \n)
    // -------------------------------------------------------------------------
    console.log('[TEST 3] .env Writer Round-Trip & Edge Cases Verification');

    // Login as default admin to get admin token
    const adminLoginRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/login`, method: 'POST' },
      { email: 'admin@quickfile.gov.ph', password: DYNAMIC_ADMIN_PASSWORD }
    );
    assert(adminLoginRes.status === 200, 'Admin login should succeed');
    const adminToken = adminLoginRes.data.data.access_token;

    // Test cases that must safely round-trip
    const roundTripCases = [
      { key: 'CUSTOM_SMS_API_TOKEN', val: 'token with spaces' },
      { key: 'CUSTOM_SMS_API_TOKEN', val: 'token#with#hash' },
      { key: 'CUSTOM_SMS_API_TOKEN', val: 'token"with"doublequotes' },
      { key: 'CUSTOM_SMS_API_TOKEN', val: "token'with'singlequotes" },
      { key: 'CUSTOM_SMS_API_TOKEN', val: 'token\\with\\backslash' },
      { key: 'CUSTOM_SMS_API_TOKEN', val: 'token\\nwith\\nliteral\\nescape' },
      { key: 'CUSTOM_SMS_API_TOKEN', val: 'complex # "quotes" and \\ and \\n literal' },
    ];

    for (const { key, val } of roundTripCases) {
      const updateRes = await makeRequest(
        server,
        {
          path: `${API_PREFIX}/admin/settings`,
          method: 'PATCH',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        {
          su_admin_key: DYNAMIC_SU_ADMIN_KEY,
          settings: { [key]: val },
        }
      );
      assert(updateRes.status === 200, `Saving value failed for: ${val}`);

      // Verify file on disk parsed by dotenv equals expected value
      const parsedEnv = dotenv.parse(fs.readFileSync(TEST_ENV_PATH, 'utf8'));
      assert(
        parsedEnv[key] === val,
        `Disk round-trip failed! Expected "${val}", parsed "${parsedEnv[key]}"`
      );

      // Verify in-memory process.env updated
      assert(process.env[key] === val, `process.env failed! Expected "${val}", got "${process.env[key]}"`);
      console.log(`PASS: Round-trip succeeded for value: ${JSON.stringify(val)}`);
    }

    // Edge case: Values with raw unescaped newlines must be rejected with 400
    const rawNewlineRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/settings`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        su_admin_key: DYNAMIC_SU_ADMIN_KEY,
        settings: { CUSTOM_SMS_API_TOKEN: "line1\nline2" },
      }
    );
    assert(rawNewlineRes.status === 400, `Raw newline should be rejected with 400, got ${rawNewlineRes.status}`);
    console.log(`PASS: Value with raw newline rejected with 400: "${rawNewlineRes.data?.message}"`);
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 4: reCAPTCHA Utility Verification
    // -------------------------------------------------------------------------
    console.log('[TEST 4] reCAPTCHA Utility Verification');

    // 4a: Bypassed when enable_recaptcha is false
    const recaptchaDisabledRes = await verifyRecaptcha(null, '127.0.0.1');
    assert(recaptchaDisabledRes.bypassed === true, 'reCAPTCHA should bypass when disabled');
    console.log('PASS: reCAPTCHA bypassed when enable_recaptcha is false.');

    // 4b: Required when enable_recaptcha is true
    await AppSetting.updateOne({ key: 'enable_recaptcha' }, { value: true });
    try {
      let threwMissing = false;
      try {
        await verifyRecaptcha(null, '127.0.0.1');
      } catch (err) {
        threwMissing = true;
        assert(err.statusCode === 400, 'Missing reCAPTCHA should have 400 status');
      }
      assert(threwMissing, 'Should throw error when reCAPTCHA token is missing while enabled');

      // Test valid simulated token via injected verifier (Fix 2)
      const { setRecaptchaVerifier } = require('./src/utils/recaptcha');
      setRecaptchaVerifier(async () => ({ success: true, verified: true }));
      const validMockRes = await verifyRecaptcha('mock-valid-recaptcha-token', '127.0.0.1');
      assert(validMockRes.verified === true, 'Mock token should verify');
      setRecaptchaVerifier(null);
      console.log('PASS: reCAPTCHA enforces token and verifies when enable_recaptcha is true.');
    } finally {
      await AppSetting.updateOne({ key: 'enable_recaptcha' }, { value: false });
    }
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 5: Auth Module (Registration, Login, Me, Logout)
    // -------------------------------------------------------------------------
    console.log('[TEST 5] Auth Module - Registration, Login, Inactive Guard, Me, Logout');

    const citizenPayload = {
      email: 'new.citizen@pasig.gov.ph',
      password: 'SecurePassword@123',
      first_name: 'Maria',
      middle_name: 'Santos',
      last_name: 'Reyes',
      suffix: '',
      birthdate: '1995-06-15',
      gender: 'female',
      civil_status: 'married',
      contact_number: '09181234567',
      purok_zone: 'Zone 4',
      street_address: '123 Mabini St.',
      barangay: 'Barangay San Antonio',
      city: 'Pasig City',
      province: 'Metro Manila',
      occupation: 'Software QA Engineer',
      emergency_contact_name: 'Pedro Reyes',
      emergency_contact_number: '09187654321',
    };

    // 5a: Register new citizen
    const registerRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/register`, method: 'POST' },
      citizenPayload
    );
    assert(registerRes.status === 201, `Citizen registration failed with status ${registerRes.status}`);
    assert(registerRes.data?.data?.access_token, 'Registration should return access_token');
    assert(registerRes.data?.data?.user?.role === ROLES.CITIZEN, 'Registered user role should be citizen');
    assert(registerRes.data?.data?.profile?.first_name === 'Maria', 'Profile first_name should be Maria');
    console.log('PASS: Citizen registered successfully with profile creation.');

    // 5b: Login newly registered citizen
    const loginRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/login`, method: 'POST' },
      { email: 'new.citizen@pasig.gov.ph', password: 'SecurePassword@123' }
    );
    assert(loginRes.status === 200, `Citizen login failed with status ${loginRes.status}`);
    const citizenToken = loginRes.data?.data?.access_token;
    assert(citizenToken, 'Login should return access token');
    console.log('PASS: Citizen logged in successfully.');

    // 5c: Inactive account guard (403)
    await User.updateOne({ email: 'new.citizen@pasig.gov.ph' }, { is_active: false });
    const inactiveLoginRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/login`, method: 'POST' },
      { email: 'new.citizen@pasig.gov.ph', password: 'SecurePassword@123' }
    );
    assert(inactiveLoginRes.status === 403, `Inactive user should get 403, got ${inactiveLoginRes.status}`);
    console.log(`PASS: Inactive account rejected with 403: "${inactiveLoginRes.data?.message}"`);

    // Reactivate account
    await User.updateOne({ email: 'new.citizen@pasig.gov.ph' }, { is_active: true });

    // 5d: GET /api/v1/auth/me
    const meRes = await makeRequest(server, {
      path: `${API_PREFIX}/auth/me`,
      method: 'GET',
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    assert(meRes.status === 200, 'GET /auth/me should succeed');
    assert(meRes.data?.data?.user?.email === 'new.citizen@pasig.gov.ph', 'GET /auth/me user email match');
    assert(meRes.data?.data?.profile?.last_name === 'Reyes', 'GET /auth/me profile match');
    console.log('PASS: GET /api/v1/auth/me returned user details and profile.');

    // 5e: POST /api/v1/auth/logout
    const logoutRes = await makeRequest(server, {
      path: `${API_PREFIX}/auth/logout`,
      method: 'POST',
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    assert(logoutRes.status === 200, 'Logout should succeed');
    const logoutAudit = await AuditLog.findOne({ action: 'USER_LOGOUT' }).sort({ created_at: -1 });
    assert(logoutAudit, 'Audit log should record USER_LOGOUT');
    console.log('PASS: Logout succeeded and created USER_LOGOUT audit log entry.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 6: Google OAuth Login (POST Google ID Token, JWT response, Toggle check)
    // -------------------------------------------------------------------------
    console.log('[TEST 6] Google OAuth Login Endpoint');

    // 6a: Blocked when enable_google_login is false
    const googleDisabledRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/google`, method: 'POST' },
      { id_token: 'mock-google-id-token-123' }
    );
    assert(googleDisabledRes.status === 403, `Google login should be blocked with 403, got ${googleDisabledRes.status}`);
    console.log(`PASS: Google login blocked when disabled: "${googleDisabledRes.data?.message}"`);

    // 6b: Enabled - verifies token, returns our JWT, no tokens in URLs
    await AppSetting.updateOne({ key: 'enable_google_login' }, { value: true });
    authService.setGoogleTokenVerifier(async () => ({
      sub: 'google-sub-mock-12345',
      email: 'mock.google.user@example.com',
      email_verified: true,
      name: 'Mock Google Citizen',
      given_name: 'Mock Google',
      family_name: 'Citizen',
    }));
    try {
      const googleSuccessRes = await makeRequest(
        server,
        { path: `${API_PREFIX}/auth/google`, method: 'POST' },
        { id_token: 'mock-google-id-token-123' }
      );
      assert(googleSuccessRes.status === 200, `Google login should succeed with 200, got ${googleSuccessRes.status}`);
      assert(googleSuccessRes.data?.data?.access_token, 'Google login should return our JWT access_token');
      assert(googleSuccessRes.data?.data?.user?.google_id === 'google-sub-mock-12345', 'Google ID linked');
      console.log('PASS: Google login successfully verified ID token and issued JWT.');
    } finally {
      authService.setGoogleTokenVerifier(null);
      await AppSetting.updateOne({ key: 'enable_google_login' }, { value: false });
    }
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 7: Password Reset Flow (Forgot Password, Hash Stored, Reset Password)
    // -------------------------------------------------------------------------
    console.log('[TEST 7] Password Reset Flow (Token Hash, Single-use, Expiry)');

    // 7a: Forgot password (non-existent email receives same generic message to prevent enumeration)
    const forgotNonExistent = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/forgot-password`, method: 'POST' },
      { email: 'nonexistent@example.com' }
    );
    assert(forgotNonExistent.status === 200, 'Forgot password must return 200 generic message');
    console.log(`PASS: Generic enumeration-safe response for non-existent email.`);

    // 7b: Forgot password for existing citizen
    const forgotExisting = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/forgot-password`, method: 'POST' },
      { email: 'new.citizen@pasig.gov.ph' }
    );
    assert(forgotExisting.status === 200, 'Forgot password for existing user should return 200');

    // Verify token hash is stored in DB (not plaintext)
    const resetRecord = await PasswordReset.findOne({ email: 'new.citizen@pasig.gov.ph', used: false });
    assert(resetRecord, 'PasswordReset record should exist');
    assert(resetRecord.token_hash && resetRecord.token_hash.length === 64, 'SHA-256 hash (64 hex) must be stored');
    console.log('PASS: Reset request stored 64-char SHA-256 token hash in PasswordReset.');

    // In a real email, the user receives rawToken. For test, let's create a known rawToken + hash
    const testRawToken = 'my_secret_random_raw_token_' + crypto.randomBytes(8).toString('hex');
    const testTokenHash = crypto.createHash('sha256').update(testRawToken).digest('hex');

    await PasswordReset.create({
      user_id: resetRecord.user_id,
      email: 'new.citizen@pasig.gov.ph',
      token_hash: testTokenHash,
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
      used: false,
    });

    // 7c: Reset password with too short password (< 6 chars)
    const resetShortRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/reset-password`, method: 'POST' },
      { token: testRawToken, new_password: '123' }
    );
    assert(resetShortRes.status === 400, 'Short password should be rejected with 400');
    console.log(`PASS: Short password rejected: "${resetShortRes.data?.message}"`);

    // 7d: Reset password with valid password
    const resetSuccessRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/reset-password`, method: 'POST' },
      { token: testRawToken, new_password: 'NewlyUpdatedPassword@2026' }
    );
    assert(resetSuccessRes.status === 200, `Reset password should succeed, got ${resetSuccessRes.status}`);
    console.log('PASS: Password reset succeeded with valid raw token.');

    // 7e: Single-use check: reused token must fail
    const resetReuseRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/reset-password`, method: 'POST' },
      { token: testRawToken, new_password: 'AnotherPassword@2026' }
    );
    assert(resetReuseRes.status === 400, 'Reused reset token must fail with 400');
    console.log(`PASS: Single-use enforced (reused token rejected): "${resetReuseRes.data?.message}"`);

    // 7f: Verify login with new password
    const loginNewPassRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/login`, method: 'POST' },
      { email: 'new.citizen@pasig.gov.ph', password: 'NewlyUpdatedPassword@2026' }
    );
    assert(loginNewPassRes.status === 200, 'Login with newly reset password must succeed');
    console.log('PASS: Successfully logged in using newly updated password.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 8: Citizen Profile Module (Profile, Completeness, Update Sync, Reuse)
    // -------------------------------------------------------------------------
    console.log('[TEST 8] Citizen Profile Module');

    const updatedCitizenToken = loginNewPassRes.data.data.access_token;

    // 8a: GET /api/v1/citizen/profile
    const profileRes = await makeRequest(server, {
      path: `${API_PREFIX}/citizen/profile`,
      method: 'GET',
      headers: { Authorization: `Bearer ${updatedCitizenToken}` },
    });
    assert(profileRes.status === 200, 'GET /citizen/profile should succeed');
    assert(typeof profileRes.data?.data?.completeness_score === 'number', 'Should include completeness_score');
    console.log(`PASS: Profile retrieved with completeness_score: ${profileRes.data?.data?.completeness_score}%`);

    // 8b: PUT /api/v1/citizen/profile (updates profile and syncs User full_name & phone)
    const updateProfileRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/citizen/profile`,
        method: 'PUT',
        headers: { Authorization: `Bearer ${updatedCitizenToken}` },
      },
      {
        first_name: 'Maria Elena',
        last_name: 'Reyes-Cruz',
        contact_number: '09199998888',
        valid_id_type: 'Passport',
        valid_id_number: 'P9876543B',
      }
    );
    assert(updateProfileRes.status === 200, 'PUT /citizen/profile should succeed');
    assert(updateProfileRes.data?.data?.profile?.first_name === 'Maria Elena', 'Profile first_name updated');

    // Verify User sync
    const syncedUser = await User.findOne({ email: 'new.citizen@pasig.gov.ph' });
    assert(
      syncedUser.full_name.includes('Maria Elena') && syncedUser.full_name.includes('Reyes-Cruz'),
      `User.full_name should be synced! Got: "${syncedUser.full_name}"`
    );
    assert(syncedUser.phone === '09199998888', `User.phone should be synced! Got: "${syncedUser.phone}"`);
    console.log(`PASS: Profile updated and synchronized User.full_name ("${syncedUser.full_name}") and User.phone.`);

    // 8c: GET /api/v1/citizen/profile/reuse
    const reuseRes = await makeRequest(server, {
      path: `${API_PREFIX}/citizen/profile/reuse`,
      method: 'GET',
      headers: { Authorization: `Bearer ${updatedCitizenToken}` },
    });
    assert(reuseRes.status === 200, 'GET /citizen/profile/reuse should succeed');
    assert(reuseRes.data?.data?.valid_id_number === 'P9876543B', 'Reuse data matches updated profile');
    console.log('PASS: Profile reuse data retrieved for prefilling request forms.');

    // 8d: GET /api/v1/citizen/catalog
    const catalogRes = await makeRequest(server, {
      path: `${API_PREFIX}/citizen/catalog`,
      method: 'GET',
      headers: { Authorization: `Bearer ${updatedCitizenToken}` },
    });
    assert(catalogRes.status === 200, 'GET /citizen/catalog should succeed');
    assert(Array.isArray(catalogRes.data?.data), 'Catalog data should be an array');
    assert(catalogRes.data?.data?.length > 0, 'Catalog should contain seeded active document types');
    console.log(`PASS: Document catalog returned ${catalogRes.data?.data?.length} active document types.`);
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 9: Admin Document Types CRUD & Deletion Protection
    // -------------------------------------------------------------------------
    console.log('[TEST 9] Admin Document Types CRUD & Deletion Protection');

    // 9a: GET /api/v1/admin/document-types
    const adminDocsListRes = await makeRequest(server, {
      path: `${API_PREFIX}/admin/document-types`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminDocsListRes.status === 200, 'Admin document types list should succeed');
    const initialCount = adminDocsListRes.data?.data?.length;

    // 9b: POST /api/v1/admin/document-types (Create new document type)
    const createDocRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/document-types`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        name: 'Certificate of Good Moral',
        code: 'CGM',
        description: 'Certificate certifying good moral standing in the barangay.',
        fee: 75.0,
        processing_days: 1,
        requirements: ['Valid Government ID', '2x2 ID Photo'],
        is_active: true,
      }
    );
    assert(createDocRes.status === 201, `Create document type failed with status ${createDocRes.status}`);
    const createdDocId = createDocRes.data?.data?._id;
    assert(createdDocId, 'Created document type should have _id');
    console.log('PASS: Admin successfully created new document type.');

    // 9c: PUT /api/v1/admin/document-types/:id (Update)
    const updateDocRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/document-types/${createdDocId}`,
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        fee: 80.0,
        processing_days: 2,
      }
    );
    assert(updateDocRes.status === 200, 'Update document type should succeed');
    assert(updateDocRes.data?.data?.fee === 80, 'Updated fee should be 80');
    console.log('PASS: Admin successfully updated document type.');

    // 9d: Deletion Blocked when referenced by a DocumentRequest
    const dummyCitizen = await User.findOne({ role: ROLES.CITIZEN });
    await DocumentRequest.create({
      tracking_number: 'REQ-2026-TEST-0001',
      citizen_id: dummyCitizen._id,
      document_type_id: createdDocId,
      full_name: 'Test Citizen',
      contact_number: '09199998888',
      purpose: 'Testing deletion constraint',
      fee: 80,
    });

    const blockedDeleteRes = await makeRequest(server, {
      path: `${API_PREFIX}/admin/document-types/${createdDocId}`,
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      blockedDeleteRes.status === 400,
      `Delete should be blocked with 400 when referenced, got ${blockedDeleteRes.status}`
    );
    console.log(`PASS: Deletion blocked when referenced by DocumentRequest: "${blockedDeleteRes.data?.message}"`);

    // Clean up reference request and test successful deletion
    await DocumentRequest.deleteMany({ document_type_id: createdDocId });

    const successDeleteRes = await makeRequest(server, {
      path: `${API_PREFIX}/admin/document-types/${createdDocId}`,
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(successDeleteRes.status === 200, 'Delete should succeed when no references exist');
    console.log('PASS: Document type successfully deleted when not referenced.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 10: In-App Notifications (Create, List, Unread Count, Read, Delete)
    // -------------------------------------------------------------------------
    console.log('[TEST 10] In-App Notifications Module');

    const citizenUser = await User.findOne({ email: 'new.citizen@pasig.gov.ph' });

    // 10a: Create notification via notification service
    const notif1 = await notificationService.sendNotification({
      user_id: citizenUser._id,
      title: 'Welcome to QuickFile',
      message: 'Your citizen account has been successfully set up.',
      type: 'success',
    });
    const notif2 = await notificationService.sendNotification({
      user_id: citizenUser._id,
      title: 'System Notice',
      message: 'Barangay hall will be closed on Friday for disinfection.',
      type: 'info',
    });
    assert(notif1._id && notif2._id, 'Notifications created');

    // 10b: GET /api/v1/citizen/notifications (list + unread count)
    const listNotifRes = await makeRequest(server, {
      path: `${API_PREFIX}/citizen/notifications`,
      method: 'GET',
      headers: { Authorization: `Bearer ${updatedCitizenToken}` },
    });
    assert(listNotifRes.status === 200, 'Get notifications should succeed');
    assert(listNotifRes.data?.data?.unread_count >= 2, 'Unread count should be at least 2');
    console.log(`PASS: Retrieved notifications with unread_count: ${listNotifRes.data?.data?.unread_count}`);

    // 10c: PATCH /api/v1/citizen/notifications/:id/read (mark single read)
    const readOneRes = await makeRequest(server, {
      path: `${API_PREFIX}/citizen/notifications/${notif1._id}/read`,
      method: 'PATCH',
      headers: { Authorization: `Bearer ${updatedCitizenToken}` },
    });
    assert(readOneRes.status === 200, 'Mark one read should succeed');
    assert(readOneRes.data?.data?.is_read === true, 'Notification is_read should be true');
    console.log('PASS: Single notification marked as read.');

    // 10d: PATCH /api/v1/citizen/notifications/read-all (mark all read)
    const readAllRes = await makeRequest(server, {
      path: `${API_PREFIX}/citizen/notifications/read-all`,
      method: 'PATCH',
      headers: { Authorization: `Bearer ${updatedCitizenToken}` },
    });
    assert(readAllRes.status === 200, 'Mark all read should succeed');

    const listAfterReadAll = await makeRequest(server, {
      path: `${API_PREFIX}/citizen/notifications`,
      method: 'GET',
      headers: { Authorization: `Bearer ${updatedCitizenToken}` },
    });
    assert(listAfterReadAll.data?.data?.unread_count === 0, 'Unread count should be 0 after read-all');
    console.log('PASS: All notifications marked as read; unread_count is 0.');

    // 10e: DELETE /api/v1/citizen/notifications/:id (single delete with ownership check)
    const deleteOneRes = await makeRequest(server, {
      path: `${API_PREFIX}/citizen/notifications/${notif1._id}`,
      method: 'DELETE',
      headers: { Authorization: `Bearer ${updatedCitizenToken}` },
    });
    assert(deleteOneRes.status === 200, 'Delete notification should succeed');
    console.log('PASS: Single notification deleted.');

    // 10f: DELETE /api/v1/citizen/notifications (clear all)
    const clearAllRes = await makeRequest(server, {
      path: `${API_PREFIX}/citizen/notifications`,
      method: 'DELETE',
      headers: { Authorization: `Bearer ${updatedCitizenToken}` },
    });
    assert(clearAllRes.status === 200, 'Clear all notifications should succeed');

    const listAfterClear = await makeRequest(server, {
      path: `${API_PREFIX}/citizen/notifications`,
      method: 'GET',
      headers: { Authorization: `Bearer ${updatedCitizenToken}` },
    });
    assert(listAfterClear.data?.data?.notifications?.length === 0, 'Notifications list should be empty');
    console.log('PASS: All citizen notifications cleared successfully.');
    console.log('--------------------------------------------------------------------\n');

    console.log('====================================================================');
    console.log('ALL 10 PHASE 2, STEP 2A INTEGRATION & SECURITY TESTS PASSED.');
    console.log('====================================================================');
  } finally {
    server.close();

    try {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
      console.log('[Cleanup] Dropped isolated quickfile_test database.');
    } catch {}

    if (fs.existsSync(TEST_ENV_PATH)) {
      fs.unlinkSync(TEST_ENV_PATH);
      console.log('[Cleanup] Removed temporary test_2a.env.tmp file.');
    }

    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
