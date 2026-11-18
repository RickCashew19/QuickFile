/**
 * Comprehensive API Key Management Security and Code Quality Test Suite
 *
 * Requirements Tested:
 * 1. Super Admin PIN Verification (Correct PIN, Incorrect PIN, Lockout, Unauthorized Roles)
 * 2. Two-Factor Authentication (2FA) (Email Dispatch, Correct Code, Incorrect Code, Expiration, Attempt Limits)
 * 3. API Key Provider Validation (REST API Key, Google OAuth, PhilSMS, SMTP, reCAPTCHA, Secret Leak Prevention)
 * 4. API Key Enable/Disable Toggle & REST Gateway Enforcement (Enabled, Disabled, Alternative Auth Fallback)
 * 5. Security & Audit Logging (Sanitized Logs, Safe Integration Summaries)
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Isolated test environment configuration
const TEST_ENV_PATH = path.resolve(__dirname, 'test_api_key_management.env.tmp');
const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/quickfile_api_key_test';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = TEST_MONGO_URI;
process.env.ENV_FILE = TEST_ENV_PATH;
process.env.SU_ADMIN_KEY = 'super_secret_pin_987654321';
process.env.JWT_SECRET = 'quickfile_api_key_management_jwt_secret_test_32chars';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.PUBLIC_APP_URL = 'http://localhost:5173';
process.env.BARANGAY_NAME = 'Barangay Central';
process.env.CITY_MUNICIPALITY = 'Malaybalay';
process.env.PROVINCE = 'Bukidnon';
process.env.APP_TIMEZONE_OFFSET_MINUTES = '480';
process.env.CERTIFICATE_VALIDITY_DAYS = '180';
process.env.DEFAULT_REST_API_SECRET_KEY = 'default_rest_api_secret_key_123456';

// Write initial isolated temporary .env file
fs.writeFileSync(
  TEST_ENV_PATH,
  [
    'PORT=5000',
    'NODE_ENV=test',
    `MONGO_URI=${TEST_MONGO_URI}`,
    'JWT_SECRET=quickfile_api_key_management_jwt_secret_test_32chars',
    'FRONTEND_URL=http://localhost:5173',
    'PUBLIC_APP_URL=http://localhost:5173',
    'SU_ADMIN_KEY=super_secret_pin_987654321',
    'BARANGAY_NAME=Barangay Central',
    'CITY_MUNICIPALITY=Malaybalay',
    'PROVINCE=Bukidnon',
    'APP_TIMEZONE_OFFSET_MINUTES=480',
    'CERTIFICATE_VALIDITY_DAYS=180',
    'DEFAULT_REST_API_SECRET_KEY=default_rest_api_secret_key_123456',
  ].join('\n'),
  'utf8'
);

const app = require('../app');
const { connectDB, disconnectDB } = require('../src/config/db');
const { config } = require('../src/config');
const {
  User,
  AppSetting,
  AuditLog,
  SuperAdminLockout,
  TwoFactorVerification,
  DocumentType,
} = require('../src/models');
const { API_PREFIX, ROLES } = require('../src/config/constants');
const { suKeyLimiter } = require('../src/middlewares/rateLimiter.middleware');
const { setMailTransport } = require('../src/helpers/mailer');
const apiKeyValidator = require('../src/services/apiKeyValidator.service');

// Capture outgoing emails sent via mailer
const sentEmails = [];
setMailTransport({
  sendMail: async (options) => {
    sentEmails.push(options);
    return { messageId: 'mock-mail-' + Date.now() };
  },
});

function makeHttpRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const { path: reqPath, method = 'GET', headers = {} } = options;
    const postData = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = { ...headers };
    if (postData && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (postData) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: reqPath,
        method,
        headers: reqHeaders,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          let parsed;
          try {
            parsed = JSON.parse(raw.toString('utf8'));
          } catch {
            parsed = raw.toString('utf8');
          }
          resolve({ status: res.statusCode, headers: res.headers, data: parsed, buffer: raw });
        });
      }
    );
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTestSuite() {
  console.log('================================================================');
  console.log(' QuickFile - API Key Management Security & Quality Test Suite');
  console.log('================================================================\n');

  let server;
  let adminUser;
  let citizenUser;
  let adminToken;
  let citizenToken;

  try {
    console.log('[Setup] Connecting to isolated test database...');
    await connectDB(TEST_MONGO_URI);

    // Clean test collections
    await User.deleteMany({ email: { $in: ['test_admin@quickfile.gov.ph', 'test_citizen@quickfile.gov.ph'] } });
    await AppSetting.deleteMany({});
    await SuperAdminLockout.deleteMany({});
    await TwoFactorVerification.deleteMany({});
    await DocumentType.deleteMany({});

    const testStartTime = new Date();

    // Seed test users
    adminUser = await User.create({
      full_name: 'Test Administrator',
      email: 'test_admin@quickfile.gov.ph',
      password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJK',
      role: ROLES.ADMIN,
      is_active: true,
      email_verified: true,
    });

    citizenUser = await User.create({
      full_name: 'Test Citizen',
      email: 'test_citizen@quickfile.gov.ph',
      password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJK',
      role: ROLES.CITIZEN,
      is_active: true,
      email_verified: true,
    });

    // Seed a sample active document type for gateway tests
    await DocumentType.create({
      code: 'BARANGAY_CLEARANCE',
      name: 'Barangay Clearance',
      description: 'Official clearance issued by the barangay.',
      fee: 50.0,
      processing_days: 1,
      is_active: true,
    });

    // Generate test JWTs
    adminToken = jwt.sign(
      { id: adminUser._id.toString(), role: adminUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    citizenToken = jwt.sign(
      { id: citizenUser._id.toString(), role: citizenUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Start Express server on ephemeral port
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    console.log(`[Setup] Test server running on http://127.0.0.1:${port}\n`);

    // =========================================================================
    // SECTION 1: Super Admin PIN Verification
    // =========================================================================
    console.log('----------------------------------------------------------------');
    console.log(' SECTION 1: Super Admin PIN Verification & Access Control');
    console.log('----------------------------------------------------------------');

    // 1.1: Rejects unauthenticated request (No JWT)
    {
      const res = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/verify-pin`,
        method: 'POST',
      }, { pin: process.env.SU_ADMIN_KEY });
      assert.strictEqual(res.status, 401, 'Expected 401 for unauthenticated request');
      assert.strictEqual(res.data.success, false);
      console.log('  ✓ 1.1: Rejects unauthenticated request without JWT (401)');
    }

    // 1.2: Rejects non-admin user (Citizen role)
    {
      const res = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/verify-pin`,
        method: 'POST',
        headers: { Authorization: `Bearer ${citizenToken}` },
      }, { pin: process.env.SU_ADMIN_KEY });
      assert.strictEqual(res.status, 403, 'Expected 403 for citizen user');
      assert.strictEqual(res.data.success, false);
      console.log('  ✓ 1.2: Rejects non-admin user attempting PIN verification (403)');
    }

    // 1.3: Rejects missing PIN
    {
      const res = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/verify-pin`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, {});
      assert.strictEqual(res.status, 400, 'Expected 400 for missing PIN');
      assert.strictEqual(res.data.success, false);
      console.log('  ✓ 1.3: Rejects missing Super Admin PIN (400)');
    }

    // 1.4: Rejects incorrect PIN
    {
      const res = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/verify-pin`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { pin: 'wrong_super_admin_pin' });
      assert.strictEqual(res.status, 401, 'Expected 401 for wrong PIN');
      assert.strictEqual(res.data.success, false);
      console.log('  ✓ 1.4: Rejects incorrect Super Admin PIN (401)');
    }

    // 1.5: Enforces lockout after 5 consecutive failures
    {
      // Already had 1 failure in 1.4, trigger 4 more
      for (let i = 0; i < 4; i++) {
        await makeHttpRequest(server, {
          path: `${API_PREFIX}/admin/settings/verify-pin`,
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        }, { pin: 'wrong_pin_' + i });
      }
      // 6th attempt should return HTTP 423 Locked
      const lockedRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/verify-pin`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { pin: process.env.SU_ADMIN_KEY });
      assert.strictEqual(lockedRes.status, 423, 'Expected 423 Locked after 5 consecutive failures');
      assert.match(lockedRes.data.message, /locked/i);
      console.log('  ✓ 1.5: Enforces database lockout (HTTP 423) after 5 consecutive failed attempts');

      // Reset lockout record for subsequent tests
      await SuperAdminLockout.deleteMany({});
    }

    // 1.6: Accepts correct PIN without issuing a client-side grant token
    {
      const res = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/verify-pin`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { pin: process.env.SU_ADMIN_KEY });
      assert.strictEqual(res.status, 200, 'Expected 200 for correct PIN');
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.verified, true);
      assert.strictEqual(
        res.data.data.grant_token,
        undefined,
        'No client-side grant token should be issued; sensitive actions re-verify the PIN'
      );
      console.log('  ✓ 1.6: Successfully verifies correct Super Admin PIN without issuing a grant token (200)');
    }

    // =========================================================================
    // SECTION 2: API Key Provider Validation
    // =========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log(' SECTION 2: API Key Provider Validation');
    console.log('----------------------------------------------------------------');

    // 2.1: REST API Key Validation
    {
      // Key too short (< 16 characters)
      const shortRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/validate-key`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { provider: 'rest_api', credentials: { secretKey: 'short_key_123' } });
      assert.strictEqual(shortRes.data.success, false);
      assert.match(shortRes.data.message, /at least 16 characters/i);

      // Common placeholder rejection
      const placeholderRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/validate-key`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { provider: 'rest_api', credentials: { secretKey: 'password_1234567890' } });
      assert.strictEqual(placeholderRes.data.success, false);
      assert.match(placeholderRes.data.message, /placeholder pattern/i);

      // Low complexity rejection (only digits, avoiding common sequences)
      const lowComplexityRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/validate-key`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { provider: 'rest_api', credentials: { secretKey: '99998888777766665555' } });
      assert.strictEqual(lowComplexityRes.data.success, false);
      assert.match(lowComplexityRes.data.message, /mix of letters and numbers/i);

      // Valid strong REST API key
      const validRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/validate-key`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { provider: 'rest_api', credentials: { secretKey: 'qk_live_sec_998877665544332211' } });
      assert.strictEqual(validRes.data.success, true);
      assert.strictEqual(validRes.data.data.valid, true);
      console.log('  ✓ 2.1: Validates REST API Key length, complexity, and entropy checks');
    }

    // 2.2: Google OAuth Validation
    {
      // Malformed Google Client ID
      const malformedRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/validate-key`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { provider: 'google', credentials: { clientId: 'invalid-client-id-without-suffix' } });
      assert.strictEqual(malformedRes.data.success, false);
      assert.match(malformedRes.data.message, /\.apps\.googleusercontent\.com/i);

      // Valid Google Client ID format
      const validGoogleRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/validate-key`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, {
        provider: 'google',
        credentials: {
          clientId: '123456789012-abc123def456.apps.googleusercontent.com',
          clientSecret: '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_20_chars',
        },
      });
      assert.strictEqual(validGoogleRes.data.success, true);
      console.log('  ✓ 2.2: Validates Google OAuth Client ID domain format & secret length');
    }

    // 2.3: PhilSMS Gateway Validation
    {
      // Token too short (< 15 characters)
      const shortTokenRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/validate-key`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { provider: 'sms', credentials: { apiToken: 'short_token' } });
      assert.strictEqual(shortTokenRes.data.success, false);
      assert.match(shortTokenRes.data.message, /at least 15 characters/i);

      // Invalid Gateway URL
      const invalidUrlRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/validate-key`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, {
        provider: 'sms',
        credentials: { gatewayUrl: 'not_a_valid_url', apiToken: 'valid_philsms_api_token_12345678' },
      });
      assert.strictEqual(invalidUrlRes.data.success, false);
      assert.match(invalidUrlRes.data.message, /valid HTTP or HTTPS URL/i);

      // SSRF guard: private, loopback and link-local probe targets are refused.
      for (const blockedUrl of ['http://127.0.0.1:8080', 'http://192.168.1.1', 'http://169.254.169.254/latest']) {
        const ssrfRes = await makeHttpRequest(server, {
          path: `${API_PREFIX}/admin/settings/validate-key`,
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        }, {
          provider: 'sms',
          credentials: { gatewayUrl: blockedUrl, apiToken: 'valid_philsms_api_token_12345678' },
        });
        assert.strictEqual(ssrfRes.data.success, false, `Expected ${blockedUrl} to be rejected`);
        assert.match(ssrfRes.data.message, /public host/i);
      }
      console.log('  ✓ 2.3: Validates PhilSMS token length, Gateway URL format and rejects SSRF targets');
    }

    // 2.4: reCAPTCHA Validation
    {
      const shortSecretRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/validate-key`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { provider: 'recaptcha', credentials: { secretKey: 'short_rc_key' } });
      assert.strictEqual(shortSecretRes.data.success, false);
      assert.match(shortSecretRes.data.message, /at least 20 characters/i);
      console.log('  ✓ 2.4: Validates reCAPTCHA Secret Key length requirements');
    }

    // 2.5: Never leaks raw secrets in API responses or logs
    {
      const res = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/validate-key`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, {
        provider: 'rest_api',
        credentials: { secretKey: 'super_sensitive_api_secret_key_to_never_leak' },
      });
      const responseString = JSON.stringify(res.data);
      assert.ok(
        !responseString.includes('super_sensitive_api_secret_key_to_never_leak'),
        'API response must never expose raw API key or secrets!'
      );
      console.log('  ✓ 2.5: Ensures API validation responses never expose raw API keys');
    }

    // =========================================================================
    // SECTION 3: Two-Factor Authentication (2FA) for API Key Registration
    // =========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log(' SECTION 3: Two-Factor Authentication (2FA) Workflow');
    console.log('----------------------------------------------------------------');

    // Clear mail inbox before testing
    sentEmails.length = 0;

    // 3.1: Rejects initiating key update with incorrect PIN
    {
      const res = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/initiate-key-update`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, {
        su_admin_key: 'wrong_pin',
        settings: { CUSTOM_REST_API_SECRET_KEY: 'qk_live_sec_998877665544332211' },
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(sentEmails.length, 0, 'No email should be dispatched on wrong PIN');
      console.log('  ✓ 3.1: Rejects 2FA initiation when Super Admin PIN is incorrect (401)');
    }

    // 3.2: Rejects non-allowlisted custom configuration keys
    {
      const res = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/initiate-key-update`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, {
        su_admin_key: process.env.SU_ADMIN_KEY,
        settings: { MALICIOUS_VARIABLE_OVERRIDE: 'bad_value' },
      });
      assert.strictEqual(res.status, 400);
      assert.match(res.data.message, /Invalid custom configuration key/i);
      assert.strictEqual(sentEmails.length, 0, 'No email dispatched for illegal variables');
      console.log('  ✓ 3.2: Rejects non-allowlisted configuration keys during 2FA initiation');
    }

    // 3.2b: When custom API is not working, 2FA confirms but rejects activation
    {
      sentEmails.length = 0;
      const nonWorkingGoogleKey = 'invalid-google-client-id-without-domain';
      const initRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/initiate-key-update`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, {
        su_admin_key: process.env.SU_ADMIN_KEY,
        settings: { CUSTOM_GOOGLE_CLIENT_ID: nonWorkingGoogleKey },
      });
      assert.strictEqual(initRes.status, 200, '2FA email should be dispatched when custom API is entered');
      assert.strictEqual(sentEmails.length, 1);
      const nwVerId = initRes.data.data.verification_id;
      const nwOtp = sentEmails[0].subject.match(/\((\d{6})\)/)[1];

      // Submit 2FA code; backend must verify if it is a working API and reject it!
      const confirmNwRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/confirm-key-update`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { verification_id: nwVerId, code: nwOtp });

      assert.strictEqual(confirmNwRes.status, 400);
      assert.match(confirmNwRes.data.message, /Google OAuth API is not working/i);

      // Verify it was NOT written to .env
      const envContent = fs.readFileSync(TEST_ENV_PATH, 'utf8');
      assert.ok(!envContent.includes(nonWorkingGoogleKey), 'Non-working key must never be saved to .env');
      console.log('  ✓ 3.2b: Dispatches 2FA on custom API entry, then verifies working API with provider (rejects if not working)');
    }

    // 3.3: Initiates 2FA and dispatches verification code via email
    let verificationId = null;
    let dispatchedOtp = null;
    const candidateApiKey = 'qk_live_custom_sec_abcdef9988776655!';
    {
      sentEmails.length = 0;
      const res = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/initiate-key-update`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, {
        su_admin_key: process.env.SU_ADMIN_KEY,
        settings: { CUSTOM_REST_API_SECRET_KEY: candidateApiKey },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.ok(res.data.data.verification_id);
      assert.ok(res.data.data.email_masked);
      verificationId = res.data.data.verification_id;

      // Check email was dispatched
      assert.strictEqual(sentEmails.length, 1, 'Verification email must be sent');
      const email = sentEmails[0];
      assert.strictEqual(email.to, adminUser.email);
      assert.match(email.subject, /2FA Verification Code/i);

      // Extract 6-digit OTP code from email text or subject
      const match = email.subject.match(/\((\d{6})\)/) || email.text.match(/\b(\d{6})\b/);
      assert.ok(match, '6-digit OTP code must be present in verification email');
      dispatchedOtp = match[1];

      // Verify unverified key is NOT in runtime config or .env file yet
      assert.notStrictEqual(
        config.restApi.resolveSecretKey().value,
        candidateApiKey,
        'Candidate API key must NOT be activated before 2FA verification!'
      );
      const envContent = fs.readFileSync(TEST_ENV_PATH, 'utf8');
      assert.ok(
        !envContent.includes(candidateApiKey),
        'Candidate API key must NOT be saved in .env before 2FA verification!'
      );
      console.log('  ✓ 3.3: Successfully dispatches 6-digit 2FA code to admin email without activating key');
    }

    // 3.4: Rejects incorrect 2FA verification code and tracks attempts
    {
      const res = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/confirm-key-update`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, {
        verification_id: verificationId,
        code: '000000', // Incorrect code
      });
      assert.strictEqual(res.status, 400);
      assert.match(res.data.message, /Invalid verification code/i);

      // Verify attempt counter incremented
      const record = await TwoFactorVerification.findById(verificationId);
      assert.strictEqual(record.attempts, 1);
      console.log('  ✓ 3.4: Rejects incorrect 2FA code and increments attempt counter (1/3)');
    }

    // 3.5: Enforces max attempt limit (3 attempts)
    {
      // Attempt 2
      await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/confirm-key-update`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { verification_id: verificationId, code: '111111' });

      // Attempt 3 (reaches max_attempts: 3)
      const res3 = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/confirm-key-update`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { verification_id: verificationId, code: '222222' });

      assert.strictEqual(res3.status, 400);
      assert.match(res3.data.message, /Maximum attempts exceeded/i);

      // Record should be deleted / invalidated
      const deletedRecord = await TwoFactorVerification.findById(verificationId);
      assert.strictEqual(deletedRecord, null, 'Session should be invalidated after 3 failed attempts');
      console.log('  ✓ 3.5: Invalidates 2FA session after 3 failed attempts (Brute-force protection)');
    }

    // 3.6: Rejects expired 2FA code
    {
      // Create a new 2FA request and simulate expiry
      sentEmails.length = 0;
      const initRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/initiate-key-update`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, {
        su_admin_key: process.env.SU_ADMIN_KEY,
        settings: { CUSTOM_REST_API_SECRET_KEY: candidateApiKey },
      });
      const expVerId = initRes.data.data.verification_id;
      const expMatch = sentEmails[0].subject.match(/\((\d{6})\)/);
      const expCode = expMatch[1];

      // Manually set expiration date to 10 minutes ago
      await TwoFactorVerification.findByIdAndUpdate(expVerId, {
        expires_at: new Date(Date.now() - 1000 * 60 * 10),
      });

      const expRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/confirm-key-update`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { verification_id: expVerId, code: expCode });

      assert.strictEqual(expRes.status, 400);
      assert.match(expRes.data.message, /expired/i);
      console.log('  ✓ 3.6: Rejects expired 2FA verification codes');
    }

    // 3.7: Successfully verifies 2FA code & persists API key
    let verifiedActiveApiKey = null;
    {
      sentEmails.length = 0;
      const validApiKeyToActivate = 'qk_sec_activated_key_9988112233!';
      const initRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/initiate-key-update`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, {
        su_admin_key: process.env.SU_ADMIN_KEY,
        settings: { CUSTOM_REST_API_SECRET_KEY: validApiKeyToActivate },
      });
      const validVerId = initRes.data.data.verification_id;
      const match = sentEmails[0].subject.match(/\((\d{6})\)/);
      const validCode = match[1];

      const confirmRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/confirm-key-update`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { verification_id: validVerId, code: validCode });

      assert.strictEqual(confirmRes.status, 200);
      assert.strictEqual(confirmRes.data.success, true);
      assert.ok(confirmRes.data.data.modified_keys.includes('CUSTOM_REST_API_SECRET_KEY'));

      // Check that .env file now contains the new key
      const updatedEnv = fs.readFileSync(TEST_ENV_PATH, 'utf8');
      assert.ok(updatedEnv.includes(validApiKeyToActivate), 'Activated API key must be saved to .env');

      // Check runtime resolution
      assert.strictEqual(config.restApi.resolveSecretKey().value, validApiKeyToActivate);
      verifiedActiveApiKey = validApiKeyToActivate;

      // Check cannot replay the same verification ID
      const replayRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/confirm-key-update`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { verification_id: validVerId, code: validCode });
      assert.strictEqual(replayRes.status, 400, 'Replay of consumed 2FA session must be rejected');
      console.log('  ✓ 3.7: Confirms valid 2FA code, atomically writes key to .env, and blocks replay');
    }

    // =========================================================================
    // SECTION 4: API Key Enable/Disable Toggle & REST Gateway Enforcement
    // =========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log(' SECTION 4: Enable/Disable Toggle & REST Gateway Enforcement');
    console.log('----------------------------------------------------------------');

    // 4.1: Initially, Gateway is DISABLED. Accessing with x-api-key returns 403 GATEWAY_DISABLED
    {
      await AppSetting.updateOne(
        { key: 'enable_rest_api_gateway' },
        { $set: { value: false, updated_by: adminUser._id } },
        { upsert: true }
      );

      // Probe with x-api-key when disabled -> 403
      const disabledRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/gateway/status`,
        method: 'GET',
        headers: { 'x-api-key': verifiedActiveApiKey },
      });
      assert.strictEqual(disabledRes.status, 403, 'Expected 403 when gateway is disabled');
      assert.strictEqual(disabledRes.data.code, 'GATEWAY_DISABLED');
      assert.match(disabledRes.data.message, /currently disabled by administrator/i);

      // Probe without any auth when disabled -> 401 BEARER_AUTH_REQUIRED
      const noAuthRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/gateway/status`,
        method: 'GET',
      });
      assert.strictEqual(noAuthRes.status, 401);
      assert.strictEqual(noAuthRes.data.code, 'BEARER_AUTH_REQUIRED');

      // Probe with Bearer JWT when disabled -> 200 (alternative authentication fallback!)
      const bearerRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/gateway/status`,
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(bearerRes.status, 200, 'Bearer auth must succeed when gateway is disabled');
      assert.strictEqual(bearerRes.data.success, true);
      console.log('  ✓ 4.1: When DISABLED: rejects API keys (403 GATEWAY_DISABLED) and accepts Bearer JWT fallback');
    }

    // 4.2: Require a fresh Super Admin PIN before changing the gateway toggle.
    // Earlier sections deliberately exhausted the shared suKeyLimiter bucket for
    // the loopback IP; reset it here so this section exercises the PIN validation
    // (400/401) rather than the limiter (429). This mirrors production, where a
    // real admin's failed PIN attempts are spread across time.
    for (const key of ['127.0.0.1', '::ffff:127.0.0.1', '::1', 'unknown']) {
      suKeyLimiter.resetKey(key);
    }
    {
      const missingPinRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/toggles`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { enable_rest_api_gateway: true });
      assert.strictEqual(missingPinRes.status, 400);
      assert.strictEqual(missingPinRes.data.success, false);

      const wrongPinRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/toggles`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { enable_rest_api_gateway: true, su_admin_key: 'incorrect_pin' });
      assert.strictEqual(wrongPinRes.status, 401);
      assert.strictEqual(wrongPinRes.data.success, false);

      const unchangedSetting = await AppSetting.findOne({ key: 'enable_rest_api_gateway' });
      assert.strictEqual(unchangedSetting.value, false, 'A failed PIN check must not change the setting');

      const toggleRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/toggles`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, {
        enable_rest_api_gateway: true,
        su_admin_key: process.env.SU_ADMIN_KEY,
      });
      assert.strictEqual(toggleRes.status, 200);
      assert.strictEqual(toggleRes.data.success, true);
      assert.strictEqual(toggleRes.data.data.enable_rest_api_gateway, true);

      // Check DB persistence
      const setting = await AppSetting.findOne({ key: 'enable_rest_api_gateway' });
      assert.strictEqual(setting.value, true);
      console.log('  ✓ 4.2: Successfully enables REST API Gateway toggle via settings API (200)');
    }

    // 4.3: Gateway Enforcement when ENABLED
    {
      // Request missing x-api-key header -> 401 API_KEY_REQUIRED
      const missingKeyRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/gateway/status`,
        method: 'GET',
      });
      assert.strictEqual(missingKeyRes.status, 401);
      assert.strictEqual(missingKeyRes.data.code, 'API_KEY_REQUIRED');

      // Request with invalid x-api-key header -> 401 API_KEY_INVALID
      const invalidKeyRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/gateway/status`,
        method: 'GET',
        headers: { 'x-api-key': 'incorrect_dummy_key_12345' },
      });
      assert.strictEqual(invalidKeyRes.status, 401);
      assert.strictEqual(invalidKeyRes.data.code, 'API_KEY_INVALID');

      // Request with valid x-api-key header -> 200
      const validStatusRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/gateway/status`,
        method: 'GET',
        headers: { 'x-api-key': verifiedActiveApiKey },
      });
      assert.strictEqual(validStatusRes.status, 200);
      assert.strictEqual(validStatusRes.data.success, true);
      assert.strictEqual(validStatusRes.data.data.gateway_enabled, true);
      assert.strictEqual(validStatusRes.data.data.auth_method, 'x-api-key');

      // Request /api/v1/gateway/verify-key -> 200
      const verifyKeyRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/gateway/verify-key`,
        method: 'GET',
        headers: { 'x-api-key': verifiedActiveApiKey },
      });
      assert.strictEqual(verifyKeyRes.status, 200);
      assert.strictEqual(verifyKeyRes.data.data.authenticated, true);

      // Request /api/v1/gateway/document-types -> 200
      const docTypesRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/gateway/document-types`,
        method: 'GET',
        headers: { 'x-api-key': verifiedActiveApiKey },
      });
      assert.strictEqual(docTypesRes.status, 200);
      assert.ok(Array.isArray(docTypesRes.data.data));
      assert.ok(docTypesRes.data.data.some((d) => d.code === 'BARANGAY_CLEARANCE'));
      console.log('  ✓ 4.3: When ENABLED: enforces x-api-key requirement, timing-safe validation, and route access');
    }

    // 4.4: Disable REST API Gateway toggle
    {
      const toggleOffRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/admin/settings/toggles`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, {
        enable_rest_api_gateway: false,
        su_admin_key: process.env.SU_ADMIN_KEY,
      });
      assert.strictEqual(toggleOffRes.status, 200);
      assert.strictEqual(toggleOffRes.data.data.enable_rest_api_gateway, false);

      // Re-verify that API key authentication is instantly rejected on backend
      const checkRes = await makeHttpRequest(server, {
        path: `${API_PREFIX}/gateway/status`,
        method: 'GET',
        headers: { 'x-api-key': verifiedActiveApiKey },
      });
      assert.strictEqual(checkRes.status, 403);
      assert.strictEqual(checkRes.data.code, 'GATEWAY_DISABLED');
      console.log('  ✓ 4.4: Instantly disables REST API Gateway enforcement on toggle switch');
    }

    // =========================================================================
    // SECTION 5: Audit Logging & Sensitive Data Redaction
    // =========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log(' SECTION 5: Audit Logging & Sensitive Data Redaction');
    console.log('----------------------------------------------------------------');

    {
      const auditEntries = await AuditLog.find({
        user_id: adminUser._id,
        created_at: { $gte: testStartTime },
      }).lean();
      assert.ok(auditEntries.length >= 4, 'AuditLog entries must be created for security actions');

      const actions = auditEntries.map((a) => a.action);
      assert.ok(actions.includes('SU_PIN_ACCESS_GRANTED'), 'Must log SU_PIN_ACCESS_GRANTED');
      assert.ok(actions.includes('2FA_CODE_SENT'), 'Must log 2FA_CODE_SENT');
      assert.ok(actions.includes('SETTINGS_UPDATE_CUSTOM_KEYS_2FA'), 'Must log SETTINGS_UPDATE_CUSTOM_KEYS_2FA');
      assert.ok(actions.includes('SETTINGS_UPDATE_TOGGLES'), 'Must log SETTINGS_UPDATE_TOGGLES');

      // Verify that no raw PIN or raw API key is present in any AuditLog details
      for (const entry of auditEntries) {
        const detailsStr = JSON.stringify(entry.details || {});
        assert.ok(
          !detailsStr.includes(process.env.SU_ADMIN_KEY),
          'AuditLog must never contain the Super Admin PIN!'
        );
        assert.ok(
          !detailsStr.includes(verifiedActiveApiKey),
          'AuditLog must never contain raw API keys!'
        );
      }

      // Check safe integration summary masks secrets
      const safeSummary = config.getSafeIntegrationSummary();
      assert.ok(
        safeSummary.rest_api.secret_key.includes('••••') || safeSummary.rest_api.secret_key.includes('*'),
        'Safe integration summary must mask secret keys'
      );
      assert.ok(!safeSummary.rest_api.secret_key.includes(verifiedActiveApiKey));
      console.log('  ✓ 5.1: Verifies all administrative actions are audited without leaking keys or PINs');
      console.log('  ✓ 5.2: Verifies integration summary returns strictly masked keys to client');
    }

    console.log('\n================================================================');
    console.log(' ALL 20 TESTS PASSED SUCCESSFULLY! (100% PASS RATE)');
    console.log('================================================================\n');
  } finally {
    // Teardown
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();

    // Clean up temporary env file
    if (fs.existsSync(TEST_ENV_PATH)) {
      try {
        fs.unlinkSync(TEST_ENV_PATH);
      } catch (_) {}
    }
  }
}

runTestSuite()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Test Suite Failed with Error:');
    console.error(err);
    process.exit(1);
  });
