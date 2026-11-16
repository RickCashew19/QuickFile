/**
 * Concurrency Control Integration Test Suite: Document-Level Locking & Optimistic Versioning
 * Proves:
 *   (a) Two users cannot both acquire the lock (atomic mutual exclusion, 423 Locked)
 *   (b) An expired lock can be taken over (TTL-safe expiration, LOCK_EXPIRED_TAKEOVER)
 *   (c) Only the holder can release/renew; admin force-release override
 *   (d) An action without the lock fails with 423 and blocked state transition
 *   (e) A stale __v update fails with 409 VersionError and Conflict message
 *   (f) Two (and multiple) simultaneous acquireLock calls result in exactly one success
 *
 * Runs against the configured MongoDB Atlas instance with safe credential masking.
 */
const http = require('http');
const path = require('path');
const assert = require('assert');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Load project configuration and database connection
const { config, validateConfig } = require('../src/config');
const { connectDB, disconnectDB } = require('../src/config/db');
const {
  DocumentRequest,
  DocumentType,
  User,
  StaffPermission,
  AuditLog,
} = require('../src/models');
const requestLockService = require('../src/services/requestLock.service');
const { transitionRequestStatus } = require('../src/helpers/requestTransition');
const { errorHandler } = require('../src/middlewares/errorHandler.middleware');
const app = require('../app');

// HTTP helper for end-to-end endpoint verification
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

function generateToken(user) {
  const secret = (config.jwt && config.jwt.getSecret()) || process.env.JWT_SECRET || 'quickfile_test_jwt_secret_key_32chars';
  return jwt.sign(
    {
      userId: user._id,
      id: user._id,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
    },
    secret,
    { expiresIn: '1h' }
  );
}

async function runTestSuite() {
  console.log('\n===============================================================');
  console.log(' QUICKFILE CONCURRENCY CONTROL REAL INTEGRATION TEST SUITE');
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
  console.log(`[Test Setup] Test HTTP server listening on port ${serverPort}\n`);

  // Ensure prerequisite DocumentType exists
  let docType = await DocumentType.findOne({ is_active: true });
  if (!docType) {
    docType = await DocumentType.create({
      code: 'TEST_CERT',
      name: 'Test Concurrency Certificate',
      fee: 50,
      processing_days: 1,
      is_active: true,
      requirements: ['Valid ID'],
    });
  }

  // Ensure test users exist
  const stamp = Date.now();

  const staffUser1 = await User.create({
    email: `staff1_${stamp}@quickfile.test`,
    password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyz12345678901234567890123456',
    full_name: 'Staff Maria Santos',
    role: 'staff',
    is_active: true,
  });

  const staffUser2 = await User.create({
    email: `staff2_${stamp}@quickfile.test`,
    password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyz12345678901234567890123456',
    full_name: 'Staff Juan Dela Cruz',
    role: 'staff',
    is_active: true,
  });

  const adminUser = await User.create({
    email: `admin_${stamp}@quickfile.test`,
    password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyz12345678901234567890123456',
    full_name: 'Admin Supervisor',
    role: 'admin',
    is_active: true,
  });

  const citizenUser = await User.create({
    email: `citizen_${stamp}@quickfile.test`,
    password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyz12345678901234567890123456',
    full_name: 'Citizen Pedro Penduko',
    role: 'citizen',
    is_active: true,
  });

  // Assign full staff permissions to staff users
  await StaffPermission.create({
    user_id: staffUser1._id,
    can_review_requests: true,
    can_prepare_documents: true,
    can_print_documents: true,
    can_release_documents: true,
    can_verify_qr: true,
    can_view_reports: true,
    can_archive_records: true,
  });

  await StaffPermission.create({
    user_id: staffUser2._id,
    can_review_requests: true,
    can_prepare_documents: true,
    can_print_documents: true,
    can_release_documents: true,
    can_verify_qr: true,
    can_view_reports: true,
    can_archive_records: true,
  });

  const staffToken1 = generateToken(staffUser1);
  const staffToken2 = generateToken(staffUser2);
  const adminToken = generateToken(adminUser);

  let passedTests = 0;
  let totalTests = 0;

  async function test(name, fn) {
    totalTests++;
    try {
      process.stdout.write(` [TEST ${totalTests}] ${name} ... `);
      await fn();
      passedTests++;
      console.log('PASSED');
    } catch (err) {
      console.log('FAILED');
      console.error(`   Error: ${err.message}`);
      if (err.stack) {
        console.error(`   Stack: ${err.stack.split('\n').slice(1, 4).join('\n')}`);
      }
      throw err;
    }
  }

  try {
    // --------------------------------------------------------------------------
    // TEST (a): Two users cannot both acquire the lock
    // --------------------------------------------------------------------------
    await test('(a) Two users cannot both acquire the lock (service & HTTP 423 Locked)', async () => {
      const reqDoc = await DocumentRequest.create({
        tracking_number: `TEST-LOCK-A-${stamp}`,
        citizen_id: citizenUser._id,
        document_type_id: docType._id,
        purpose: 'Employment Verification',
        status: 'pending',
      });

      // 1. Staff 1 acquires lock
      const lock1 = await requestLockService.acquireLock(reqDoc._id, staffUser1);
      assert.strictEqual(lock1.locked_by.toString(), staffUser1._id.toString());
      assert.strictEqual(lock1.locked_by_name, staffUser1.full_name);
      assert(new Date(lock1.expires_at) > new Date());

      // 2. Staff 2 attempts to acquire lock (service layer) -> must throw 423
      let errorThrown = false;
      try {
        await requestLockService.acquireLock(reqDoc._id, staffUser2);
      } catch (err) {
        errorThrown = true;
        assert.strictEqual(err.statusCode, 423, `Expected status 423, got ${err.statusCode}`);
        assert.strictEqual(err.code, 'LOCKED');
        assert(err.message.includes(staffUser1.full_name), 'Message must name lock holder');
        assert(err.lock && err.lock.locked_by.toString() === staffUser1._id.toString());
      }
      assert(errorThrown, 'Expected acquireLock to reject for competing user');

      // 3. HTTP REST layer check: PUT /api/v1/staff/requests/:id/lock with Staff 2 token
      const httpRes = await makeRequest(
        server,
        {
          path: `/api/v1/staff/requests/${reqDoc._id}/lock`,
          method: 'PUT',
          headers: { Authorization: `Bearer ${staffToken2}` },
        }
      );
      assert.strictEqual(httpRes.status, 423, `Expected HTTP 423, got ${httpRes.status}`);
      assert.strictEqual(httpRes.data.success, false);
      assert(httpRes.data.message.includes(staffUser1.full_name));
      assert(httpRes.data.data.lock.locked_by.toString() === staffUser1._id.toString());

      // 4. AuditLog verification
      const deniedLog = await AuditLog.findOne({
        action: 'LOCK_DENIED',
        target_id: reqDoc._id.toString(),
      });
      assert(deniedLog, 'Expected LOCK_DENIED audit log entry');
      assert.strictEqual(deniedLog.user_id.toString(), staffUser2._id.toString());
    });

    // --------------------------------------------------------------------------
    // TEST (b): An expired lock can be taken over
    // --------------------------------------------------------------------------
    await test('(b) An expired lock can be taken over (TTL-safe takeover & audit log)', async () => {
      const pastDate = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      const expiredDate = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago

      const reqDoc = await DocumentRequest.create({
        tracking_number: `TEST-LOCK-B-${stamp}`,
        citizen_id: citizenUser._id,
        document_type_id: docType._id,
        purpose: 'Loan Application',
        status: 'pending',
        lock: {
          locked_by: staffUser1._id,
          locked_by_name: staffUser1.full_name,
          locked_at: pastDate,
          expires_at: expiredDate,
        },
      });

      // Staff 2 acquires the expired lock
      const takeoverLock = await requestLockService.acquireLock(reqDoc._id, staffUser2);
      assert.strictEqual(takeoverLock.locked_by.toString(), staffUser2._id.toString());
      assert.strictEqual(takeoverLock.locked_by_name, staffUser2.full_name);
      assert(new Date(takeoverLock.expires_at) > new Date());

      // Verify DB record
      const refreshedDoc = await DocumentRequest.findById(reqDoc._id);
      assert.strictEqual(refreshedDoc.lock.locked_by.toString(), staffUser2._id.toString());
      assert(new Date(refreshedDoc.lock.expires_at) > new Date());

      // Check AuditLog for LOCK_EXPIRED_TAKEOVER
      const takeoverLog = await AuditLog.findOne({
        action: 'LOCK_EXPIRED_TAKEOVER',
        target_id: reqDoc._id.toString(),
      });
      assert(takeoverLog, 'Expected LOCK_EXPIRED_TAKEOVER audit log entry');
      assert.strictEqual(takeoverLog.user_id.toString(), staffUser2._id.toString());
    });

    // --------------------------------------------------------------------------
    // TEST (c): Only the holder can release/renew; admin force-release override
    // --------------------------------------------------------------------------
    await test('(c) Only the holder can release/renew; admin force-release works', async () => {
      const reqDoc = await DocumentRequest.create({
        tracking_number: `TEST-LOCK-C-${stamp}`,
        citizen_id: citizenUser._id,
        document_type_id: docType._id,
        purpose: 'Scholarship Application',
        status: 'pending',
      });

      // Staff 1 acquires lock
      await requestLockService.acquireLock(reqDoc._id, staffUser1);

      // Non-holder Staff 2 tries to renew -> fails (delegates to acquire and gets 423)
      let renewBlocked = false;
      try {
        await requestLockService.renewLock(reqDoc._id, staffUser2);
      } catch (err) {
        renewBlocked = true;
        assert.strictEqual(err.statusCode, 423);
      }
      assert(renewBlocked, 'Expected non-holder renewal to reject with 423');

      // Non-holder Staff 2 tries to release -> fails with 403 Forbidden
      let releaseBlocked = false;
      try {
        await requestLockService.releaseLock(reqDoc._id, staffUser2);
      } catch (err) {
        releaseBlocked = true;
        assert.strictEqual(err.statusCode, 403);
      }
      assert(releaseBlocked, 'Expected non-holder release to reject with 403 Forbidden');

      // Holder Staff 1 renews -> succeeds
      const renewedLock = await requestLockService.renewLock(reqDoc._id, staffUser1, {
        durationMs: 15 * 60 * 1000,
      });
      assert.strictEqual(renewedLock.locked_by.toString(), staffUser1._id.toString());

      // Admin user force-releases the lock -> succeeds
      const adminReleaseRes = await makeRequest(
        server,
        {
          path: `/api/v1/staff/requests/${reqDoc._id}/lock`,
          method: 'DELETE',
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      assert.strictEqual(adminReleaseRes.status, 200, `Expected 200 on admin release, got ${adminReleaseRes.status}`);
      assert.strictEqual(adminReleaseRes.data.success, true);

      // Check DB lock is cleared
      const afterAdminRelease = await DocumentRequest.findById(reqDoc._id);
      assert.strictEqual(afterAdminRelease.lock.locked_by, null);

      // Check AuditLog for LOCK_FORCE_RELEASED
      const forceLog = await AuditLog.findOne({
        action: 'LOCK_FORCE_RELEASED',
        target_id: reqDoc._id.toString(),
      });
      assert(forceLog, 'Expected LOCK_FORCE_RELEASED audit log for admin override');

      // Staff 1 re-acquires and normally releases
      await requestLockService.acquireLock(reqDoc._id, staffUser1);
      const staffReleaseRes = await makeRequest(
        server,
        {
          path: `/api/v1/staff/requests/${reqDoc._id}/lock`,
          method: 'DELETE',
          headers: { Authorization: `Bearer ${staffToken1}` },
        }
      );
      assert.strictEqual(staffReleaseRes.status, 200);

      const afterStaffRelease = await DocumentRequest.findById(reqDoc._id);
      assert.strictEqual(afterStaffRelease.lock.locked_by, null);
    });

    // --------------------------------------------------------------------------
    // TEST (d): An action without the lock fails with 423
    // --------------------------------------------------------------------------
    await test('(d) Action without lock fails with 423; lock holder action releases lock on transition', async () => {
      const reqDoc = await DocumentRequest.create({
        tracking_number: `TEST-LOCK-D-${stamp}`,
        citizen_id: citizenUser._id,
        document_type_id: docType._id,
        purpose: 'Barangay Clearance for Bank',
        status: 'pending',
      });

      // Staff 1 locks the request
      await requestLockService.acquireLock(reqDoc._id, staffUser1);

      // Staff 2 tries to review the request via HTTP -> blocked with 423
      const actionRes = await makeRequest(
        server,
        {
          path: `/api/v1/staff/requests/${reqDoc._id}/review`,
          method: 'POST',
          headers: { Authorization: `Bearer ${staffToken2}` },
        }
      );
      assert.strictEqual(actionRes.status, 423, `Expected HTTP 423 on conflicting review, got ${actionRes.status}`);
      assert.strictEqual(actionRes.data.success, false);
      assert(actionRes.data.message.includes(staffUser1.full_name));

      // Confirm DB status remains 'pending'
      const checkDoc = await DocumentRequest.findById(reqDoc._id);
      assert.strictEqual(checkDoc.status, 'pending');

      // Staff 1 (the legitimate holder) performs the review action -> succeeds
      const holderActionRes = await makeRequest(
        server,
        {
          path: `/api/v1/staff/requests/${reqDoc._id}/review`,
          method: 'POST',
          headers: { Authorization: `Bearer ${staffToken1}` },
        }
      );
      assert.strictEqual(holderActionRes.status, 200, `Expected HTTP 200 on holder review, got ${holderActionRes.status}`);
      assert.strictEqual(holderActionRes.data.success, true);

      // Confirm state transitioned to 'under_review' AND lock was automatically cleared
      const updatedDoc = await DocumentRequest.findById(reqDoc._id);
      assert.strictEqual(updatedDoc.status, 'under_review');
      assert.strictEqual(updatedDoc.lock.locked_by, null, 'Lock must be released automatically after action');
    });

    // --------------------------------------------------------------------------
    // TEST (e): A stale __v update fails with 409
    // --------------------------------------------------------------------------
    await test('(e) A stale __v update fails with 409 Conflict (optimistic concurrency safety net)', async () => {
      const reqDoc = await DocumentRequest.create({
        tracking_number: `TEST-LOCK-E-${stamp}`,
        citizen_id: citizenUser._id,
        document_type_id: docType._id,
        purpose: 'Passport Application',
        status: 'pending',
      });

      // Fetch two independent Mongoose document instances of the same record
      const instanceA = await DocumentRequest.findById(reqDoc._id);
      const instanceB = await DocumentRequest.findById(reqDoc._id);

      assert.strictEqual(instanceA.__v, 0);
      assert.strictEqual(instanceB.__v, 0);

      // Instance A updates and saves successfully -> increments __v to 1
      instanceA.processing_notes = 'Processed by Worker A';
      await instanceA.save();

      const savedA = await DocumentRequest.findById(reqDoc._id);
      assert.strictEqual(savedA.__v, 1, 'Instance A save must increment __v to 1');

      // Instance B (holding stale __v = 0) attempts to save -> throws Mongoose VersionError
      instanceB.processing_notes = 'Conflicting update by Worker B';
      let versionErrorCaught = null;
      try {
        await instanceB.save();
      } catch (err) {
        versionErrorCaught = err;
      }

      assert(versionErrorCaught, 'Expected doc.save() with stale __v to throw');
      assert.strictEqual(versionErrorCaught.name, 'VersionError');

      // Verify that central errorHandler middleware transforms VersionError into HTTP 409 Conflict
      let transformedStatus = null;
      let transformedBody = null;
      const mockReq = {
        method: 'PUT',
        originalUrl: `/api/v1/staff/requests/${reqDoc._id}`,
        params: { id: reqDoc._id.toString() },
        user: staffUser2,
        ip: '127.0.0.1',
        get: () => 'UnitTestAgent',
      };
      const mockRes = {
        status(code) {
          transformedStatus = code;
          return this;
        },
        json(body) {
          transformedBody = body;
          return this;
        },
      };

      errorHandler(versionErrorCaught, mockReq, mockRes, () => {});
      assert.strictEqual(transformedStatus, 409, `Expected HTTP 409 from errorHandler, got ${transformedStatus}`);
      assert.strictEqual(transformedBody.success, false);
      assert(
        transformedBody.message.includes('modified by someone else and should be reloaded'),
        `Expected conflict message, got: ${transformedBody.message}`
      );

      // Allow async audit log write to complete
      await new Promise((r) => setTimeout(r, 250));

      // Verify VERSION_CONFLICT audit log entry
      const conflictLog = await AuditLog.findOne({
        action: 'VERSION_CONFLICT',
        target_id: reqDoc._id.toString(),
      });
      assert(conflictLog, 'Expected VERSION_CONFLICT audit log entry');
    });

    // --------------------------------------------------------------------------
    // TEST (f): Two simultaneous acquireLock calls result in exactly one success
    // --------------------------------------------------------------------------
    await test('(f) Simultaneous acquireLock calls result in exactly ONE success and competing 423s', async () => {
      const reqDoc = await DocumentRequest.create({
        tracking_number: `TEST-LOCK-F-${stamp}`,
        citizen_id: citizenUser._id,
        document_type_id: docType._id,
        purpose: 'Barangay Indigency Certificate',
        status: 'pending',
      });

      // 1. Fire two concurrent acquire calls simultaneously
      const results2 = await Promise.allSettled([
        requestLockService.acquireLock(reqDoc._id, staffUser1),
        requestLockService.acquireLock(reqDoc._id, staffUser2),
      ]);

      const fulfilled2 = results2.filter((r) => r.status === 'fulfilled');
      const rejected2 = results2.filter((r) => r.status === 'rejected');

      assert.strictEqual(fulfilled2.length, 1, 'Exactly one concurrent acquire call must succeed');
      assert.strictEqual(rejected2.length, 1, 'Exactly one concurrent acquire call must fail');
      assert.strictEqual(rejected2[0].reason.statusCode, 423);
      assert.strictEqual(rejected2[0].reason.code, 'LOCKED');

      // 2. High-concurrency test: 10 simultaneous workers competing for a single unlocked document
      const reqHighConc = await DocumentRequest.create({
        tracking_number: `TEST-LOCK-HIGH-${stamp}`,
        citizen_id: citizenUser._id,
        document_type_id: docType._id,
        purpose: 'High Concurrency Race Test',
        status: 'pending',
      });

      const competitors = Array.from({ length: 10 }, (_, i) => ({
        _id: new mongoose.Types.ObjectId(),
        full_name: `Worker ${i + 1}`,
        role: 'staff',
      }));

      const results10 = await Promise.allSettled(
        competitors.map((worker) => requestLockService.acquireLock(reqHighConc._id, worker))
      );

      const fulfilled10 = results10.filter((r) => r.status === 'fulfilled');
      const rejected10 = results10.filter((r) => r.status === 'rejected');

      assert.strictEqual(
        fulfilled10.length,
        1,
        `Expected exactly 1 winner out of 10 competitors, got ${fulfilled10.length}`
      );
      assert.strictEqual(
        rejected10.length,
        9,
        `Expected exactly 9 rejections out of 10 competitors, got ${rejected10.length}`
      );

      for (const rej of rejected10) {
        assert.strictEqual(rej.reason.statusCode, 423);
        assert.strictEqual(rej.reason.code, 'LOCKED');
      }

      // Confirm winner is recorded in DB
      const winningDoc = await DocumentRequest.findById(reqHighConc._id);
      assert(winningDoc.lock.locked_by, 'DB must record winning worker ID');
      assert.strictEqual(winningDoc.lock.locked_by.toString(), fulfilled10[0].value.locked_by.toString());
    });

    console.log('\n===============================================================');
    console.log(` ALL ${passedTests}/${totalTests} CONCURRENCY TESTS PASSED SUCCESSFULLY!`);
    console.log('===============================================================\n');
  } finally {
    // Teardown HTTP server and clean up test documents
    await new Promise((resolve) => server.close(resolve));
    await DocumentRequest.deleteMany({ tracking_number: new RegExp(`^TEST-LOCK-.*${stamp}`) });
    await User.deleteMany({ _id: { $in: [staffUser1._id, staffUser2._id, adminUser._id, citizenUser._id] } });
    await StaffPermission.deleteMany({ user_id: { $in: [staffUser1._id, staffUser2._id] } });
    await disconnectDB();
  }
}

if (require.main === module) {
  runTestSuite()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n[FATAL] Concurrency Test Suite failed:', err);
      process.exit(1);
    });
}

module.exports = { runTestSuite };
