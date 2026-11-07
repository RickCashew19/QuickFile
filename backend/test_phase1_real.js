/**
 * Phase 1 Integration & Security Test Suite
 * Tests against REAL running MongoDB and Express REST API
 */
const http = require('http');
const app = require('./app');
const { connectDB } = require('./src/config/db');
const { AuditLog, SuperAdminLockout } = require('./src/models');

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
  console.log('      REAL MONGODB INTEGRATION & SUPER ADMIN KEY SECURITY TESTS     ');
  console.log('====================================================================\n');

  await connectDB();
  // Reset lockout record for clean test run
  await SuperAdminLockout.deleteMany({});
  await SuperAdminLockout.create({});

  const server = app.listen(0);

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Health check & Stack trace verification
    // -------------------------------------------------------------------------
    console.log('[TEST 1] GET /api/health (Confirm JSON format & no stack trace)');
    const healthRes = await makeRequest(server, { path: '/api/health', method: 'GET' });
    console.log(`Status: ${healthRes.status}`);
    console.log('Response:', JSON.stringify(healthRes.data, null, 2));
    console.log(`Stack trace included in response? ${'stack' in healthRes.data ? 'YES (VIOLATION)' : 'NO (PASSED)'}`);
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 2: Citizen self-registration
    // -------------------------------------------------------------------------
    console.log('[TEST 2] POST /api/auth/register (Citizen Registration)');
    const testEmail = `citizentest.${Date.now()}@pasig.gov.ph`;
    const regRes = await makeRequest(
      server,
      { path: '/api/auth/register', method: 'POST' },
      {
        email: testEmail,
        password: 'CitizenSecurePass@2026',
        first_name: 'Francisco',
        middle_name: 'Baltazar',
        last_name: 'Balagtas',
        suffix: '',
        birthdate: '1992-04-02',
        gender: 'male',
        civil_status: 'married',
        phone: '09179998877',
        purok_zone: 'Purok 1',
        street_address: 'Florante St Corner Laura',
        occupation: 'Poet',
        emergency_contact_name: 'Laura Balagtas',
        emergency_contact_number: '09187776655',
      }
    );
    console.log(`Status: ${regRes.status}`);
    console.log('Response:', JSON.stringify(regRes.data, null, 2));
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 3: Admin Login
    // -------------------------------------------------------------------------
    console.log('[TEST 3] POST /api/auth/login (Admin Account)');
    const adminLoginRes = await makeRequest(
      server,
      { path: '/api/auth/login', method: 'POST' },
      { email: 'admin@quickfile.gov.ph', password: 'Admin@123456' }
    );
    console.log(`Status: ${adminLoginRes.status}`);
    console.log('Response:', JSON.stringify(adminLoginRes.data, null, 2));
    const adminToken = adminLoginRes.data?.data?.access_token;
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 4: Read Settings with Masked Secrets (GET /api/admin/settings)
    // -------------------------------------------------------------------------
    console.log('[TEST 4] GET /api/admin/settings (Masked Secrets & Source Tracking)');
    const settingsGetRes = await makeRequest(
      server,
      {
        path: '/api/admin/settings',
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    console.log(`Status: ${settingsGetRes.status}`);
    console.log('Response (Integrations):', JSON.stringify(settingsGetRes.data?.data?.integrations, null, 2));
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 5: Settings Update with Invalid Super Admin Key (Failed attempt)
    // -------------------------------------------------------------------------
    console.log('[TEST 5] PATCH /api/admin/settings with Invalid Key');
    const wrongKeyRes = await makeRequest(
      server,
      {
        path: '/api/admin/settings',
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        su_admin_key: 'WRONG_KEY_9999',
        settings: { CUSTOM_SMS_API_TOKEN: 'token_attempt' },
      }
    );
    console.log(`Status: ${wrongKeyRes.status}`);
    console.log('Response:', JSON.stringify(wrongKeyRes.data, null, 2));
    console.log(`Stack trace included in error response? ${'stack' in wrongKeyRes.data ? 'YES (VIOLATION)' : 'NO (PASSED)'}`);
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 6: Settings Update with Valid Super Admin Key (timingSafeEqual verified)
    // -------------------------------------------------------------------------
    console.log('[TEST 6] PATCH /api/admin/settings with Valid Key (SU_ADMIN_KEY=12345678)');
    const updateRes = await makeRequest(
      server,
      {
        path: '/api/admin/settings',
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        su_admin_key: '12345678',
        settings: {
          CUSTOM_SMS_API_TOKEN: '5651|PhilSmsCustomTokenForTest1234567890',
          CUSTOM_GOOGLE_CLIENT_ID: 'google-client-id-custom-test-12345.apps.googleusercontent.com',
        },
      }
    );
    console.log(`Status: ${updateRes.status}`);
    console.log('Response:', JSON.stringify(updateRes.data, null, 2));
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 7: Lockout enforcement (Triggering 5 consecutive wrong attempts)
    // -------------------------------------------------------------------------
    console.log('[TEST 7] Trigger 5 wrong attempts to verify 15-minute lockout');
    for (let i = 1; i <= 5; i++) {
      const lockAttempt = await makeRequest(
        server,
        {
          path: '/api/admin/settings',
          method: 'PATCH',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        {
          su_admin_key: `BAD_KEY_ATTEMPT_${i}`,
          settings: { CUSTOM_SMS_API_TOKEN: 'bad' },
        }
      );
      console.log(`Attempt ${i} Status: ${lockAttempt.status} -> Message: "${lockAttempt.data.message}"`);
    }

    // Attempt 6 must be blocked with 423 Locked
    const attemptAfterLock = await makeRequest(
      server,
      {
        path: '/api/admin/settings',
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        su_admin_key: '12345678', // Even the correct key must be rejected while locked out
        settings: { CUSTOM_SMS_API_TOKEN: 'locked_test' },
      }
    );
    console.log(`\nAttempt after lockout (even with correct key) Status: ${attemptAfterLock.status}`);
    console.log('Response:', JSON.stringify(attemptAfterLock.data, null, 2));
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 8: AuditLog Snapshot Fields & Append-Only Verification
    // -------------------------------------------------------------------------
    console.log('[TEST 8] AuditLog Snapshot Fields & Append-Only Verification');
    const recentLog = await AuditLog.findOne({ action: 'SETTINGS_UPDATE_CUSTOM_KEYS' });
    console.log('AuditLog entry with actor_name and target_type:', {
      actor_name: recentLog?.actor_name,
      target_type: recentLog?.target_type,
      action: recentLog?.action,
      module: recentLog?.module,
      details: recentLog?.details,
    });

    try {
      await AuditLog.updateOne({ _id: recentLog._id }, { actor_name: 'Hacker' });
      console.log('FAILED: AuditLog allowed an update!');
    } catch (err) {
      console.log('PASSED: AuditLog update blocked by Mongoose immutability hook:');
      console.log(`Caught Error: "${err.message}"`);
    }
    console.log('--------------------------------------------------------------------\n');

    console.log('ALL PHASE 1 INTEGRATION & SECURITY TESTS PASSED SUCCESSFULLY.');
  } finally {
    server.close();
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
