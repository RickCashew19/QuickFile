/**
 * Profile-completeness request gate integration suite.
 *
 * Verifies that a document request is only blocked when the profile values its
 * template actually uses are missing (e.g. a name/age-only template does NOT
 * require an address), that the catalog exposes per-type missing_fields, and
 * that the gate covers creation, editing and staff walk-in requests.
 * Never prints passwords or tokens.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const TEST_ENV_PATH = path.resolve(__dirname, 'test_profile_gate.env.tmp');
const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/quickfile_profile_gate_test';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = TEST_MONGO_URI;
process.env.ENV_FILE = TEST_ENV_PATH;
process.env.JWT_SECRET = 'quickfile_profile_gate_jwt_secret_at_least_32';
process.env.SU_ADMIN_KEY = 'su_key_profile_gate_test_12345';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.PUBLIC_APP_URL = 'http://localhost:5173';
process.env.BARANGAY_NAME = 'Barangay Gate';
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
    'JWT_SECRET=quickfile_profile_gate_jwt_secret_at_least_32',
    'SU_ADMIN_KEY=su_key_profile_gate_test_12345',
    'FRONTEND_URL=http://localhost:5173',
    'PUBLIC_APP_URL=http://localhost:5173',
    'BARANGAY_NAME=Barangay Gate',
    'CITY_MUNICIPALITY=Malaybalay',
    'PROVINCE=Bukidnon',
  ].join('\n'),
  'utf8'
);

const app = require('../app');
const { connectDB, disconnectDB } = require('../src/config/db');
const { User, CitizenProfile, DocumentType, DocumentTemplate, DocumentRequest } = require('../src/models');
const { API_PREFIX, ROLES } = require('../src/config/constants');
const requestService = require('../src/services/request.service');
const staffService = require('../src/services/staff.service');
const citizenService = require('../src/services/citizen.service');

function rawRequest(server, options, bodyBuffer = null) {
  return new Promise((resolve, reject) => {
    const headers = { ...(options.headers || {}) };
    if (bodyBuffer) {
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

function multipartFields(fields, boundary = '----ProfileGateBoundary') {
  let body = '';
  for (const [key, value] of Object.entries(fields)) {
    body += `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`;
  }
  body += `--${boundary}--\r\n`;
  return Buffer.from(body, 'utf8');
}

async function run() {
  console.log('=== PROFILE COMPLETENESS REQUEST GATE SUITE ===\n');
  await connectDB();
  await mongoose.connection.dropDatabase();

  const admin = await User.create({
    email: 'admin@gate.test',
    password_hash: await User.hashPassword('AdminGatePass@2026'),
    full_name: 'Gate Admin',
    role: ROLES.ADMIN,
    is_active: true,
  });
  const citizen = await User.create({
    email: 'citizen@gate.test',
    password_hash: await User.hashPassword('CitizenGatePass@2026'),
    full_name: 'Gate Citizen',
    role: ROLES.CITIZEN,
    is_active: true,
  });
  const profile = await CitizenProfile.create({
    user_id: citizen._id,
    first_name: 'Gate',
    last_name: 'Citizen',
    birthdate: new Date('1995-06-15'),
    gender: 'female',
    civil_status: 'single',
    purok_zone: 'Zone 4',
    street_address: '123 Rizal Street',
    occupation: 'Clerk',
  });

  // Custom template using ONLY name + age -> must not require address.
  const nameAgeType = await DocumentType.create({
    name: 'Age Certification',
    code: 'AGE',
    fee: 0,
    processing_days: 1,
    template_mode: 'custom',
    is_active: true,
  });
  const template = await DocumentTemplate.create({
    document_type_id: nameAgeType._id,
    version: 1,
    original_name: 'minimal.docx',
    stored_filename: 'minimal.docx',
    file_size: 1,
    sha256: 'a'.repeat(64),
    placeholders_found: ['full_name', 'age'],
    uploaded_by: admin._id,
    uploaded_by_name: admin.full_name,
  });
  nameAgeType.active_template_id = template._id;
  await nameAgeType.save();

  // Builtin document type -> always requires address + purok.
  const builtinType = await DocumentType.create({
    name: 'Builtin Clearance',
    code: 'BC',
    fee: 0,
    processing_days: 1,
    template_mode: 'builtin',
    is_active: true,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const ok = (label) => console.log('  PASS:', label);
  const baseReq = {
    citizenUser: citizen,
    purpose: 'Employment requirement',
    copies: 1,
    ipAddress: '127.0.0.1',
    userAgent: 'gate-test',
  };

  try {
    // 1. Name+age template WITH birthdate present, NO address changes -> succeeds.
    let reqDoc = await requestService.createRequest({ ...baseReq, documentTypeId: nameAgeType._id.toString() });
    assert(reqDoc && reqDoc._id);
    ok('custom name/age template: name + birthdate is enough (no address needed)');

    // 2. Same template WITHOUT birthdate -> 409 with Age in missing_fields.
    await CitizenProfile.updateOne({ _id: profile._id }, { $set: { birthdate: null } });
    let threw = null;
    try {
      await requestService.createRequest({ ...baseReq, documentTypeId: nameAgeType._id.toString() });
    } catch (err) { threw = err; }
    assert(threw && threw.statusCode === 409, 'expected 409');
    assert.strictEqual(threw.code, 'MISSING_PROFILE_FIELDS');
    assert(threw.data.missing_fields.some((f) => f.key === 'birthdate' && f.label === 'Age'));
    assert(!threw.data.missing_fields.some((f) => f.key === 'street_address'), 'address must NOT be required');
    ok('missing birthdate -> 409 MISSING_PROFILE_FIELDS with only Age listed');

    // 3. Builtin type with full profile -> succeeds.
    await CitizenProfile.updateOne({ _id: profile._id }, { $set: { birthdate: new Date('1995-06-15') } });
    reqDoc = await requestService.createRequest({ ...baseReq, documentTypeId: builtinType._id.toString() });
    assert(reqDoc && reqDoc._id);
    ok('builtin type with complete address -> succeeds');

    // 4. Builtin type with missing address -> 409 listing Address + Purok.
    await CitizenProfile.updateOne({ _id: profile._id }, { $set: { street_address: '', purok_zone: '' } });
    threw = null;
    try {
      await requestService.createRequest({ ...baseReq, documentTypeId: builtinType._id.toString() });
    } catch (err) { threw = err; }
    assert(threw && threw.code === 'MISSING_PROFILE_FIELDS');
    assert(threw.data.missing_fields.some((f) => f.key === 'street_address'));
    assert(threw.data.missing_fields.some((f) => f.key === 'purok_zone'));
    ok('builtin type with missing address/purok -> 409 listing both');

    // 5. Walk-in path uses the same gate.
    threw = null;
    try {
      await staffService.createWalkInRequest({
        citizen_id: citizen._id,
        document_type_id: builtinType._id.toString(),
        purpose: 'Walk-in request',
        copies: 1,
        actorUser: admin,
        ipAddress: '127.0.0.1',
        userAgent: 'gate-test',
      });
    } catch (err) { threw = err; }
    assert(threw && threw.code === 'MISSING_PROFILE_FIELDS');
    ok('staff walk-in request blocked by the same gate');

    // 6. Catalog exposes missing_fields per document type (after restoring profile).
    await CitizenProfile.updateOne(
      { _id: profile._id },
      { $set: { street_address: '123 Rizal Street', purok_zone: 'Zone 4' } }
    );
    const catalog = await citizenService.getActiveCatalog(citizen._id);
    const catAge = catalog.find((d) => d.code === 'AGE');
    const catBuiltin = catalog.find((d) => d.code === 'BC');
    assert(catAge && Array.isArray(catAge.missing_fields) && catAge.missing_fields.length === 0);
    assert(catBuiltin && catBuiltin.missing_fields.length === 0);
    await CitizenProfile.updateOne({ _id: profile._id }, { $set: { street_address: '' } });
    const catalog2 = await citizenService.getActiveCatalog(citizen._id);
    const catBuiltin2 = catalog2.find((d) => d.code === 'BC');
    assert(catBuiltin2.missing_fields.some((f) => f.key === 'street_address'));
    assert(catalog2.find((d) => d.code === 'AGE').missing_fields.length === 0);
    ok('catalog returns per-type missing_fields (age-only type unaffected by missing address)');

    // 7. HTTP-level: 409 response carries machine-readable code + data.
    const token = jwt.sign(
      { id: citizen._id.toString(), role: ROLES.CITIZEN, email: citizen.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const boundary = '----ProfileGateHttpBoundary';
    const body = multipartFields(
      {
        document_type_id: builtinType._id.toString(),
        purpose: 'HTTP gate check',
        copies: '1',
      },
      boundary
    );
    const res = await rawRequest(
      server,
      {
        path: `${API_PREFIX}/citizen/requests`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
      },
      body
    );
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.data.code, 'MISSING_PROFILE_FIELDS');
    assert(Array.isArray(res.data.data.missing_fields));
    ok('HTTP POST /citizen/requests -> 409 with code + missing_fields in response body');

    // 8. Editing a pending request is gated too.
    const pending = await DocumentRequest.findOne({ citizen_id: citizen._id, document_type_id: builtinType._id });
    assert(pending && pending.status === 'pending');
    await CitizenProfile.updateOne({ _id: profile._id }, { $set: { street_address: '', purok_zone: '' } });
    threw = null;
    try {
      await requestService.updateCitizenRequest({
        citizenId: citizen._id,
        trackingNumber: pending.tracking_number,
        purpose: 'Edited purpose',
        copies: 2,
      });
    } catch (err) { threw = err; }
    assert(threw && threw.code === 'MISSING_PROFILE_FIELDS');
    ok('editing a pending request is blocked when profile values are missing');

    console.log('\n=== ALL PROFILE GATE TESTS PASSED ===');
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
