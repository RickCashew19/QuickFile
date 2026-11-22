/**
 * Barangay-managed voter registration status integration suite.
 *
 * Verifies that citizens cannot change their own voter_status via the profile
 * API, while an admin can via PATCH /admin/citizens/:id/voter-status with an
 * audit trail. Never prints passwords or tokens.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const TEST_ENV_PATH = path.resolve(__dirname, 'test_voter_status.env.tmp');
const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/quickfile_voter_status_test';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = TEST_MONGO_URI;
process.env.ENV_FILE = TEST_ENV_PATH;
process.env.JWT_SECRET = 'quickfile_voter_status_jwt_secret_at_least_32';
process.env.SU_ADMIN_KEY = 'su_key_voter_status_test_12345';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.PUBLIC_APP_URL = 'http://localhost:5173';
process.env.BARANGAY_NAME = 'Barangay Voter';
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
    'JWT_SECRET=quickfile_voter_status_jwt_secret_at_least_32',
    'SU_ADMIN_KEY=su_key_voter_status_test_12345',
    'FRONTEND_URL=http://localhost:5173',
    'PUBLIC_APP_URL=http://localhost:5173',
    'BARANGAY_NAME=Barangay Voter',
    'CITY_MUNICIPALITY=Malaybalay',
    'PROVINCE=Bukidnon',
  ].join('\n'),
  'utf8'
);

const app = require('../app');
const { connectDB, disconnectDB } = require('../src/config/db');
const { User, CitizenProfile, AuditLog } = require('../src/models');
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
  console.log('=== VOTER STATUS ADMIN-CONTROLLED SUITE ===\n');
  await connectDB();
  await mongoose.connection.dropDatabase();

  const admin = await User.create({
    email: 'admin@voter.test',
    password_hash: await User.hashPassword('AdminVoterPass@2026'),
    full_name: 'Voter Admin',
    role: ROLES.ADMIN,
    is_active: true,
  });
  const citizen = await User.create({
    email: 'citizen@voter.test',
    password_hash: await User.hashPassword('CitizenVoterPass@2026'),
    full_name: 'Voter Citizen',
    role: ROLES.CITIZEN,
    is_active: true,
  });
  const profile = await CitizenProfile.create({
    user_id: citizen._id,
    first_name: 'Voter',
    last_name: 'Citizen',
    birthdate: new Date('1990-01-01'),
    gender: 'male',
    civil_status: 'single',
    voter_status: 'registered',
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const ok = (label) => console.log('  PASS:', label);
  const citizenHeaders = { Authorization: `Bearer ${tokenFor(citizen)}` };
  const adminHeaders = { Authorization: `Bearer ${tokenFor(admin)}` };
  const voterPath = `${API_PREFIX}/admin/citizens/${citizen._id}/voter-status`;

  try {
    // 1. Citizen profile update cannot change voter_status.
    const citizenUpdate = await rawRequest(
      server,
      { path: `${API_PREFIX}/citizen/profile`, method: 'PUT', headers: citizenHeaders },
      { voter_status: 'unregistered', occupation: 'Engineer' }
    );
    assert.strictEqual(citizenUpdate.status, 200);
    const afterCitizen = await CitizenProfile.findById(profile._id);
    assert.strictEqual(afterCitizen.voter_status, 'registered', 'citizen must not change voter status');
    assert.strictEqual(afterCitizen.occupation, 'Engineer', 'other profile fields still update');
    ok('citizen PUT /profile ignores voter_status but still saves other fields');

    // 2. Admin can change it, with an audit trail.
    const adminUpdate = await rawRequest(
      server,
      { path: voterPath, method: 'PATCH', headers: adminHeaders },
      { voter_status: 'unregistered' }
    );
    assert.strictEqual(adminUpdate.status, 200);
    assert.strictEqual(adminUpdate.data.data.voter_status, 'unregistered');
    const afterAdmin = await CitizenProfile.findById(profile._id);
    assert.strictEqual(afterAdmin.voter_status, 'unregistered');
    const log = await AuditLog.findOne({ action: 'CITIZEN_VOTER_STATUS_UPDATE' });
    assert(log && log.user_id.toString() === admin._id.toString());
    assert.strictEqual(log.details.previous_status, 'registered');
    assert.strictEqual(log.details.voter_status, 'unregistered');
    ok('admin PATCH changes voter_status and writes an audit log with actor + previous value');

    // 3. Invalid value rejected.
    const invalid = await rawRequest(
      server,
      { path: voterPath, method: 'PATCH', headers: adminHeaders },
      { voter_status: 'maybe' }
    );
    assert.strictEqual(invalid.status, 400);
    ok('invalid voter_status value -> 400');

    // 4. Missing citizen -> 404.
    const missing = await rawRequest(
      server,
      { path: `${API_PREFIX}/admin/citizens/${new mongoose.Types.ObjectId()}/voter-status`, method: 'PATCH', headers: adminHeaders },
      { voter_status: 'registered' }
    );
    assert.strictEqual(missing.status, 404);
    ok('unknown citizen id -> 404');

    // 5. Non-admin cannot use the endpoint.
    const forbidden = await rawRequest(
      server,
      { path: voterPath, method: 'PATCH', headers: citizenHeaders },
      { voter_status: 'registered' }
    );
    assert.strictEqual(forbidden.status, 403);
    ok('citizen token on admin endpoint -> 403');

    // 6. Admin can set it back.
    const restored = await rawRequest(
      server,
      { path: voterPath, method: 'PATCH', headers: adminHeaders },
      { voter_status: 'registered' }
    );
    assert.strictEqual(restored.status, 200);
    assert.strictEqual((await CitizenProfile.findById(profile._id)).voter_status, 'registered');
    ok('admin can restore registered status');

    console.log('\n=== ALL VOTER STATUS TESTS PASSED ===');
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
