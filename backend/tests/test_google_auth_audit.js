/**
 * Dedicated Google OAuth Audit & Integration Test Suite
 * Tests all 10 security and functional invariants for Google OAuth:
 *  1. Config resolution & secret masking
 *  2. Public config endpoint safe exposure
 *  3. Admin toggle enforcement (disabled -> 403)
 *  4. Request payload validation (missing/invalid id_token -> 400)
 *  5. Email verified invariant (unverified -> 400)
 *  6. Privilege escalation guard (staff/admin blocked -> 403)
 *  7. Deactivated account guard (inactive citizen -> 403)
 *  8. New citizen auto-registration (creates citizen, profile_complete: false, JWT issued)
 *  9. Existing citizen account linking (links google_id, retains profile, updates last_login_at)
 * 10. Audit logging verification (USER_LOGIN with provider: 'google')
 */

const http = require('http');
const assert = require('assert');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const { config, validateConfig } = require('../src/config');
const { connectDB, disconnectDB } = require('../src/config/db');
const {
  User,
  CitizenProfile,
  AppSetting,
  AuditLog,
} = require('../src/models');
const authService = require('../src/services/auth.service');
const { API_PREFIX, ROLES } = require('../src/config/constants');
const app = require('../app');

function makeRequest(server, options, postData = null) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const reqOptions = {
      hostname: '127.0.0.1',
      port: address.port,
      path: options.path,
      method: options.method || 'GET',
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
        } catch (_) {}
        resolve({ status: res.statusCode, data: parsed, headers: res.headers });
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runGoogleAuthAudit() {
  console.log('\n===============================================================');
  console.log(' QUICKFILE GOOGLE OAUTH SECURITY & INTEGRATION AUDIT SUITE');
  console.log('===============================================================\n');

  validateConfig();
  try {
    await connectDB();
  } catch (err) {
    if (err.name === 'MongooseServerSelectionError' || err.message.includes('whitelist')) {
      console.warn('\n[Test DB] Atlas cluster unreachable (IP whitelist/network); connecting to local MongoDB test instance...');
      await connectDB('mongodb://127.0.0.1:27017/quickfile_test');
    } else {
      throw err;
    }
  }

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const serverPort = server.address().port;
  console.log(`[Setup] Test server running on http://127.0.0.1:${serverPort}\n`);

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Config resolution and secret masking
    // -------------------------------------------------------------------------
    console.log('[TEST 1] Config resolution & secret masking');
    const clientIdInfo = config.google.resolveClientId();
    const clientSecretInfo = config.google.resolveClientSecret();
    assert(clientIdInfo.value, 'Google Client ID must be non-empty in test config');
    assert(clientSecretInfo.value, 'Google Client Secret must be non-empty in test config');

    const summary = config.getSafeIntegrationSummary();
    assert(summary.google, 'Safe integration summary must have google entry');
    assert(summary.google.client_id.includes('••••••••'), 'Client ID must be masked in admin settings summary');
    assert(summary.google.client_secret.includes('••••••••'), 'Client secret must be masked');
    assert(!summary.google.client_secret.includes(clientSecretInfo.value), 'Raw client secret must never be exposed');
    console.log('  -> PASS: Google Client ID resolved and secret safely masked.');

    // -------------------------------------------------------------------------
    // TEST 2: GET /api/v1/public/config endpoint safe exposure
    // -------------------------------------------------------------------------
    console.log('[TEST 2] Public config endpoint safe exposure');
    await AppSetting.updateOne({ key: 'enable_google_login' }, { $set: { value: true } }, { upsert: true });

    const pubRes = await makeRequest(server, { path: `${API_PREFIX}/public/config`, method: 'GET' });
    assert.strictEqual(pubRes.status, 200, 'Public config must return 200');
    assert.strictEqual(pubRes.data.data.google_client_id, clientIdInfo.value, 'Public config contains google_client_id');
    assert.strictEqual(pubRes.data.data.integrations.google_login_enabled, true, 'google_login_enabled is true');
    assert.strictEqual(pubRes.data.data.google_client_secret, undefined, 'Public config must NEVER expose client secret');
    console.log('  -> PASS: Public config exposes client_id and feature flag without leaking secrets.');

    // -------------------------------------------------------------------------
    // TEST 3: Admin toggle enforcement (disabled -> 403 Forbidden)
    // -------------------------------------------------------------------------
    console.log('[TEST 3] Admin toggle enforcement (disabled -> 403)');
    await AppSetting.updateOne({ key: 'enable_google_login' }, { $set: { value: false } }, { upsert: true });

    const disabledRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/google`, method: 'POST' },
      { id_token: 'some_google_id_token' }
    );
    assert.strictEqual(disabledRes.status, 403, 'Disabled Google login must return 403');
    assert(disabledRes.data.message.toLowerCase().includes('disabled'), 'Message explains feature is disabled');
    console.log('  -> PASS: Google OAuth endpoint rejected with 403 when toggle is disabled.');

    // Re-enable for subsequent tests
    await AppSetting.updateOne({ key: 'enable_google_login' }, { $set: { value: true } }, { upsert: true });

    // -------------------------------------------------------------------------
    // TEST 4: Request payload validation (missing/invalid id_token -> 400)
    // -------------------------------------------------------------------------
    console.log('[TEST 4] Request payload validation (missing/invalid id_token)');
    const emptyRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/google`, method: 'POST' },
      {}
    );
    assert.strictEqual(emptyRes.status, 400, 'Empty body must return 400');

    const nonStringRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/google`, method: 'POST' },
      { id_token: 123456 }
    );
    assert.strictEqual(nonStringRes.status, 400, 'Non-string id_token must return 400');
    console.log('  -> PASS: Invalid id_token payloads properly rejected with 400.');

    // -------------------------------------------------------------------------
    // TEST 5: Email verified invariant (unverified -> 400)
    // -------------------------------------------------------------------------
    console.log('[TEST 5] Email verified invariant (unverified -> 400)');
    authService.setGoogleTokenVerifier(async () => ({
      sub: 'google_sub_unverified',
      email: 'unverified@gmail.com',
      email_verified: false, // NOT verified!
      name: 'Unverified User',
    }));

    const unverifiedRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/google`, method: 'POST' },
      { id_token: 'token_unverified' }
    );
    assert.strictEqual(unverifiedRes.status, 400, 'Unverified email must return 400');
    assert(unverifiedRes.data.message.includes('verified'), 'Message states email must be verified');
    console.log('  -> PASS: Google account with email_verified: false rejected with 400.');

    // -------------------------------------------------------------------------
    // TEST 6: Privilege escalation guard (staff/admin blocked -> 403)
    // -------------------------------------------------------------------------
    console.log('[TEST 6] Privilege escalation guard (Staff & Admin blocked)');
    const stamp = Date.now();
    const adminEmail = `admin_test_${stamp}@quickfile.gov.ph`;
    const staffEmail = `staff_test_${stamp}@quickfile.gov.ph`;

    await User.create({
      email: adminEmail,
      full_name: 'Test Administrator',
      role: ROLES.ADMIN,
      password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyz12345678901234567890123456',
      is_active: true,
    });

    await User.create({
      email: staffEmail,
      full_name: 'Test Staff Officer',
      role: ROLES.STAFF,
      password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyz12345678901234567890123456',
      is_active: true,
    });

    // Attempt Google login as Admin
    authService.setGoogleTokenVerifier(async () => ({
      sub: `google_admin_${stamp}`,
      email: adminEmail,
      email_verified: true,
      name: 'Test Administrator',
    }));

    const adminAttemptRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/google`, method: 'POST' },
      { id_token: 'token_admin' }
    );
    assert.strictEqual(adminAttemptRes.status, 403, 'Admin attempting Google login must return 403');
    assert(adminAttemptRes.data.message.includes('only permitted for citizen accounts'), 'Message cites citizen only');

    // Attempt Google login as Staff
    authService.setGoogleTokenVerifier(async () => ({
      sub: `google_staff_${stamp}`,
      email: staffEmail,
      email_verified: true,
      name: 'Test Staff Officer',
    }));

    const staffAttemptRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/google`, method: 'POST' },
      { id_token: 'token_staff' }
    );
    assert.strictEqual(staffAttemptRes.status, 403, 'Staff attempting Google login must return 403');
    console.log('  -> PASS: Staff and Admin strictly blocked from Google OAuth authentication.');

    // -------------------------------------------------------------------------
    // TEST 7: Deactivated account guard (inactive citizen -> 403)
    // -------------------------------------------------------------------------
    console.log('[TEST 7] Deactivated account guard');
    const inactiveEmail = `inactive_citizen_${stamp}@example.com`;
    const inactiveUser = await User.create({
      email: inactiveEmail,
      full_name: 'Deactivated Citizen',
      role: ROLES.CITIZEN,
      password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyz12345678901234567890123456',
      is_active: false,
    });

    authService.setGoogleTokenVerifier(async () => ({
      sub: `google_inactive_${stamp}`,
      email: inactiveEmail,
      email_verified: true,
      name: 'Deactivated Citizen',
    }));

    const inactiveRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/google`, method: 'POST' },
      { id_token: 'token_inactive' }
    );
    assert.strictEqual(inactiveRes.status, 403, 'Inactive user must return 403');
    assert(inactiveRes.data.message.toLowerCase().includes('deactivated'), 'Message notes account is deactivated');
    console.log('  -> PASS: Deactivated citizen account blocked with 403.');

    // -------------------------------------------------------------------------
    // TEST 8: New citizen auto-registration flow
    // -------------------------------------------------------------------------
    console.log('[TEST 8] New citizen auto-registration flow');
    const newCitizenEmail = `new_citizen_${stamp}@example.com`;
    const newGoogleSub = `google_new_${stamp}`;

    authService.setGoogleTokenVerifier(async () => ({
      sub: newGoogleSub,
      email: newCitizenEmail,
      email_verified: true,
      name: 'Maria Clara Santos',
      given_name: 'Maria Clara',
      family_name: 'Santos',
    }));

    const registerRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/google`, method: 'POST' },
      { id_token: 'token_new_citizen' }
    );
    assert.strictEqual(registerRes.status, 200, 'New citizen registration must return 200');
    assert(registerRes.data.data.access_token, 'Response must include JWT access_token');
    assert.strictEqual(registerRes.data.data.user.email, newCitizenEmail);
    assert.strictEqual(registerRes.data.data.user.role, 'citizen');
    assert.strictEqual(registerRes.data.data.user.google_id, newGoogleSub);

    // Verify CitizenProfile creation with non-invented data
    const createdProfile = await CitizenProfile.findOne({ user_id: registerRes.data.data.user._id });
    assert(createdProfile, 'CitizenProfile must be automatically created');
    assert.strictEqual(createdProfile.profile_complete, false, 'profile_complete must be false');
    assert.strictEqual(createdProfile.birthdate, null, 'birthdate must not be fabricated (null)');
    assert.strictEqual(createdProfile.gender, '', 'gender must not be fabricated (empty string)');
    assert.strictEqual(createdProfile.first_name, 'Maria Clara');
    assert.strictEqual(createdProfile.last_name, 'Santos');

    // Verify AuditLog entry
    const auditEntry = await AuditLog.findOne({
      user_id: registerRes.data.data.user._id,
      action: 'USER_LOGIN',
    });
    assert(auditEntry, 'Audit log entry must be created for USER_LOGIN');
    assert.strictEqual(auditEntry.details.provider, 'google', 'Audit log must record provider: google');
    console.log('  -> PASS: New citizen auto-registered with empty demographics, profile_complete: false, and audit entry.');

    // -------------------------------------------------------------------------
    // TEST 9: Existing citizen account linking flow
    // -------------------------------------------------------------------------
    console.log('[TEST 9] Existing citizen account linking flow');
    const existingCitizenEmail = `existing_citizen_${stamp}@example.com`;
    const existingCitizenUser = await User.create({
      email: existingCitizenEmail,
      full_name: 'Juan Tamad',
      role: ROLES.CITIZEN,
      password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyz12345678901234567890123456',
      is_active: true,
      google_id: null, // previously registered with email/password only
    });

    const existingProfile = await CitizenProfile.create({
      user_id: existingCitizenUser._id,
      first_name: 'Juan',
      last_name: 'Tamad',
      profile_complete: true,
      birthdate: new Date('1990-01-01'),
      gender: 'male',
      barangay: 'San Antonio',
      city: 'Pasig',
      province: 'Metro Manila',
    });

    const linkSub = `google_linked_${stamp}`;
    authService.setGoogleTokenVerifier(async () => ({
      sub: linkSub,
      email: existingCitizenEmail,
      email_verified: true,
      name: 'Juan Tamad',
    }));

    const linkRes = await makeRequest(
      server,
      { path: `${API_PREFIX}/auth/google`, method: 'POST' },
      { id_token: 'token_link_citizen' }
    );
    assert.strictEqual(linkRes.status, 200, 'Existing citizen login must return 200');
    assert.strictEqual(linkRes.data.data.user.google_id, linkSub, 'google_id must now be linked');

    const updatedUser = await User.findById(existingCitizenUser._id);
    assert.strictEqual(updatedUser.google_id, linkSub, 'User document updated with google_id');
    assert(updatedUser.last_login_at, 'last_login_at must be updated');

    const preservedProfile = await CitizenProfile.findOne({ user_id: existingCitizenUser._id });
    assert.strictEqual(preservedProfile.profile_complete, true, 'Existing profile data and completion status preserved');
    console.log('  -> PASS: Existing citizen successfully linked Google ID while preserving profile data.');

    // -------------------------------------------------------------------------
    // TEST 10: Reset Verifier and Cleanup
    // -------------------------------------------------------------------------
    console.log('[TEST 10] Teardown & Verifier Reset');
    authService.setGoogleTokenVerifier(null);
    console.log('  -> PASS: Google token verifier mock safely reset to null.');

    console.log('\n===============================================================');
    console.log(' ALL 10 GOOGLE OAUTH SECURITY & INTEGRATION INVARIANTS PASSED!');
    console.log('===============================================================\n');
  } finally {
    authService.setGoogleTokenVerifier(null);
    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
  }
}

if (require.main === module) {
  runGoogleAuthAudit()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n[FATAL AUDIT FAILURE]:', err);
      process.exit(1);
    });
}

module.exports = { runGoogleAuthAudit };
