/**
 * Focused regression tests for the security-hardening fixes:
 *  - failed logins are written to AuditLog (without the password)
 *  - password policy is 8..72 characters on register and reset
 *  - verification codes / tracking numbers are redacted from logged URLs
 *  - certificate serial numbers use a cryptographic RNG
 * Isolated DB + temp env; never touches production data or prints real secrets.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const assert = require('assert');
const mongoose = require('mongoose');

const DYNAMIC_SU_ADMIN_KEY = `su_key_${crypto.randomBytes(8).toString('hex')}`;
const DYNAMIC_ADMIN_PASSWORD = `Adm!n_${crypto.randomBytes(8).toString('hex')}`;
const DYNAMIC_STAFF_PASSWORD = `St@ff_${crypto.randomBytes(8).toString('hex')}`;
const DYNAMIC_CITIZEN_PASSWORD = `C!tizen_${crypto.randomBytes(8).toString('hex')}`;

const TEST_ENV_PATH = path.resolve(__dirname, 'test.env.tmp');
const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/quickfile_test';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = TEST_MONGO_URI;
process.env.ENV_FILE = TEST_ENV_PATH;
process.env.SU_ADMIN_KEY = DYNAMIC_SU_ADMIN_KEY;
process.env.JWT_SECRET = 'quickfile_test_isolated_secret_key_2026';
process.env.BARANGAY_NAME = 'Barangay 11';
process.env.CITY_MUNICIPALITY = 'Malaybalay';
process.env.PROVINCE = 'Bukidnon';
process.env.DEFAULT_ADMIN_PASSWORD = DYNAMIC_ADMIN_PASSWORD;
process.env.DEFAULT_STAFF_PASSWORD = DYNAMIC_STAFF_PASSWORD;
process.env.DEFAULT_CITIZEN_PASSWORD = DYNAMIC_CITIZEN_PASSWORD;

fs.writeFileSync(
  TEST_ENV_PATH,
  [
    'PORT=5000',
    'NODE_ENV=test',
    `MONGO_URI=${TEST_MONGO_URI}`,
    'JWT_SECRET=quickfile_test_isolated_secret_key_2026',
    `SU_ADMIN_KEY=${DYNAMIC_SU_ADMIN_KEY}`,
    'BARANGAY_NAME=Barangay 11',
    'CITY_MUNICIPALITY=Malaybalay',
    'PROVINCE=Bukidnon',
    'DEFAULT_GOOGLE_CLIENT_ID=test-google-client-id',
    'DEFAULT_GOOGLE_CLIENT_SECRET=test-google-client-secret',
    'DEFAULT_RECAPTCHA_SITE_KEY=6Lxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'DEFAULT_RECAPTCHA_SECRET_KEY=test-recaptcha-secret-key',
    'DEFAULT_SMS_GATEWAY_URL=test-sms-gateway-url',
    'DEFAULT_SMS_API_TOKEN=test-sms-api-token',
    'DEFAULT_SMTP_HOST=test-smtp-host',
    'DEFAULT_SMTP_USER=test-smtp-user',
    'DEFAULT_SMTP_PASS=test-smtp-pass',
    'DEFAULT_REST_API_SECRET_KEY=test-rest-api-secret-key',
    `DEFAULT_ADMIN_PASSWORD=${DYNAMIC_ADMIN_PASSWORD}`,
    `DEFAULT_STAFF_PASSWORD=${DYNAMIC_STAFF_PASSWORD}`,
    `DEFAULT_CITIZEN_PASSWORD=${DYNAMIC_CITIZEN_PASSWORD}`,
  ].join('\n'),
  'utf8'
);

const app = require('../app');
const { connectDB, disconnectDB } = require('../src/config/db');
const { seedDatabase } = require('../src/helpers/seeder');
const { AuditLog, User, PasswordReset } = require('../src/models');
const { API_PREFIX } = require('../src/config/constants');
const { redactSensitiveUrl } = require('../src/helpers/urlRedactor');

function makeRequest(server, options, postData) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path: options.path,
        method: options.method,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed = data;
          try {
            parsed = JSON.parse(data);
          } catch {}
          resolve({ status: res.statusCode, data: parsed });
        });
      }
    );
    req.on('error', reject);
    if (postData) req.write(JSON.stringify(postData));
    req.end();
  });
}

async function runTests() {
  console.log('====================================================================');
  console.log('   SECURITY HARDENING REGRESSION SUITE (isolated quickfile_test DB)  ');
  console.log('====================================================================\n');

  await connectDB();
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
  await seedDatabase();

  const server = app.listen(0);
  try {
    // 1. URL redaction helper
    assert.strictEqual(
      redactSensitiveUrl('/api/v1/verify/ABC123DEF456'),
      '/api/v1/verify/[REDACTED]'
    );
    assert.strictEqual(
      redactSensitiveUrl('/api/v1/staff/verify/ABC123DEF456'),
      '/api/v1/staff/verify/[REDACTED]'
    );
    assert.strictEqual(
      redactSensitiveUrl('/api/v1/citizen/requests/TRK-2026-ABC/status'),
      '/api/v1/citizen/requests/[REDACTED]/status'
    );
    assert.strictEqual(
      redactSensitiveUrl('/api/v1/health'),
      '/api/v1/health'
    );
    console.log('PASS: 1. sensitive path segments are redacted from logged URLs.\n');

    // 2. Failed login with wrong password is audited without the password
    const beforeWrong = await AuditLog.countDocuments({ action: 'LOGIN_FAILED' });
    const wrongRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/login`, method: 'POST' },
      { email: 'admin@quickfile.gov.ph', password: 'DefinitelyWrong999!' }
    );
    assert.strictEqual(wrongRes.status, 401);
    assert.strictEqual(await AuditLog.countDocuments({ action: 'LOGIN_FAILED' }), beforeWrong + 1);
    const failedLog = await AuditLog.findOne({ action: 'LOGIN_FAILED', 'details.reason': 'invalid_password' });
    assert(failedLog, 'LOGIN_FAILED audit entry must be created');
    assert.strictEqual(failedLog.details.reason, 'invalid_password');
    assert.strictEqual(failedLog.details.email, 'admin@quickfile.gov.ph');
    assert(!JSON.stringify(failedLog.details).includes('DefinitelyWrong999!'), 'password must never be logged');
    console.log('PASS: 2. wrong-password login produced a LOGIN_FAILED audit entry with no password.\n');

    // 3. Unknown email is audited too
    const beforeUnknown = await AuditLog.countDocuments({ action: 'LOGIN_FAILED' });
    const unknownRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/login`, method: 'POST' },
      { email: 'nobody-here@example.gov.ph', password: 'Whatever999!' }
    );
    assert.strictEqual(unknownRes.status, 401);
    assert.strictEqual(await AuditLog.countDocuments({ action: 'LOGIN_FAILED' }), beforeUnknown + 1);
    const unknownLog = await AuditLog.findOne({ action: 'LOGIN_FAILED', 'details.reason': 'unknown_email' });
    assert(unknownLog, 'unknown-email login must be audited');
    assert.strictEqual(unknownLog.details.reason, 'unknown_email');
    console.log('PASS: 3. unknown-email login produced a LOGIN_FAILED audit entry.\n');

    // 4. Password policy: 8 characters minimum on register
    const email = `pwtest.${Date.now()}@example.gov.ph`;
    const shortRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/register`, method: 'POST' },
      {
        email,
        password: 'Short1!',
        first_name: 'Test',
        last_name: 'User',
        birthdate: '1990-01-01',
        gender: 'male',
      }
    );
    assert.strictEqual(shortRes.status, 400);
    assert(/8 and 72/.test(shortRes.data?.message || ''), 'register rejection should mention 8 characters');
    assert.strictEqual(await User.findOne({ email }), null);
    console.log('PASS: 4. registration rejects passwords shorter than 8 characters.\n');

    // 5. Password policy: 8 characters minimum on password reset
    const user = await User.findOne({ email: 'citizen@quickfile.gov.ph' });
    assert(user, 'demo citizen account must exist');
    const pin = '123456';
    await PasswordReset.create({
      email: user.email,
      user_id: user._id,
      token_hash: crypto.createHash('sha256').update(pin + ':' + user.email).digest('hex'),
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
      used: false,
      attempts: 0,
    });
    // Verify the PIN first to obtain a single-use token
    const verifyRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/verify-reset-pin`, method: 'POST' },
      { email: user.email, pin }
    );
    assert.strictEqual(verifyRes.status, 200, 'PIN verification should succeed');
    const resetToken = verifyRes.data?.data?.reset_token;
    const shortResetRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/reset-password`, method: 'POST' },
      { email: user.email, reset_token: resetToken, new_password: 'Short1!' }
    );
    assert.strictEqual(shortResetRes.status, 400);
    assert(/8 and 72/.test(shortResetRes.data?.message || ''), 'reset rejection should mention 8 characters');
    console.log('PASS: 5. password reset rejects passwords shorter than 8 characters.\n');

    // 6. Certificate serial generator still produces a valid, unique-format code
    const { generateUniqueCertificateNumber } = require('../src/helpers/certificateGenerator');
    const serial = await generateUniqueCertificateNumber('brgy-clearance', 2026);
    assert(/^BRGY-BRGY-CLEARANCE-2026-\d{6}$/.test(serial), `unexpected serial format: ${serial}`);
    console.log('PASS: 6. certificate serial generator produced a valid serial.\n');

    console.log('ALL SECURITY HARDENING REGRESSION CHECKS PASSED.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

runTests()
  .then(async () => {
    await disconnectDB();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('SECURITY HARDENING SUITE FAILED:', err);
    try {
      await disconnectDB();
    } catch {}
    process.exit(1);
  });
