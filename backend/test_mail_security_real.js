/**
 * Comprehensive Mail Security Real Integration Test Suite
 * Tests nodemailer version, email validation, HTML injection escaping in outgoing emails.
 * Never prints secrets.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const jwt = require('jsonwebtoken');

// Temporary isolated environment settings
const TEST_ENV_PATH = path.resolve(__dirname, 'test_mail.env.tmp');
const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/quickfile_mail_test';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = TEST_MONGO_URI;
process.env.ENV_FILE = TEST_ENV_PATH;
process.env.SU_ADMIN_KEY = 'su_key_test_mail_secret_key_12345';
process.env.JWT_SECRET = 'quickfile_mail_test_jwt_secret_at_least_32_chars_long';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.PUBLIC_APP_URL = 'http://localhost:5173';
process.env.BARANGAY_NAME = 'Barangay Mail';
process.env.CITY_MUNICIPALITY = 'Malaybalay';
process.env.PROVINCE = 'Bukidnon';
process.env.APP_TIMEZONE_OFFSET_MINUTES = '480';
process.env.CERTIFICATE_VALIDITY_DAYS = '180';

// Ensure temporary env file exists
fs.writeFileSync(
  TEST_ENV_PATH,
  [
    'PORT=5000',
    'NODE_ENV=test',
    `MONGO_URI=${TEST_MONGO_URI}`,
    'JWT_SECRET=quickfile_mail_test_jwt_secret_at_least_32_chars_long',
    'FRONTEND_URL=http://localhost:5173',
    'PUBLIC_APP_URL=http://localhost:5173',
    'SU_ADMIN_KEY=su_key_test_mail_secret_key_12345',
    'BARANGAY_NAME=Barangay Mail',
    'CITY_MUNICIPALITY=Malaybalay',
    'PROVINCE=Bukidnon',
    'APP_TIMEZONE_OFFSET_MINUTES=480',
    'CERTIFICATE_VALIDITY_DAYS=180',
  ].join('\n'),
  'utf8'
);

const app = require('./app');
const { connectDB, disconnectDB } = require('./src/config/db');
const {
  User,
  CitizenProfile,
  DocumentType,
  DocumentRequest,
  IssuedDocument,
  AppSetting,
  StaffPermission,
  AuditLog,
} = require('./src/models');
const { API_PREFIX, ROLES, REQUEST_STATUSES, VALIDITY_STATUSES } = require('./src/config/constants');
const { isValidEmail, STRICT_EMAIL_REGEX } = require('./src/utils/emailValidator');
const { escapeHtml } = require('./src/utils/escapeHtml');
const { setMailTransport } = require('./src/utils/mailer');

function makeHttpRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const { path, method = 'GET', headers = {} } = options;
    const postData = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = { ...headers };
    if (postData && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (postData) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: reqHeaders,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          let parsed;
          try {
            parsed = JSON.parse(raw.toString('utf8'));
          } catch {
            parsed = raw.toString('utf8');
          }
          resolve({ status: res.statusCode, headers: res.headers, data: parsed, buffer: raw });
        });
      }
    );
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

function generateAdminToken(adminUser) {
  return jwt.sign(
    {
      id: adminUser._id.toString(),
      role: ROLES.ADMIN,
      email: adminUser.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function generateStaffToken(staffUser) {
  return jwt.sign(
    {
      id: staffUser._id.toString(),
      role: ROLES.STAFF,
      email: staffUser.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function runMailSecurityTests() {
  console.log('=== STARTING MAIL SECURITY TEST SUITE ===\n');

  let server;
  const sentEmails = [];

  // Capture all sent emails via pluggable mail transport
  setMailTransport({
    sendMail: async (mailOptions) => {
      sentEmails.push(mailOptions);
      return { messageId: `mock-mail-${Date.now()}` };
    },
  });

  try {
    await connectDB();
    server = http.createServer(app);
    await new Promise((res) => server.listen(0, '127.0.0.1', res));

    // Clear test collections directly at driver level
    const mongoose = require('mongoose');
    const collections = await mongoose.connection.db.collections();
    for (const c of collections) {
      await c.deleteMany({});
    }

    // Enable email notifications in settings
    await AppSetting.create({
      key: 'enable_email_notifications',
      value: true,
      description: 'System email notifications',
    });

    // Create test admin
    const adminUser = await User.create({
      email: 'admin.mail@quickfile.gov.ph',
      password_hash: await User.hashPassword('AdminPass123!'),
      full_name: 'Admin Secure Mail',
      role: ROLES.ADMIN,
      is_active: true,
    });
    const adminToken = generateAdminToken(adminUser);

    // Create test staff
    const staffUser = await User.create({
      email: 'staff.mail@quickfile.gov.ph',
      password_hash: await User.hashPassword('StaffPass123!'),
      full_name: 'Staff Secure Mail',
      role: ROLES.STAFF,
      is_active: true,
    });
    await StaffPermission.create({
      user_id: staffUser._id,
      can_review_requests: true,
      can_prepare_documents: true,
      can_print_documents: true,
      can_release_documents: true,
      can_verify_qr: true,
      can_view_reports: true,
      can_archive_records: true,
    });
    const staffToken = generateStaffToken(staffUser);

    // -----------------------------------------------------------------------
    // CHECK 1: Nodemailer version check
    // -----------------------------------------------------------------------
    const nodemailerPkg = require('nodemailer/package.json');
    assert.strictEqual(
      nodemailerPkg.version,
      '10.4.0',
      `Expected nodemailer 10.4.0, found ${nodemailerPkg.version}`
    );
    console.log(`PASS: nodemailer version is verified at exact version 10.4.0 (found: ${nodemailerPkg.version}).`);

    // -----------------------------------------------------------------------
    // CHECK 2: isValidEmail unit tests
    // -----------------------------------------------------------------------
    // 2a: Valid emails
    assert.strictEqual(isValidEmail('citizen@example.gov.ph'), true);
    assert.strictEqual(isValidEmail('user.name+tag@sub.example.com'), true);
    assert.strictEqual(isValidEmail('a@b.co'), true);
    console.log('PASS: isValidEmail correctly accepts standard, subdomained, and tagged email addresses.');

    // 2b: Non-string and empty string
    assert.strictEqual(isValidEmail(null), false);
    assert.strictEqual(isValidEmail(undefined), false);
    assert.strictEqual(isValidEmail(''), false);
    assert.strictEqual(isValidEmail('   '), false);
    assert.strictEqual(isValidEmail(12345), false);
    console.log('PASS: isValidEmail correctly rejects non-string and whitespace-only inputs.');

    // 2c: Malformed structure
    assert.strictEqual(isValidEmail('plainaddress'), false);
    assert.strictEqual(isValidEmail('@missinglocal.com'), false);
    assert.strictEqual(isValidEmail('user@'), false);
    assert.strictEqual(isValidEmail('user@domain'), false);
    assert.strictEqual(isValidEmail('user@.domain.com'), false);
    assert.strictEqual(isValidEmail('user@domain..com'), false);
    console.log('PASS: isValidEmail correctly rejects addresses lacking @, local part, or valid domain.');

    // 2d: Consecutive dots & leading/trailing dots in local part
    assert.strictEqual(isValidEmail('user..name@domain.com'), false);
    assert.strictEqual(isValidEmail('.username@domain.com'), false);
    assert.strictEqual(isValidEmail('username.@domain.com'), false);
    console.log('PASS: isValidEmail correctly rejects consecutive and leading/trailing dots in local-part.');

    // 2e: Length limit (RFC 5321: max 254 chars total, max 64 chars local-part)
    const longLocal = 'a'.repeat(65) + '@example.com';
    assert.strictEqual(isValidEmail(longLocal), false, 'Local-part > 64 chars should be rejected');

    const exact254 = 'a'.repeat(64) + '@' + 'b'.repeat(60) + '.' + 'c'.repeat(60) + '.' + 'd'.repeat(63) + '.com';
    assert.strictEqual(exact254.length, 254, 'Constructed email should be exactly 254 chars');
    assert.strictEqual(isValidEmail(exact254), true, 'Email of exactly 254 chars should be accepted');

    const over254 = 'a'.repeat(64) + '@' + 'b'.repeat(60) + '.' + 'c'.repeat(60) + '.' + 'd'.repeat(64) + '.com';
    assert.strictEqual(over254.length, 255, 'Constructed email should be 255 chars');
    assert.strictEqual(isValidEmail(over254), false, 'Email of 255 chars should be rejected');
    console.log('PASS: isValidEmail enforces RFC 5321 length limits (local-part <= 64, total <= 254).');

    // -----------------------------------------------------------------------
    // CHECK 3: escapeHtml unit tests
    // -----------------------------------------------------------------------
    assert.strictEqual(
      escapeHtml('<script>alert("XSS")</script>&\'hello\''),
      '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;&amp;&#39;hello&#39;'
    );
    assert.strictEqual(escapeHtml(null), '');
    assert.strictEqual(escapeHtml(undefined), '');
    assert.strictEqual(escapeHtml('Normal String 123!'), 'Normal String 123!');
    console.log('PASS: escapeHtml safely sanitizes all 5 sensitive HTML entities and handles empty values.');

    // -----------------------------------------------------------------------
    // CHECK 4: Citizen Registration Email Validation (POST /api/v1/auth/register)
    // -----------------------------------------------------------------------
    // 4a: Malformed email rejected with 400
    const regResMalformed = await makeHttpRequest(
      server,
      { path: `${API_PREFIX}/auth/register`, method: 'POST' },
      {
        email: 'invalid-email-format',
        password: 'Password123!',
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        birthdate: '1990-01-01',
        gender: 'male',
      }
    );
    assert.strictEqual(regResMalformed.status, 400);
    assert.strictEqual(regResMalformed.data.success, false);
    console.log('PASS: citizen registration rejects malformed email format with 400.');

    // 4b: Email exceeding 254 chars rejected with 400
    const regResOver254 = await makeHttpRequest(
      server,
      { path: `${API_PREFIX}/auth/register`, method: 'POST' },
      {
        email: over254,
        password: 'Password123!',
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        birthdate: '1990-01-01',
        gender: 'male',
      }
    );
    assert.strictEqual(regResOver254.status, 400);
    assert.strictEqual(regResOver254.data.success, false);
    console.log('PASS: citizen registration rejects email exceeding 254 characters with 400.');

    // 4c: Valid registration succeeds with 201
    const validCitizenEmail = 'juan.delacruz@mailtest.gov.ph';
    const regResValid = await makeHttpRequest(
      server,
      { path: `${API_PREFIX}/auth/register`, method: 'POST' },
      {
        email: validCitizenEmail,
        password: 'Password123!',
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        birthdate: '1990-01-01',
        gender: 'male',
        civil_status: 'single',
      }
    );
    assert.strictEqual(regResValid.status, 201);
    assert.strictEqual(regResValid.data.success, true);
    console.log('PASS: citizen registration succeeds with 201 for valid email format.');

    // -----------------------------------------------------------------------
    // CHECK 5: Admin Staff Creation Email Validation (POST /api/v1/admin/staff)
    // -----------------------------------------------------------------------
    // 5a: Malformed email rejected with 400
    const staffResMalformed = await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/admin/staff`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        email: 'not-an-email',
        password: 'StaffPassword123',
        full_name: 'Clerk Person',
        phone: '09171234567',
      }
    );
    assert.strictEqual(staffResMalformed.status, 400);
    assert.strictEqual(staffResMalformed.data.success, false);
    console.log('PASS: admin staff creation rejects malformed email format with 400.');

    // 5b: Email exceeding 254 chars rejected with 400
    const staffResOver254 = await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/admin/staff`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        email: over254,
        password: 'StaffPassword123',
        full_name: 'Clerk Person',
        phone: '09171234567',
      }
    );
    assert.strictEqual(staffResOver254.status, 400);
    assert.strictEqual(staffResOver254.data.success, false);
    console.log('PASS: admin staff creation rejects email exceeding 254 characters with 400.');

    // 5c: Valid staff creation succeeds with 201
    const validStaffEmail = 'clerk.new@mailtest.gov.ph';
    const staffResValid = await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/admin/staff`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        email: validStaffEmail,
        password: 'StaffPassword123',
        full_name: 'Clerk New Person',
        phone: '09171234567',
        position: 'Records Officer',
      }
    );
    assert.strictEqual(staffResValid.status, 201);
    assert.strictEqual(staffResValid.data.success, true);
    console.log('PASS: admin staff creation succeeds with 201 for valid email format.');

    // -----------------------------------------------------------------------
    // CHECK 6: HTML Injection Prevention in Outgoing Emails
    // -----------------------------------------------------------------------
    // 6a: Password reset email escapes XSS in citizen full_name
    const xssCitizenEmail = 'xss.target@mailtest.gov.ph';
    const xssPayloadName = 'Malicious<script>alert("xss")</script><img src=x onerror=alert(1)> User';
    const xssUser = await User.create({
      email: xssCitizenEmail,
      password_hash: await User.hashPassword('Password123!'),
      full_name: xssPayloadName,
      role: ROLES.CITIZEN,
      is_active: true,
    });
    await CitizenProfile.create({
      user_id: xssUser._id,
      first_name: 'Malicious',
      last_name: 'User',
      birthdate: new Date('1990-01-01'),
      gender: 'male',
      civil_status: 'single',
    });

    sentEmails.length = 0; // Clear mailbox
    const forgotRes = await makeHttpRequest(
      server,
      { path: `${API_PREFIX}/auth/forgot-password`, method: 'POST' },
      { email: xssCitizenEmail }
    );
    assert.strictEqual(forgotRes.status, 200);

    // Allow non-blocking sendMail promise tick
    await new Promise((r) => setTimeout(r, 150));
    assert.strictEqual(sentEmails.length, 1, 'One password reset email should have been sent');
    const resetMail = sentEmails[0];
    assert.strictEqual(resetMail.to, xssCitizenEmail);
    // Verify unescaped HTML injection is NOT present
    assert.strictEqual(
      resetMail.html.includes('<script>'),
      false,
      'Raw <script> tag must not exist in email HTML'
    );
    assert.strictEqual(
      resetMail.html.includes('<img src=x'),
      false,
      'Raw <img tag must not exist in email HTML'
    );
    // Verify escaped HTML entities ARE present
    assert(
      resetMail.html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'),
      'Escaped script tag should be present in email HTML'
    );
    assert(
      resetMail.html.includes('&lt;img src=x onerror=alert(1)&gt;'),
      'Escaped img tag should be present in email HTML'
    );
    console.log('PASS: password reset email safely HTML-escapes citizen full_name containing XSS payload.');

    // 6b: Document rejection email escapes XSS payload in reason and tracking number
    const testDocType = await DocumentType.create({
      code: 'BARANGAY_CLEARANCE_MAIL',
      name: 'Barangay Clearance for Mail Security',
      description: 'Test document for mail security',
      fee: 50,
      processing_days: 1,
      is_active: true,
    });

    const malDocReq = await DocumentRequest.create({
      tracking_number: 'TRK-<xss>999</xss>',
      citizen_id: xssUser._id,
      document_type_id: testDocType._id,
      purpose: 'Employment Verification',
      copies: 1,
      fee: 50,
      status: REQUEST_STATUSES.PENDING,
    });

    sentEmails.length = 0; // Clear mailbox
    const rejectReasonPayload = '<b onmouseover=alert("hack")>Rejected for invalid document</b>';
    const rejectRes = await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/${malDocReq._id}/reject`,
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      },
      { rejection_reason: rejectReasonPayload }
    );
    assert.strictEqual(rejectRes.status, 200);

    // Allow non-blocking sendMail promise tick
    await new Promise((r) => setTimeout(r, 150));
    assert.strictEqual(sentEmails.length, 1, 'One rejection email should have been sent');
    const rejectMail = sentEmails[0];
    assert.strictEqual(
      rejectMail.html.includes('<b onmouseover='),
      false,
      'Raw <b onmouseover tag must not exist in email HTML'
    );
    assert.strictEqual(
      rejectMail.html.includes('<xss>'),
      false,
      'Raw <xss> tag must not exist in tracking number in email HTML'
    );
    assert(
      rejectMail.html.includes('&lt;b onmouseover=alert(&quot;hack&quot;)&gt;'),
      'Escaped rejection reason should be present in email HTML'
    );
    assert(
      rejectMail.html.includes('TRK-&lt;XSS&gt;999&lt;/XSS&gt;'),
      'Escaped tracking number should be present in email HTML'
    );
    console.log('PASS: document rejection email safely HTML-escapes reason and tracking number.');

    // 6c: Document ready for pickup email escapes XSS payload in doc name and citizen name
    const xssDocType = await DocumentType.create({
      code: 'DOC_XSS_TYPE',
      name: 'Barangay <iframe src="evil.com"> Certificate',
      description: 'XSS Doc Type',
      fee: 0,
      processing_days: 1,
      is_active: true,
    });

    const issueDocReq = await DocumentRequest.create({
      tracking_number: 'TRK-PICKUP-123',
      citizen_id: xssUser._id,
      document_type_id: xssDocType._id,
      purpose: 'Scholarship Application',
      copies: 1,
      fee: 0,
      status: REQUEST_STATUSES.IN_PREPARATION,
    });

    sentEmails.length = 0; // Clear mailbox
    const issueRes = await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/${issueDocReq._id}/issue`,
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      },
      {}
    );
    assert.strictEqual(issueRes.status, 200);

    // Allow non-blocking sendMail promise tick
    await new Promise((r) => setTimeout(r, 150));
    assert.strictEqual(sentEmails.length, 1, 'One pickup email should have been sent');
    const pickupMail = sentEmails[0];
    assert.strictEqual(
      pickupMail.html.includes('<iframe'),
      false,
      'Raw <iframe tag must not exist in email HTML'
    );
    assert(
      pickupMail.html.includes('&lt;iframe src=&quot;evil.com&quot;&gt;'),
      'Escaped iframe tag should be present in email HTML'
    );
    assert(
      pickupMail.html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'),
      'Escaped citizen name should be present in email HTML'
    );
    console.log('PASS: ready for pickup email safely HTML-escapes document name and citizen name.');

    console.log('\n=== ALL MAIL SECURITY TESTS PASSED SUCCESSFULLY ===');
  } finally {
    if (server && server.listening) {
      await new Promise((res) => server.close(res));
    }
    await disconnectDB();
    if (fs.existsSync(TEST_ENV_PATH)) {
      fs.unlinkSync(TEST_ENV_PATH);
    }
  }
}

if (require.main === module) {
  runMailSecurityTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('MAIL SECURITY TEST SUITE FAILED:', err);
      process.exit(1);
    });
}

module.exports = { runMailSecurityTests };
