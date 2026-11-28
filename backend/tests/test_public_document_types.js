/**
 * Public landing-page catalog must expose only active document types and no
 * internal/admin-only metadata. No authentication is required.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const mongoose = require('mongoose');

const TEST_ENV_PATH = path.resolve(__dirname, 'test_public_doc_types.env.tmp');
const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/quickfile_public_doc_types_test';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = TEST_MONGO_URI;
process.env.ENV_FILE = TEST_ENV_PATH;
process.env.JWT_SECRET = 'quickfile_public_doc_types_jwt_secret_32';
process.env.SU_ADMIN_KEY = 'su_key_public_doc_types_test_12345';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.PUBLIC_APP_URL = 'http://localhost:5173';
process.env.BARANGAY_NAME = 'Barangay Public Docs';
process.env.CITY_MUNICIPALITY = 'Malaybalay';
process.env.PROVINCE = 'Bukidnon';
process.env.APP_TIMEZONE_OFFSET_MINUTES = '480';

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
    'BARANGAY_NAME=Barangay Public Docs',
    'CITY_MUNICIPALITY=Malaybalay',
    'PROVINCE=Bukidnon',
  ].join('\n'),
  'utf8'
);

const app = require('../app');
const { connectDB, disconnectDB } = require('../src/config/db');
const { DocumentType } = require('../src/models');
const { API_PREFIX } = require('../src/config/constants');

function rawRequest(server, requestPath) {
  return new Promise((resolve, reject) => {
    http
      .get(
        { hostname: '127.0.0.1', port: server.address().port, path: requestPath },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            let parsed = data;
            try {
              parsed = JSON.parse(data);
            } catch {}
            resolve({ status: res.statusCode, headers: res.headers, data: parsed });
          });
        }
      )
      .on('error', reject);
  });
}

async function run() {
  console.log('=== PUBLIC DOCUMENT TYPES SUITE ===\n');
  await connectDB();
  await mongoose.connection.dropDatabase();

  const active = await DocumentType.create({
    code: 'BC',
    name: 'Barangay Clearance',
    description: 'Employment clearance',
    fee: 50,
    processing_days: 1,
    requirements: ['Valid ID'],
    is_active: true,
  });
  await DocumentType.create({
    code: 'INDIGENCY',
    name: 'Certificate of Indigency',
    description: 'Medical and social aid',
    fee: 0,
    processing_days: 2,
    is_active: false,
  });
  const secondActive = await DocumentType.create({
    code: 'RESIDENCY',
    name: 'Certificate of Residency',
    description: 'Proof of residency',
    fee: 50,
    processing_days: 1,
    is_active: true,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const ok = (label) => console.log('  PASS:', label);

  try {
    const res = await rawRequest(server, `${API_PREFIX}/public/document-types`);
    assert.strictEqual(res.status, 200, 'public catalog must not require authentication');
    assert.strictEqual(res.headers['cache-control'], 'private, no-store');
    assert.strictEqual(res.data.success, true);

    const items = res.data.data;
    assert(Array.isArray(items));
    assert.deepStrictEqual(
      items.map((d) => d._id.toString()),
      [active._id.toString(), secondActive._id.toString()],
      'only active types are returned, sorted by name'
    );

    for (const item of items) {
      for (const hidden of [
        'is_active',
        'template_mode',
        'active_template_id',
        'created_at',
        'updated_at',
        '__v',
      ]) {
        assert(!Object.prototype.hasOwnProperty.call(item, hidden), `${hidden} leaked publicly`);
      }
      assert.strictEqual(typeof item.name, 'string');
      assert.strictEqual(typeof item.code, 'string');
      assert.strictEqual(item.code, item.code.toUpperCase());
      assert(Array.isArray(item.requirements));
    }
    ok('GET /public/document-types returns active types only, sorted, without internal fields');
    ok('public catalog is served with private, no-store caching');

    console.log('\n=== ALL PUBLIC DOCUMENT TYPE TESTS PASSED ===');
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
