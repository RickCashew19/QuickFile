/**
 * Staff voter-status verification integration suite.
 *
 * Verifies that staff holding either can_review_requests or can_prepare_documents
 * can change a resident's voter status (with an audit trail), while staff
 * without either permission and citizens cannot. Never prints passwords/tokens.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const TEST_ENV_PATH = path.resolve(__dirname, 'test_voter_staff.env.tmp');
const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/quickfile_voter_staff_test';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = TEST_MONGO_URI;
process.env.ENV_FILE = TEST_ENV_PATH;
process.env.JWT_SECRET = 'quickfile_voter_staff_jwt_secret_at_least_32';
process.env.SU_ADMIN_KEY = 'su_key_voter_staff_test_12345';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.PUBLIC_APP_URL = 'http://localhost:5173';
process.env.BARANGAY_NAME = 'Barangay Voter Staff';
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
    'JWT_SECRET=quickfile_voter_staff_jwt_secret_at_least_32',
    'SU_ADMIN_KEY=su_key_voter_staff_test_12345',
    'FRONTEND_URL=http://localhost:5173',
    'PUBLIC_APP_URL=http://localhost:5173',
    'BARANGAY_NAME=Barangay Voter Staff',
    'CITY_MUNICIPALITY=Malaybalay',
    'PROVINCE=Bukidnon',
  ].join('\n'),
  'utf8'
);

const app = require('../app');
const { connectDB, disconnectDB } = require('../src/config/db');
const { User, CitizenProfile, StaffPermission, AuditLog } = require('../src/models');
const { API_PREFIX, ROLES } = require('../src/config/constants');

function rawRequest(server, options, bodyObject = null) {
  return new Promise((resolve, reject) => {
    const headers = { ...(options.headers || {}) };
    let bodyBuffer = null;
    if (bodyObject !== null) {
      bodyBuffer = Buffer.from(JSON.stringify(bodyObject), 'utf8');
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyBuffer);
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
          resolve({ status: res.statusCode, data: parsed });
        });
      }
    );
    req.on('error', reject);
    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

function tokenFor(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function run() {
  console.log('=== STAFF VOTER STATUS VERIFICATION SUITE ===\n');
  await connectDB();
  await mongoose.connection.dropDatabase();

  async function makeUser(email, role) {
    return User.create({
      email,
      password_hash: await User.hashPassword('StaffVoterPass@2026'),
      full_name: email.split('@')[0],
      role,
      is_active: true,
    });
  }

  const [reviewer, preparer, unpermitted, citizen] = await Promise.all([
    makeUser('reviewer@staff.test', ROLES.STAFF),
    makeUser('preparer@staff.test', ROLES.STAFF),
    makeUser('unpermitted@staff.test', ROLES.STAFF),
    makeUser('citizen@staff.test', ROLES.CITIZEN),
  ]);

  await StaffPermission.create({ user_id: reviewer._id, can_review_requests: true });
  await StaffPermission.create({ user_id: preparer._id, can_prepare_documents: true });
  await StaffPermission.create({ user_id: unpermitted._id, can_verify_qr: true });

  const profile = await CitizenProfile.create({
    user_id: citizen._id,
    first_name: 'Staff',
    last_name: 'Verified',
    birthdate: new Date('1988-03-12'),
    gender: 'female',
    civil_status: 'single',
    voter_status: 'registered',
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const ok = (label) => console.log('  PASS:', label);
  const voterPath = `${API_PREFIX}/staff/residents/${citizen._id}/voter-status`;
  const call = (user, status) =>
    rawRequest(server, { path: voterPath, method: 'PATCH', headers: { Authorization: `Bearer ${tokenFor(user)}` } }, { voter_status: status });

  try {
    // 1. Reviewer can verify voter status, with an audit trail naming them.
    let res = await call(reviewer, 'unregistered');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.data.voter_status, 'unregistered');
    assert.strictEqual((await CitizenProfile.findById(profile._id)).voter_status, 'unregistered');
    let log = await AuditLog.findOne({ action: 'CITIZEN_VOTER_STATUS_UPDATE' }).sort({ created_at: -1 });
    assert(log && log.user_id.toString() === reviewer._id.toString());
    assert.strictEqual(log.actor_name, reviewer.full_name);
    ok('staff with can_review_requests can update voter status and is recorded in the audit log');

    // 2. Preparer (can_prepare_documents only) can also update (OR permission).
    res = await call(preparer, 'registered');
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await CitizenProfile.findById(profile._id)).voter_status, 'registered');
    ok('staff with can_prepare_documents can update voter status (either permission suffices)');

    // 3. Staff with neither required permission -> 403.
    res = await call(unpermitted, 'unregistered');
    assert.strictEqual(res.status, 403);
    assert.strictEqual((await CitizenProfile.findById(profile._id)).voter_status, 'registered');
    ok('staff without either permission -> 403 and no change');

    // 4. Citizen -> 403 (staff routes reject citizen role before permission check).
    res = await call(citizen, 'unregistered');
    assert.strictEqual(res.status, 403);
    ok('citizen token -> 403');

    // 5. Invalid value -> 400.
    res = await call(reviewer, 'maybe');
    assert.strictEqual(res.status, 400);
    ok('invalid voter_status value -> 400');

    // 6. Unknown citizen -> 404.
    res = await rawRequest(
      server,
      {
        path: `${API_PREFIX}/staff/residents/${new mongoose.Types.ObjectId()}/voter-status`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenFor(reviewer)}` },
      },
      { voter_status: 'registered' }
    );
    assert.strictEqual(res.status, 404);
    ok('unknown resident id -> 404');

    console.log('\n=== ALL STAFF VOTER STATUS TESTS PASSED ===');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
    if (fs.existsSync(TEST_ENV_PATH)) fs.unlinkSync(TEST_ENV_PATH);
  }
}

run().catch((err) => {
  console.error('TEST SUITE FAILED:', err && err.message);
  process.exitCode = 1;
});
