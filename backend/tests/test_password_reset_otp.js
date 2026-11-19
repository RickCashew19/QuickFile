/**
 * Comprehensive Password Reset (Email OTP) integration suite.
 *
 * Covers: generic anti-enumeration responses, cryptographically stored OTP,
 * correct/incorrect/expired/reused OTP, attempt limit, resend cooldown & limit,
 * password policy (match handled in UI; weak/compromised rejected here),
 * single-use reset token, and that login still works after a successful reset.
 * Never prints OTPs, tokens, or passwords.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const crypto = require('crypto');

const TEST_ENV_PATH = path.resolve(__dirname, 'test_password_reset_otp.env.tmp');
const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/quickfile_reset_otp_test';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = TEST_MONGO_URI;
process.env.ENV_FILE = TEST_ENV_PATH;
process.env.JWT_SECRET = 'quickfile_reset_otp_jwt_secret_at_least_32_chars';
process.env.SU_ADMIN_KEY = 'su_key_reset_otp_test_12345';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.PUBLIC_APP_URL = 'http://localhost:5173';
process.env.BARANGAY_NAME = 'Barangay OTP';
process.env.CITY_MUNICIPALITY = 'Malaybalay';
process.env.PROVINCE = 'Bukidnon';
process.env.APP_TIMEZONE_OFFSET_MINUTES = '480';
process.env.CERTIFICATE_VALIDITY_DAYS = '180';

fs.writeFileSync(
  TEST_ENV_PATH,
  [
    'PORT=5000',
    'NODE_ENV=test',
    `MONGO_URI=${TEST_MONGO_URI}`,
    'JWT_SECRET=quickfile_reset_otp_jwt_secret_at_least_32_chars',
    'SU_ADMIN_KEY=su_key_reset_otp_test_12345',
    'FRONTEND_URL=http://localhost:5173',
    'PUBLIC_APP_URL=http://localhost:5173',
    'BARANGAY_NAME=Barangay OTP',
    'CITY_MUNICIPALITY=Malaybalay',
    'PROVINCE=Bukidnon',
  ].join('\n'),
  'utf8'
);

const mongoose = require('mongoose');
const app = require('../app');
const { connectDB, disconnectDB } = require('../src/config/db');
const { User, PasswordReset, CitizenProfile } = require('../src/models');
const { API_PREFIX, ROLES, PASSWORD_RESET } = require('../src/config/constants');
const { setMailTransport } = require('../src/helpers/mailer');
const {
  forgotPasswordIpLimiter,
  forgotPasswordEmailLimiter,
  resendOtpLimiter,
  resetPasswordLimiter,
} = require('../src/middlewares/rateLimiter.middleware');

let sentEmails = [];
setMailTransport({
  sendMail: async (mail) => {
    sentEmails.push(mail);
    return { messageId: 'mock-' + Date.now() };
  },
});

function resetLimiters() {
  for (const limiter of [forgotPasswordIpLimiter, forgotPasswordEmailLimiter, resendOtpLimiter, resetPasswordLimiter]) {
    for (const key of ['127.0.0.1', '::ffff:127.0.0.1', '::1', 'unknown', CITIZEN_EMAIL, 'no.such@email.test']) {
      try { limiter.resetKey(key); } catch {}
    }
  }
}

function request(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const headers = { ...(options.headers || {}) };
    if (postData) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(postData);
    }
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path: options.path,
        method: options.method || 'GET',
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let parsed = data;
          try { parsed = JSON.parse(data); } catch {}
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        });
      }
    );
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

const CITIZEN_EMAIL = 'reset.citizen@quickfile.gov.ph';
const CITIZEN_PASSWORD = 'CitizenResetPass@2026';

/** Extract the latest OTP from captured reset emails (never logged). */
function latestOtp() {
  const mail = sentEmails.filter((m) => /Verification Code/i.test(m.subject || '')).pop();
  if (!mail) return null;
  const match = (mail.subject || '').match(/\((\d{6})\)/);
  return match ? match[1] : null;
}

async function run() {
  console.log('=== PASSWORD RESET OTP SUITE ===\n');
  await connectDB();
  await mongoose.connection.dropDatabase();

  const citizen = await User.create({
    email: CITIZEN_EMAIL,
    password_hash: await User.hashPassword(CITIZEN_PASSWORD),
    full_name: 'Reset Citizen',
    role: ROLES.CITIZEN,
    is_active: true,
  });
  await CitizenProfile.create({
    user_id: citizen._id,
    first_name: 'Reset',
    last_name: 'Citizen',
    birthdate: new Date('1990-01-01'),
    gender: 'male',
    civil_status: 'single',
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = (p) => `${API_PREFIX}/auth${p}`;
  const ok = (label) => console.log('  PASS:', label);

  try {
    // 1. Invalid email format -> 400
    resetLimiters();
    let r = await request(server, { path: base('/forgot-password'), method: 'POST' }, { email: 'not-an-email' });
    assert.strictEqual(r.status, 400);
    ok('invalid email format rejected (400)');

    // 2. Nonexistent email -> generic 200 (no email sent)
    resetLimiters();
    sentEmails = [];
    r = await request(server, { path: base('/forgot-password'), method: 'POST' }, { email: 'no.such@email.test' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.message, PASSWORD_RESET.GENERIC_RESPONSE);
    await new Promise((res) => setTimeout(res, 100));
    assert.strictEqual(sentEmails.length, 0, 'no email for unknown account');
    ok('nonexistent email -> identical generic 200, no email sent');

    // 3. Registered email -> generic 200, email sent, only hash stored, 5-min TTL
    resetLimiters();
    sentEmails = [];
    r = await request(server, { path: base('/forgot-password'), method: 'POST' }, { email: CITIZEN_EMAIL });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.message, PASSWORD_RESET.GENERIC_RESPONSE);
    await new Promise((res) => setTimeout(res, 100));
    assert.strictEqual(sentEmails.length, 1, 'one OTP email sent');
    const otp = latestOtp();
    assert(otp && /^\d{6}$/.test(otp));
    const rec = await PasswordReset.findOne({ email: CITIZEN_EMAIL, used: false });
    assert(rec && rec.token_hash && rec.token_hash.length === 64);
    assert(!JSON.stringify(rec).includes(otp), 'raw OTP never stored');
    const ttlMs = rec.expires_at.getTime() - rec.created_at.getTime();
    assert(Math.abs(ttlMs - PASSWORD_RESET.OTP_TTL_MS) < 2000, `OTP TTL should be 5 min, got ${ttlMs}ms`);
    ok('registered email -> generic 200, hashed OTP stored with 5-minute TTL');

    // 4. Reset without verification -> 400
    r = await request(server, { path: base('/reset-password'), method: 'POST' }, {
      email: CITIZEN_EMAIL, reset_token: 'x'.repeat(64), new_password: 'BrandNewPass@2026',
    });
    assert.strictEqual(r.status, 400);
    ok('reset without prior verification rejected');

    // 5. Wrong OTP -> exact invalid message, attempts tracked
    r = await request(server, { path: base('/verify-reset-otp'), method: 'POST' }, {
      email: CITIZEN_EMAIL, otp: otp === '000000' ? '111111' : '000000',
    });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.data.message, PASSWORD_RESET.INVALID_OTP_MESSAGE);
    ok('incorrect OTP -> "Invalid verification code. Please try again."');

    // 6. Correct OTP -> short-lived single-use token (never returns the OTP)
    r = await request(server, { path: base('/verify-reset-otp'), method: 'POST' }, { email: CITIZEN_EMAIL, otp });
    assert.strictEqual(r.status, 200, r.data.message);
    const resetToken = r.data.data.reset_token;
    assert(resetToken && resetToken.length >= 32);
    assert(!JSON.stringify(r.data).includes(otp), 'OTP never exposed in response');
    ok('correct OTP -> single-use reset token issued, OTP never exposed');

    // 7. Weak / compromised password rejected
    r = await request(server, { path: base('/reset-password'), method: 'POST' }, {
      email: CITIZEN_EMAIL, reset_token: resetToken, new_password: 'short',
    });
    assert.strictEqual(r.status, 400);
    r = await request(server, { path: base('/reset-password'), method: 'POST' }, {
      email: CITIZEN_EMAIL, reset_token: resetToken, new_password: 'password123',
    });
    assert.strictEqual(r.status, 400);
    assert(/common/i.test(r.data.message));
    ok('weak and compromised passwords rejected');

    // 8. Successful reset with strong password
    const NEW_PASS = 'SecureNewPass@2026';
    r = await request(server, { path: base('/reset-password'), method: 'POST' }, {
      email: CITIZEN_EMAIL, reset_token: resetToken, new_password: NEW_PASS,
    });
    assert.strictEqual(r.status, 200, r.data.message);
    ok('valid reset token + strong password -> 200');

    // 9. Reset token reuse -> 400 (single-use)
    r = await request(server, { path: base('/reset-password'), method: 'POST' }, {
      email: CITIZEN_EMAIL, reset_token: resetToken, new_password: 'AnotherPass@2026',
    });
    assert.strictEqual(r.status, 400);
    ok('reset token cannot be reused');

    // 10. Login with new password works; old password fails
    r = await request(server, { path: base('/login'), method: 'POST' }, { email: CITIZEN_EMAIL, password: NEW_PASS });
    assert.strictEqual(r.status, 200);
    r = await request(server, { path: base('/login'), method: 'POST' }, { email: CITIZEN_EMAIL, password: CITIZEN_PASSWORD });
    assert.strictEqual(r.status, 401);
    ok('login works with new password, old password rejected');

    // 11. OTP attempt limit: 5 wrong attempts then invalidated
    resetLimiters();
    sentEmails = [];
    await request(server, { path: base('/forgot-password'), method: 'POST' }, { email: CITIZEN_EMAIL });
    await new Promise((res) => setTimeout(res, 100));
    const otp2 = latestOtp();
    const wrong = otp2 === '999999' ? '888888' : '999999';
    for (let i = 0; i < PASSWORD_RESET.MAX_OTP_ATTEMPTS; i++) {
      await request(server, { path: base('/verify-reset-otp'), method: 'POST' }, { email: CITIZEN_EMAIL, otp: wrong });
    }
    r = await request(server, { path: base('/verify-reset-otp'), method: 'POST' }, { email: CITIZEN_EMAIL, otp: otp2 });
    assert.strictEqual(r.status, 400, 'OTP invalidated after 5 failed attempts');
    ok('OTP invalidated after maximum 5 attempts');

    // 12. Expired OTP -> dedicated message
    resetLimiters();
    const expRec = await PasswordReset.create({
      user_id: citizen._id,
      email: CITIZEN_EMAIL,
      token_hash: crypto.createHash('sha256').update('123456:' + CITIZEN_EMAIL).digest('hex'),
      attempts: 0,
      expires_at: new Date(Date.now() - 1000),
      used: false,
    });
    assert(expRec);
    r = await request(server, { path: base('/verify-reset-otp'), method: 'POST' }, { email: CITIZEN_EMAIL, otp: '123456' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.data.message, PASSWORD_RESET.EXPIRED_OTP_MESSAGE);
    ok('expired OTP -> "Your verification code has expired..."');

    // 13. Resend cooldown -> 429 with Retry-After
    resetLimiters();
    sentEmails = [];
    await request(server, { path: base('/forgot-password'), method: 'POST' }, { email: CITIZEN_EMAIL });
    await new Promise((res) => setTimeout(res, 100));
    r = await request(server, { path: base('/resend-reset-otp'), method: 'POST' }, { email: CITIZEN_EMAIL });
    assert.strictEqual(r.status, 429, 'resend within 60s must be blocked');
    assert(r.headers['retry-after'], 'Retry-After header present');
    ok('resend within 60s -> 429 with Retry-After');

    // 14. Resend for unknown email -> same generic 200 (no enumeration)
    resetLimiters();
    r = await request(server, { path: base('/resend-reset-otp'), method: 'POST' }, { email: 'no.such@email.test' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.message, PASSWORD_RESET.GENERIC_RESPONSE);
    ok('resend unknown email -> identical generic 200');

    // 15. Resend invalidates previous OTP
    resetLimiters();
    const before = await PasswordReset.countDocuments({ user_id: citizen._id });
    // wait out cooldown by backdating all this user's records (the cooldown
    // checks the most recent send for the account)
    await PasswordReset.collection.updateMany(
      { user_id: citizen._id },
      { $set: { created_at: new Date(Date.now() - 61000) } }
    );
    sentEmails = [];
    r = await request(server, { path: base('/resend-reset-otp'), method: 'POST' }, { email: CITIZEN_EMAIL });
    assert.strictEqual(r.status, 200);
    await new Promise((res) => setTimeout(res, 100));
    const after = await PasswordReset.countDocuments({ user_id: citizen._id });
    assert(after === before + 1, 'new OTP record created');
    const unused = await PasswordReset.countDocuments({ user_id: citizen._id, used: false });
    assert.strictEqual(unused, 1, 'exactly one active OTP');
    ok('resend invalidates previous OTP and issues a fresh one');

    console.log('\n=== ALL PASSWORD RESET OTP TESTS PASSED ===');
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
    if (fs.existsSync(TEST_ENV_PATH)) fs.unlinkSync(TEST_ENV_PATH);
  }
}

run().catch((err) => {
  console.error('TEST SUITE FAILED:', err && err.message);
  process.exitCode = 1;
});
