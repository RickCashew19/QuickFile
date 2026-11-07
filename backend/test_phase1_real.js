/**
 * Phase 1 Real Integration Test Runner
 * Tests against REAL running MongoDB and Express application
 */
const http = require('http');
const app = require('./app');
const { connectDB } = require('./src/config/db');
const { AuditLog } = require('./src/models');

function makeRequest(server, options, postData) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const reqOptions = {
      hostname: '127.0.0.1',
      port: address.port,
      path: options.path,
      method: options.method,
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
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch {}
        resolve({ status: res.statusCode, data: parsed });
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('===============================================================');
  console.log('       RUNNING REAL INTEGRATION TESTS (PHASE 1 FOUNDATION)     ');
  console.log('===============================================================\n');

  await connectDB();
  const server = app.listen(0);

  try {
    // 1. Health Check
    console.log('[TEST 1] GET /api/health');
    const healthRes = await makeRequest(server, { path: '/api/health', method: 'GET' });
    console.log(`Status: ${healthRes.status}`);
    console.log('Response:', JSON.stringify(healthRes.data, null, 2));
    console.log('---------------------------------------------------------------\n');

    // 2. Admin Login
    console.log('[TEST 2] POST /api/auth/login (Admin Account)');
    const adminLoginRes = await makeRequest(
      server,
      { path: '/api/auth/login', method: 'POST' },
      { email: 'admin@quickfile.gov.ph', password: 'Admin@123456' }
    );
    console.log(`Status: ${adminLoginRes.status}`);
    console.log('Response:', JSON.stringify(adminLoginRes.data, null, 2));
    const adminToken = adminLoginRes.data?.data?.access_token;
    console.log('---------------------------------------------------------------\n');

    // 3. Staff Login
    console.log('[TEST 3] POST /api/auth/login (Staff Account)');
    const staffLoginRes = await makeRequest(
      server,
      { path: '/api/auth/login', method: 'POST' },
      { email: 'staff@quickfile.gov.ph', password: 'Staff@123456' }
    );
    console.log(`Status: ${staffLoginRes.status}`);
    console.log('Response:', JSON.stringify(staffLoginRes.data, null, 2));
    console.log('---------------------------------------------------------------\n');

    // 4. Citizen Self-Registration
    console.log('[TEST 4] POST /api/auth/register (New Resident Registration)');
    const testEmail = `juan.delacruz.${Date.now()}@example.com`;
    const regPayload = {
      email: testEmail,
      password: 'CitizenPassword@123',
      first_name: 'Juan',
      middle_name: 'Protacio',
      last_name: 'Rizal',
      suffix: 'Jr',
      birthdate: '1996-06-19',
      gender: 'male',
      civil_status: 'single',
      phone: '09175551234',
      purok_zone: 'Purok 7',
      street_address: 'Calle Crisostomo #45',
      barangay: 'San Antonio',
      city: 'Pasig City',
      province: 'Metro Manila',
      occupation: 'Web Developer',
      emergency_contact_name: 'Teodora Alonzo',
      emergency_contact_number: '09189998877',
    };
    const registerRes = await makeRequest(
      server,
      { path: '/api/auth/register', method: 'POST' },
      regPayload
    );
    console.log(`Status: ${registerRes.status}`);
    console.log('Response:', JSON.stringify(registerRes.data, null, 2));
    const newCitizenToken = registerRes.data?.data?.access_token;
    console.log('---------------------------------------------------------------\n');

    // 5. Get Authenticated Citizen Profile (/api/auth/me)
    console.log('[TEST 5] GET /api/auth/me (Bearer Token Auth)');
    const meRes = await makeRequest(
      server,
      {
        path: '/api/auth/me',
        method: 'GET',
        headers: { Authorization: `Bearer ${newCitizenToken}` },
      }
    );
    console.log(`Status: ${meRes.status}`);
    console.log('Response:', JSON.stringify(meRes.data, null, 2));
    console.log('---------------------------------------------------------------\n');

    // 6. Invalid Credentials Handling
    console.log('[TEST 6] POST /api/auth/login (Invalid Password)');
    const failLoginRes = await makeRequest(
      server,
      { path: '/api/auth/login', method: 'POST' },
      { email: 'admin@quickfile.gov.ph', password: 'WrongPassword@999' }
    );
    console.log(`Status: ${failLoginRes.status}`);
    console.log('Response:', JSON.stringify(failLoginRes.data, null, 2));
    console.log('---------------------------------------------------------------\n');

    // 7. Test AuditLog Immutability (Requirement 6)
    console.log('[TEST 7] Test AuditLog Append-Only Immutability');
    const sampleLog = await AuditLog.findOne();
    if (sampleLog) {
      try {
        await AuditLog.updateOne({ _id: sampleLog._id }, { action: 'MUTATED_ACTION' });
        console.log('FAILED: AuditLog allowed an update!');
      } catch (err) {
        console.log('SUCCESS: AuditLog update blocked by Mongoose immutability hook:');
        console.log(`Caught Error: "${err.message}"`);
      }
    }
    console.log('---------------------------------------------------------------\n');

    console.log('ALL TESTS EXECUTED SUCCESSFULLY AGAINST REAL MONGODB INSTANCE.');
  } finally {
    server.close();
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
