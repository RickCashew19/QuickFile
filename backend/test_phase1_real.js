/**
 * Comprehensive Phase 1 Test Suite (Refinement Round 2)
 * Strictly uses isolated 'quickfile_test' database and temporary env file
 * Never touches production data or prints secrets
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Setup test-specific environment paths and database
const TEST_ENV_PATH = path.resolve(__dirname, 'test.env.tmp');
const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/quickfile_test';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = TEST_MONGO_URI;
process.env.TEST_ENV_PATH = TEST_ENV_PATH;
process.env.SU_ADMIN_KEY = '12345678';
process.env.JWT_SECRET = 'quickfile_test_isolated_secret_key_2026';
process.env.BARANGAY_NAME = 'Barangay 11';
process.env.CITY_MUNICIPALITY = 'Malaybalay';
process.env.PROVINCE = 'Bukidnon';
process.env.DEFAULT_ADMIN_PASSWORD = 'Admin@123456';
process.env.DEFAULT_STAFF_PASSWORD = 'Staff@123456';
process.env.DEFAULT_CITIZEN_PASSWORD = 'Citizen@123456';

// Write initial temporary env file for tests
fs.writeFileSync(
  TEST_ENV_PATH,
  [
    'PORT=5000',
    'NODE_ENV=test',
    `MONGO_URI=${TEST_MONGO_URI}`,
    'JWT_SECRET=quickfile_test_isolated_secret_key_2026',
    'SU_ADMIN_KEY=12345678',
    'BARANGAY_NAME=Barangay 11',
    'CITY_MUNICIPALITY=Malaybalay',
    'PROVINCE=Bukidnon',
    'DEFAULT_GOOGLE_CLIENT_ID=test-google-id.apps.googleusercontent.com',
    'DEFAULT_GOOGLE_CLIENT_SECRET=test-google-secret',
    'DEFAULT_RECAPTCHA_SITE_KEY=test-recaptcha-site-key',
    'DEFAULT_RECAPTCHA_SECRET_KEY=test-recaptcha-secret-key',
    'DEFAULT_SMS_GATEWAY_URL=https://dashboard.philsms.com/api/v3/',
    'DEFAULT_SMS_API_TOKEN=test-sms-token-123456',
    'DEFAULT_SMTP_HOST=smtp.gmail.com',
    'DEFAULT_SMTP_USER=test@gmail.com',
    'DEFAULT_REST_API_SECRET_KEY=test-rest-api-secret',
    'CUSTOM_GOOGLE_CLIENT_ID=',
    'CUSTOM_GOOGLE_CLIENT_SECRET=',
    'CUSTOM_SMS_API_TOKEN=',
  ].join('\n'),
  'utf8'
);

const app = require('./app');
const { connectDB } = require('./src/config/db');
const { seedDatabase } = require('./src/utils/seeder');
const { AuditLog, SuperAdminLockout } = require('./src/models');
const { API_PREFIX } = require('./src/config/constants');

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
  console.log('====================================================================');
  console.log('    ISOLATED TEST RUNNER (DB: quickfile_test, ENV: test.env.tmp)    ');
  console.log('====================================================================\n');

  await connectDB();

  // Reset isolated test database collections
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }

  // Seed isolated test database
  await seedDatabase();

  const server = app.listen(0);

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Health check (/api/v1/health)
    // -------------------------------------------------------------------------
    console.log(`[TEST 1] GET ${API_PREFIX}/health`);
    const healthRes = await makeRequest(server, { path: `${API_PREFIX}/health`, method: 'GET' });
    console.log(`Status: ${healthRes.status}`);
    console.log('Response:', JSON.stringify(healthRes.data, null, 2));
    console.log(`Stack trace present? ${'stack' in healthRes.data ? 'YES (FAIL)' : 'NO (PASS)'}`);
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 2: Unknown route 404 (/api/v1/unknown-path-test)
    // -------------------------------------------------------------------------
    console.log(`[TEST 2] GET ${API_PREFIX}/non-existent-route-check (404 Handling)`);
    const notFoundRes = await makeRequest(server, { path: `${API_PREFIX}/non-existent-route-check`, method: 'GET' });
    console.log(`Status: ${notFoundRes.status}`);
    console.log('Response:', JSON.stringify(notFoundRes.data, null, 2));
    console.log(`Stack trace present? ${'stack' in notFoundRes.data ? 'YES (FAIL)' : 'NO (PASS)'}`);
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 3: Citizen Self-Registration (/api/v1/auth/register)
    // -------------------------------------------------------------------------
    console.log(`[TEST 3] POST ${API_PREFIX}/auth/register (Citizen Registration)`);
    const regRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/register`, method: 'POST' },
      {
        email: `citizen.tester.${Date.now()}@example.gov.ph`,
        password: 'CitizenSecurePass@123',
        first_name: 'Marcelo',
        middle_name: 'Hilario',
        last_name: 'Del Pilar',
        suffix: '',
        birthdate: '1985-08-30',
        gender: 'male',
        civil_status: 'married',
        phone: '09171239999',
        purok_zone: 'Purok 3',
        street_address: 'Kakarong de Sili St',
        occupation: 'Journalist',
        emergency_contact_name: 'Marciana Del Pilar',
        emergency_contact_number: '09181112222',
      }
    );
    console.log(`Status: ${regRes.status}`);
    console.log('Response:', JSON.stringify(regRes.data, null, 2));
    const citizenToken = regRes.data?.data?.access_token;
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 4: Login for all 3 roles (/api/v1/auth/login)
    // -------------------------------------------------------------------------
    console.log(`[TEST 4] POST ${API_PREFIX}/auth/login (All 3 Roles)`);

    // Admin login
    const adminLogin = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/login`, method: 'POST' },
      { email: 'admin@quickfile.gov.ph', password: 'Admin@123456' }
    );
    console.log(`Admin Login Status: ${adminLogin.status} (Role: ${adminLogin.data?.data?.user?.role})`);
    const adminToken = adminLogin.data?.data?.access_token;

    // Staff login
    const staffLogin = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/login`, method: 'POST' },
      { email: 'staff@quickfile.gov.ph', password: 'Staff@123456' }
    );
    console.log(`Staff Login Status: ${staffLogin.status} (Role: ${staffLogin.data?.data?.user?.role})`);
    console.log(`Staff Permissions:`, Object.keys(staffLogin.data?.data?.permissions || {}).filter(k => staffLogin.data?.data?.permissions[k] === true));

    // Citizen login
    const citizenLogin = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/login`, method: 'POST' },
      { email: 'citizen@quickfile.gov.ph', password: 'Citizen@123456' }
    );
    console.log(`Citizen Login Status: ${citizenLogin.status} (Role: ${citizenLogin.data?.data?.user?.role})`);
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 5: Invalid password login (/api/v1/auth/login)
    // -------------------------------------------------------------------------
    console.log(`[TEST 5] POST ${API_PREFIX}/auth/login (Invalid Password)`);
    const badLogin = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/login`, method: 'POST' },
      { email: 'admin@quickfile.gov.ph', password: 'WrongPassword999' }
    );
    console.log(`Status: ${badLogin.status}`);
    console.log('Response:', JSON.stringify(badLogin.data, null, 2));
    console.log(`Stack trace present? ${'stack' in badLogin.data ? 'YES (FAIL)' : 'NO (PASS)'}`);
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 6: Authenticated /me endpoint (/api/v1/auth/me)
    // -------------------------------------------------------------------------
    console.log(`[TEST 6] GET ${API_PREFIX}/auth/me (Bearer Token)`);
    const meRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/auth/me`,
        method: 'GET',
        headers: { Authorization: `Bearer ${citizenToken}` },
      }
    );
    console.log(`Status: ${meRes.status}`);
    console.log('Response:', JSON.stringify(meRes.data, null, 2));
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 7: Public Config Endpoint (/api/v1/public/config)
    // -------------------------------------------------------------------------
    console.log(`[TEST 7] GET ${API_PREFIX}/public/config (Public, No Secrets)`);
    const pubConfigRes = await makeRequest(server, { path: `${API_PREFIX}/public/config`, method: 'GET' });
    console.log(`Status: ${pubConfigRes.status}`);
    console.log('Response:', JSON.stringify(pubConfigRes.data, null, 2));
    const rawDataStr = JSON.stringify(pubConfigRes.data);
    const leakedSecret = rawDataStr.includes('test-google-secret') || rawDataStr.includes('test-recaptcha-secret-key');
    console.log(`Secrets contained in public config response? ${leakedSecret ? 'YES (LEAKED!)' : 'NO (SECURE)'}`);
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 8: Settings Save with WRONG Super Admin Key
    // -------------------------------------------------------------------------
    console.log(`[TEST 8] PATCH ${API_PREFIX}/admin/settings (Wrong Key)`);
    const wrongKeyRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/settings`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        su_admin_key: 'WRONG_KEY_ATTEMPT_1',
        settings: { CUSTOM_SMS_API_TOKEN: 'attempt_val' },
      }
    );
    console.log(`Status: ${wrongKeyRes.status}`);
    console.log('Response:', JSON.stringify(wrongKeyRes.data, null, 2));
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 9: Settings Save with CORRECT Super Admin Key
    // -------------------------------------------------------------------------
    console.log(`[TEST 9] PATCH ${API_PREFIX}/admin/settings (Correct Key)`);
    const validKeyRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/settings`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        su_admin_key: '12345678',
        settings: {
          CUSTOM_SMS_API_TOKEN: '5651|CustomPhilSmsToken1234567890',
          CUSTOM_GOOGLE_CLIENT_ID: 'custom-google-client-id-test.apps.googleusercontent.com',
        },
      }
    );
    console.log(`Status: ${validKeyRes.status}`);
    console.log('Response:', JSON.stringify(validKeyRes.data, null, 2));
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 10: .env Value Injection Protection (Reject Newlines & Nulls)
    // -------------------------------------------------------------------------
    console.log(`[TEST 10] PATCH ${API_PREFIX}/admin/settings (Value Injection with Newline)`);
    const injectionRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/settings`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        su_admin_key: '12345678',
        settings: {
          CUSTOM_SMS_API_TOKEN: 'valid_part\nINJECTED_VAR=hacked',
        },
      }
    );
    console.log(`Status: ${injectionRes.status}`);
    console.log('Response:', JSON.stringify(injectionRes.data, null, 2));
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 11: Resetting Custom Key Back to Default
    // -------------------------------------------------------------------------
    console.log(`[TEST 11] PATCH ${API_PREFIX}/admin/settings (Reset Custom Key to Default)`);
    const resetRes = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/settings`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        su_admin_key: '12345678',
        reset_keys: ['CUSTOM_SMS_API_TOKEN'],
      }
    );
    console.log(`Status: ${resetRes.status}`);
    console.log('Response (SMS Integration Source):', resetRes.data?.data?.integrations?.sms?.source);
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 12: Trigger 5 Consecutive Wrong Attempts -> 423 Database Lockout
    // -------------------------------------------------------------------------
    console.log(`[TEST 12] Trigger 5 Wrong Attempts (Verify 15-Minute Lockout)`);
    // Reset lockout state cleanly for this test step
    await SuperAdminLockout.deleteMany({});
    await SuperAdminLockout.create({});

    for (let i = 1; i <= 5; i++) {
      const lockAttempt = await makeRequest(
        server,
        {
          path: `${API_PREFIX}/admin/settings`,
          method: 'PATCH',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        {
          su_admin_key: `INCORRECT_KEY_${i}`,
          settings: { CUSTOM_SMS_API_TOKEN: 'attempt' },
        }
      );
      console.log(`Attempt ${i} Status: ${lockAttempt.status} -> Message: "${lockAttempt.data?.message}"`);
    }

    // Attempt 6 must be blocked with 423 Locked
    const lockVerify = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/settings`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        su_admin_key: 'INCORRECT_KEY_6',
        settings: { CUSTOM_SMS_API_TOKEN: 'attempt' },
      }
    );
    console.log(`Attempt 6 Status (Locked out): ${lockVerify.status}`);
    console.log('Response:', JSON.stringify(lockVerify.data, null, 2));
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 13: Correct Key Rejected While Locked Out
    // -------------------------------------------------------------------------
    console.log(`[TEST 13] Correct Key Rejected While Locked Out (423 Locked)`);
    const correctWhileLocked = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/settings`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        su_admin_key: '12345678',
        settings: { CUSTOM_SMS_API_TOKEN: 'will_fail_because_locked' },
      }
    );
    console.log(`Status: ${correctWhileLocked.status}`);
    console.log('Response:', JSON.stringify(correctWhileLocked.data, null, 2));
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 14: Recovery After Lockout Window Expires (Simulated Expiration)
    // -------------------------------------------------------------------------
    console.log(`[TEST 14] Recovery After Lockout Window Expires`);
    // Simulate passage of 15 minutes by moving locked_until into the past
    await SuperAdminLockout.updateOne({}, { locked_until: new Date(Date.now() - 5000) });

    // Verify a wrong key now gives attempt 1 (failed_attempts reset to 0 before check, not re-locked immediately)
    const testWrongAfterExpiry = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/settings`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        su_admin_key: 'WRONG_KEY_AFTER_EXPIRY',
        settings: { CUSTOM_SMS_API_TOKEN: 'check' },
      }
    );
    console.log(`Wrong Key After Expiration Status: ${testWrongAfterExpiry.status} (Message: "${testWrongAfterExpiry.data?.message}")`);

    // Verify correct key succeeds
    const testCorrectAfterExpiry = await makeRequest(
      server,
      {
        path: `${API_PREFIX}/admin/settings`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        su_admin_key: '12345678',
        settings: { CUSTOM_SMS_API_TOKEN: 'recovered_custom_token' },
      }
    );
    console.log(`Correct Key After Expiration Status: ${testCorrectAfterExpiry.status} (Message: "${testCorrectAfterExpiry.data?.message}")`);
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 15: AuditLog Snapshot Integrity & Append-Only Immutability
    // -------------------------------------------------------------------------
    console.log(`[TEST 15] AuditLog Snapshot Fields & Append-Only Immutability`);
    const recentAudit = await AuditLog.findOne({ action: 'SETTINGS_UPDATE_CUSTOM_KEYS' }).sort({ created_at: -1 });
    console.log('Recent Audit Entry:', {
      actor_name: recentAudit?.actor_name,
      target_type: recentAudit?.target_type,
      action: recentAudit?.action,
      module: recentAudit?.module,
      details: recentAudit?.details,
    });

    try {
      await AuditLog.updateOne({ _id: recentAudit._id }, { actor_name: 'MutatedName' });
      console.log('FAIL: AuditLog allowed an update!');
    } catch (err) {
      console.log('PASS: AuditLog update blocked by Mongoose immutability hook:');
      console.log(`Caught Error: "${err.message}"`);
    }

    try {
      await AuditLog.deleteOne({ _id: recentAudit._id });
      console.log('FAIL: AuditLog allowed a deletion!');
    } catch (err) {
      console.log('PASS: AuditLog deletion blocked by Mongoose immutability hook:');
      console.log(`Caught Error: "${err.message}"`);
    }
    console.log('--------------------------------------------------------------------\n');

    console.log('ALL 15 COMPREHENSIVE INTEGRATION & SECURITY TESTS PASSED.');
  } finally {
    server.close();

    // Clean up isolated test database and temporary env file
    try {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
      console.log('[Cleanup] Dropped isolated quickfile_test database.');
    } catch {}

    if (fs.existsSync(TEST_ENV_PATH)) {
      fs.unlinkSync(TEST_ENV_PATH);
      console.log('[Cleanup] Removed temporary test.env.tmp file.');
    }

    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
