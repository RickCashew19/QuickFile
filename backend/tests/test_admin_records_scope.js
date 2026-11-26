/**
 * Admin master records must show every request status; the staff archive
 * endpoint must remain restricted to released/archived requests.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const TEST_ENV_PATH = path.resolve(__dirname, 'test_admin_records.env.tmp');
const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/quickfile_admin_records_test';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = TEST_MONGO_URI;
process.env.ENV_FILE = TEST_ENV_PATH;
process.env.JWT_SECRET = 'quickfile_admin_records_jwt_secret_at_least_32';
process.env.SU_ADMIN_KEY = 'su_key_admin_records_test_12345';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.PUBLIC_APP_URL = 'http://localhost:5173';
process.env.BARANGAY_NAME = 'Barangay Admin Records';
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
    `JWT_SECRET=${process.env.JWT_SECRET}`,
    `SU_ADMIN_KEY=${process.env.SU_ADMIN_KEY}`,
    'FRONTEND_URL=http://localhost:5173',
    'PUBLIC_APP_URL=http://localhost:5173',
    'BARANGAY_NAME=Barangay Admin Records',
    'CITY_MUNICIPALITY=Malaybalay',
    'PROVINCE=Bukidnon',
  ].join('\n'),
  'utf8'
);

const app = require('../app');
const { connectDB, disconnectDB } = require('../src/config/db');
const { User, DocumentType, DocumentRequest } = require('../src/models');
const { API_PREFIX, ROLES, REQUEST_STATUSES } = require('../src/config/constants');
const staffService = require('../src/services/staff.service');

function rawRequest(server, options) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path: options.path,
        method: options.method || 'GET',
        headers: options.headers || {},
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
    req.end();
  });
}

async function run() {
  console.log('=== ADMIN RECORDS SCOPE SUITE ===\n');
  await connectDB();
  await mongoose.connection.dropDatabase();

  const admin = await User.create({
    email: 'admin@records.test',
    password_hash: await User.hashPassword('AdminRecordsPass@2026'),
    full_name: 'Records Admin',
    role: ROLES.ADMIN,
    is_active: true,
  });
  const citizen = await User.create({
    email: 'citizen@records.test',
    password_hash: await User.hashPassword('CitizenRecordsPass@2026'),
    full_name: 'Records Citizen',
    role: ROLES.CITIZEN,
    is_active: true,
  });
  const docType = await DocumentType.create({
    code: 'ADMIN_SCOPE_TEST',
    name: 'Scope Test Clearance',
    fee: 50,
    processing_days: 1,
    is_active: true,
  });

  const createRequest = (status, tag) =>
    DocumentRequest.create({
      tracking_number: `QF-SCOPE-${tag}-${Date.now()}`,
      citizen_id: citizen._id,
      document_type_id: docType._id,
      purpose: 'Admin records scope test',
      copies: 1,
      status,
      fee: 50,
    });

  const pending = await createRequest(REQUEST_STATUSES.PENDING, 'PENDING');
  const inReview = await createRequest(REQUEST_STATUSES.UNDER_REVIEW, 'REVIEW');
  const released = await createRequest(REQUEST_STATUSES.RELEASED, 'RELEASED');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const adminHeaders = {
    Authorization: `Bearer ${jwt.sign({ id: admin._id.toString(), role: admin.role }, process.env.JWT_SECRET, { expiresIn: '1h' })}`,
  };
  const ok = (label) => console.log('  PASS:', label);

  try {
    // 1. No status filter -> every status, not just the staff archive subset.
    const all = await rawRequest(server, {
      path: `${API_PREFIX}/admin/records`,
      method: 'GET',
      headers: adminHeaders,
    });
    assert.strictEqual(all.status, 200);
    const allIds = all.data.data.items.map((r) => r._id.toString());
    for (const req of [pending, inReview, released]) {
      assert(allIds.includes(req._id.toString()), `${req.status} request missing from admin records`);
    }
    ok('GET /admin/records includes pending, under_review and released requests');

    // 2. Explicit filters work for non-archive statuses.
    const filtered = await rawRequest(server, {
      path: `${API_PREFIX}/admin/records?status=pending`,
      method: 'GET',
      headers: adminHeaders,
    });
    assert.strictEqual(filtered.status, 200);
    assert.deepStrictEqual(
      filtered.data.data.items.map((r) => r._id.toString()),
      [pending._id.toString()]
    );
    ok('GET /admin/records?status=pending returns only pending requests');

    const reviewFiltered = await rawRequest(server, {
      path: `${API_PREFIX}/admin/records?status=under_review`,
      method: 'GET',
      headers: adminHeaders,
    });
    assert.strictEqual(reviewFiltered.status, 200);
    assert.deepStrictEqual(
      reviewFiltered.data.data.items.map((r) => r._id.toString()),
      [inReview._id.toString()]
    );
    ok('GET /admin/records?status=under_review returns only under_review requests');

    // 3. Staff archive semantics remain unchanged.
    const staffList = await staffService.listRecords({});
    const staffIds = staffList.items.map((r) => r._id.toString());
    assert(staffIds.includes(released._id.toString()));
    assert(!staffIds.includes(pending._id.toString()));
    assert(!staffIds.includes(inReview._id.toString()));
    ok('staffService.listRecords stays archive-only (released/archived)');

    console.log('\n=== ALL ADMIN RECORDS SCOPE TESTS PASSED ===');
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
