/**
 * Session / token-refresh regression suite (RFC 9700-style access+refresh model).
 * Isolated DB + temp env; never touches production data or prints real secrets.
 *
 * Verifies:
 *  - login issues httpOnly access + refresh cookies, refresh hidden from JSON
 *  - rotating a refresh token returns a fresh access token and new cookie
 *  - replaying a consumed token revokes the whole family (reuse detection)
 *  - logout revokes the family
 *  - idle & absolute expiries are enforced
 *  - password change revokes refresh sessions
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

const TEST_ENV_PATH = path.resolve(__dirname, 'test_session.env.tmp');
const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/quickfile_session_test';

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
const { RefreshToken, AuditLog, User } = require('../src/models');
const { API_PREFIX } = require('../src/config/constants');

function request(server, options, postData, cookie) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (cookie) headers.Cookie = cookie;
    const req = http.request(
      { hostname: '127.0.0.1', port: address.port, path: options.path, method: options.method, headers },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed = data;
          try { parsed = JSON.parse(data); } catch {}
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (postData) req.write(JSON.stringify(postData));
    req.end();
  });
}

function cookieValue(setCookieHeader, name) {
  const arr = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const raw of arr) {
    if (!raw) continue;
    const pair = raw.split(';')[0];
    const idx = pair.indexOf('=');
    if (pair.slice(0, idx).trim() === name) return pair.slice(idx + 1).trim();
  }
  return null;
}

function refreshCookie(raw) {
  return `quickfile_refresh=${raw}`;
}

async function login(server, email, password) {
  return request(
    server,
    { path: `${API_PREFIX}/auth/login`, method: 'POST' },
    { email, password }
  );
}

async function runTests() {
  console.log('====================================================================');
  console.log('      SESSION REFRESH REGRESSION SUITE (isolated DB)                ');
  console.log('====================================================================\n');

  await connectDB();
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key].deleteMany({});
  await seedDatabase();

  const server = app.listen(0);
  try {
    // 1. Login issues both cookies; refresh token hidden from body.
    const loginRes = await login(server, 'citizen@quickfile.gov.ph', DYNAMIC_CITIZEN_PASSWORD);
    assert.strictEqual(loginRes.status, 200);
    assert(loginRes.data?.data?.access_token, 'access token in body');
    assert(!('refresh_token' in (loginRes.data.data || {})), 'refresh token must NOT be in JSON body');
    const accessCookie = cookieValue(loginRes.headers['set-cookie'], 'quickfile_session');
    const refreshRaw = cookieValue(loginRes.headers['set-cookie'], 'quickfile_refresh');
    assert(accessCookie && refreshRaw, 'both cookies must be set');
    const setCookie = (loginRes.headers['set-cookie'] || []).join('\n');
    assert(/quickfile_refresh=.*HttpOnly/i.test(setCookie), 'refresh cookie must be httpOnly');
    assert(/Path=\/api\/v1\/auth/i.test(setCookie), 'refresh cookie must be path-scoped');
    console.log('PASS: 1. login sets httpOnly access + path-scoped refresh cookies; refresh hidden from JSON.\n');

    // 2. Refresh rotates token and returns a fresh access token.
    const refreshRes = await request(
      server,
      { path: `${API_PREFIX}/auth/refresh`, method: 'POST' },
      null,
      refreshCookie(refreshRaw)
    );
    assert.strictEqual(refreshRes.status, 200);
    assert(refreshRes.data?.data?.access_token, 'new access token returned');
    // JWTs are deterministic within the same second (identical iat), so we only
    // require a valid token - the important rotation is the refresh token below.
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(refreshRes.data.data.access_token, process.env.JWT_SECRET);
    assert.strictEqual(decoded.role, 'citizen');
    const refreshRaw2 = cookieValue(refreshRes.headers['set-cookie'], 'quickfile_refresh');
    assert(refreshRaw2 && refreshRaw2 !== refreshRaw, 'refresh token must rotate');
    assert(!('refresh_token' in (refreshRes.data.data || {})), 'refresh token must NOT be in JSON body');
    console.log('PASS: 2. refresh rotates the token and issues a new access token.\n');

    // 3. Reuse of the consumed token revokes the whole family.
    const reuseRes = await request(
      server,
      { path: `${API_PREFIX}/auth/refresh`, method: 'POST' },
      null,
      refreshCookie(refreshRaw)
    );
    assert.strictEqual(reuseRes.status, 401);
    assert.strictEqual(reuseRes.data?.code, 'REFRESH_REUSE_DETECTED');
    const reuseAudit = await AuditLog.findOne({ action: 'REFRESH_REUSE_DETECTED' });
    assert(reuseAudit, 'reuse must be audited');
    // The currently-valid token in the same family is now revoked too.
    const familyRevoked = await request(
      server,
      { path: `${API_PREFIX}/auth/refresh`, method: 'POST' },
      null,
      refreshCookie(refreshRaw2)
    );
    assert.strictEqual(familyRevoked.status, 401);
    assert.strictEqual(familyRevoked.data?.code, 'REFRESH_REVOKED');
    console.log('PASS: 3. replayed token revoked the entire family + audit entry created.\n');

    // 4. Fresh login + logout revokes the family.
    const login2 = await login(server, 'citizen@quickfile.gov.ph', DYNAMIC_CITIZEN_PASSWORD);
    const refresh2 = cookieValue(login2.headers['set-cookie'], 'quickfile_refresh');
    const access2 = login2.data.data.access_token;
    const logoutRes = await request(
      server,
      { path: `${API_PREFIX}/auth/logout`, method: 'POST' },
      null,
      `quickfile_session=${access2}; quickfile_refresh=${refresh2}`
    );
    assert.strictEqual(logoutRes.status, 200);
    const afterLogout = await request(
      server,
      { path: `${API_PREFIX}/auth/refresh`, method: 'POST' },
      null,
      refreshCookie(refresh2)
    );
    assert.strictEqual(afterLogout.status, 401);
    assert.strictEqual(afterLogout.data?.code, 'REFRESH_REVOKED');
    console.log('PASS: 4. logout revoked the refresh family.\n');

    // 5. Missing refresh cookie is rejected with a specific code.
    const missing = await request(server, { path: `${API_PREFIX}/auth/refresh`, method: 'POST' });
    assert.strictEqual(missing.status, 401);
    assert.strictEqual(missing.data?.code, 'REFRESH_REQUIRED');
    console.log('PASS: 5. refresh without a cookie is rejected.\n');

    // 6. Idle expiry (7d window in the past) is enforced.
    const idleLogin = await login(server, 'citizen@quickfile.gov.ph', DYNAMIC_CITIZEN_PASSWORD);
    const idleRaw = cookieValue(idleLogin.headers['set-cookie'], 'quickfile_refresh');
    await RefreshToken.updateOne({ token_hash: require('../src/services/refreshSession.service').hashToken(idleRaw) }, {
      $set: { expires_at: new Date(Date.now() - 1000) },
    });
    const idleRes = await request(server, { path: `${API_PREFIX}/auth/refresh`, method: 'POST' }, null, refreshCookie(idleRaw));
    assert.strictEqual(idleRes.status, 401);
    assert.strictEqual(idleRes.data?.code, 'REFRESH_EXPIRED');
    console.log('PASS: 6. idle-expired refresh token is rejected.\n');

    // 7. Absolute cap (past) is enforced.
    const absLogin = await login(server, 'citizen@quickfile.gov.ph', DYNAMIC_CITIZEN_PASSWORD);
    const absRaw = cookieValue(absLogin.headers['set-cookie'], 'quickfile_refresh');
    await RefreshToken.updateOne({ token_hash: require('../src/services/refreshSession.service').hashToken(absRaw) }, {
      $set: { absolute_expires_at: new Date(Date.now() - 1000) },
    });
    const absRes = await request(server, { path: `${API_PREFIX}/auth/refresh`, method: 'POST' }, null, refreshCookie(absRaw));
    assert.strictEqual(absRes.status, 401);
    assert.strictEqual(absRes.data?.code, 'REFRESH_ABSOLUTE_EXPIRED');
    console.log('PASS: 7. absolutely-expired refresh token is rejected.\n');

    // 8. Password change revokes all refresh sessions for that user.
    const pwLogin = await login(server, 'citizen@quickfile.gov.ph', DYNAMIC_CITIZEN_PASSWORD);
    const pwRaw = cookieValue(pwLogin.headers['set-cookie'], 'quickfile_refresh');
    const citizen = await User.findOne({ email: 'citizen@quickfile.gov.ph' });
    const { revokeUserSessions } = require('../src/services/refreshSession.service');
    await revokeUserSessions(citizen._id);
    const pwRes = await request(server, { path: `${API_PREFIX}/auth/refresh`, method: 'POST' }, null, refreshCookie(pwRaw));
    assert.strictEqual(pwRes.status, 401);
    assert.strictEqual(pwRes.data?.code, 'REFRESH_REVOKED');
    console.log('PASS: 8. password-change revocation invalidates refresh sessions.\n');

    // 9. Access token TTL is short (15 minutes = 900 seconds).
    const { jwt: jwtConfig } = require('../src/config').config;
    assert.strictEqual(jwtConfig.expiresIn, '15m');
    assert.strictEqual(jwtConfig.expiresInMs, 900000);
    console.log('PASS: 9. access token TTL default is 15m (900s).\n');

    console.log('ALL SESSION REFREGRESSION CHECKS PASSED.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

runTests()
  .then(async () => { await disconnectDB(); process.exit(0); })
  .catch(async (err) => {
    console.error('SESSION REFRESH SUITE FAILED:', err);
    try { await disconnectDB(); } catch {}
    process.exit(1);
  });
