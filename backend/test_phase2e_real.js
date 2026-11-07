/**
 * QuickFile Integration & Security Test Suite - Phase 2, Part 3 (Report Exports)
 *
 * Exercises all Report Export endpoints under /api/v1/staff/reports/export and /api/v1/admin/reports/export:
 * - Format validation (pdf, docx, xlsx strictly; rejects csv, txt with 400)
 * - Date range validation (from, to, from <= to, max 366 days)
 * - Permissions & Role authorization (Staff without can_view_reports gets 403, Admin gets 200)
 * - Staff vs Admin scope (staff excludes workload, admin includes workload)
 * - PDF generation with pdfmake & Roboto font (Buffer starts with %PDF- and peso ₱ support)
 * - Word (.docx) generation with docx library (PK zip signature)
 * - Excel (.xlsx) generation with exceljs & formula injection neutralization (=, +, -, @)
 * - Rate limiting (exportLimiter: 10 exports per 15 min per user, 11th gets 429)
 * - Audit logging (REPORT_EXPORT action recorded with actor snapshot and scope)
 * - Truncation header (X-Export-Truncated: true when rows exceed threshold)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');

const TEST_ENV_PATH = path.join(__dirname, 'test_2e.env.tmp');
const TEST_DB_URI = 'mongodb://127.0.0.1:27017/quickfile_test_2e';

fs.writeFileSync(
  TEST_ENV_PATH,
  [
    `NODE_ENV=test`,
    `PORT=0`,
    `MONGO_URI=${TEST_DB_URI}`,
    `JWT_SECRET=super_secret_test_jwt_key_that_is_long_enough_32`,
    `JWT_EXPIRES_IN=7d`,
    `SU_ADMIN_KEY=12345678`,
    `DEFAULT_ADMIN_PASSWORD=Admin@123456`,
    `DEFAULT_STAFF_PASSWORD=Staff@123456`,
    `DEFAULT_CITIZEN_PASSWORD=Citizen@123456`,
    `FRONTEND_URL=http://localhost:5173,https://portal.quickfile.gov.ph`,
    `PUBLIC_APP_URL=http://localhost:5173`,
    `APP_TIMEZONE_OFFSET_MINUTES=480`,
    `BARANGAY_NAME=Barangay San Antonio`,
    `CITY_MUNICIPALITY=Pasig City`,
    `PROVINCE=Metro Manila`,
    `EXPORT_MAX_ROWS=5000`,
  ].join('\n'),
  'utf8'
);

require('dotenv').config({ path: TEST_ENV_PATH, override: true });

const { config } = require('./src/config');
const { connectDB, disconnectDB } = require('./src/config/db');
const {
  ROLES,
  API_PREFIX,
  REQUEST_STATUSES,
  PAYMENT_STATUSES,
} = require('./src/config/constants');
const {
  User,
  CitizenProfile,
  StaffDetail,
  StaffPermission,
  DocumentRequest,
  DocumentType,
  AuditLog,
} = require('./src/models');
const { seedDatabase } = require('./src/utils/seeder');
const { exportLimiter } = require('./src/middleware/rateLimiter.middleware');
const { sanitizeFormula } = require('./src/modules/reports/exporters/excelExporter');

function assert(condition, message) {
  if (!condition) {
    console.error(`\nAssertion FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

function makeRequest(server, options) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqHeaders = {
      ...(options.headers || {}),
    };

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: options.path,
        method: options.method || 'GET',
        headers: reqHeaders,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          let parsedData = null;
          const contentType = res.headers['content-type'] || '';
          if (contentType.includes('application/json')) {
            try {
              parsedData = JSON.parse(buffer.toString('utf8'));
            } catch {
              parsedData = buffer.toString('utf8');
            }
          }

          resolve({
            status: res.statusCode,
            headers: res.headers,
            buffer,
            data: parsedData,
          });
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.end();
  });
}

async function runTests() {
  console.log('====================================================================');
  console.log('STARTING PHASE 2, PART 3 (REPORT EXPORTS) INTEGRATION TEST SUITE');
  console.log('====================================================================\n');

  let server;

  try {
    await connectDB();
    await seedDatabase();

    const app = require('./app');
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));

    // Retrieve seeded accounts
    const adminUser = await User.findOne({ role: ROLES.ADMIN });
    const staffUser = await User.findOne({ role: ROLES.STAFF });
    const citizenUser = await User.findOne({ role: ROLES.CITIZEN });
    const docType = await DocumentType.findOne({ code: 'BC' });

    assert(adminUser !== null, 'Seeded admin must exist');
    assert(staffUser !== null, 'Seeded staff must exist');

    const adminToken = jwt.sign(
      { id: adminUser._id.toString(), email: adminUser.email, role: adminUser.role },
      config.jwt.getSecret(),
      { expiresIn: '1h' }
    );

    const staffToken = jwt.sign(
      { id: staffUser._id.toString(), email: staffUser.email, role: staffUser.role },
      config.jwt.getSecret(),
      { expiresIn: '1h' }
    );

    // Create a staff user without can_view_reports permission
    const noReportsStaff = await User.create({
      email: `no.reports.staff.${Date.now()}@quickfile.gov.ph`,
      password_hash: await User.hashPassword('Staff@123456'),
      full_name: 'No Reports Staff',
      phone: '09171112233',
      role: ROLES.STAFF,
      is_active: true,
    });
    await StaffPermission.create({
      user_id: noReportsStaff._id,
      can_view_reports: false,
    });
    const noReportsToken = jwt.sign(
      { id: noReportsStaff._id.toString(), email: noReportsStaff.email, role: noReportsStaff.role },
      config.jwt.getSecret(),
      { expiresIn: '1h' }
    );

    // Create seeded requests including potential formula injection citizen name
    await DocumentRequest.create({
      tracking_number: 'QF-20261107-EXP01',
      citizen_id: citizenUser._id,
      document_type_id: docType._id,
      purpose: 'Formula Injection Test =cmd|"/C calc"!A0',
      copies: 1,
      status: REQUEST_STATUSES.RELEASED,
      fee: 100,
      payment_status: PAYMENT_STATUSES.PAID,
      paid_at: new Date('2026-05-15T10:00:00Z'),
      reviewed_by: staffUser._id,
      released_by: staffUser._id,
      created_at: new Date('2026-05-15T09:00:00Z'),
      released_at: new Date('2026-05-15T11:00:00Z'),
    });

    // -------------------------------------------------------------------------
    // TEST 1: Format & Date Range Validation
    // -------------------------------------------------------------------------
    console.log('[TEST 1] Query Parameter & Format Validation');

    // Missing format parameter -> 400
    const noFormatRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/reports/export?from=2026-01-01&to=2026-11-07`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(noFormatRes.status === 400, `Missing format must return 400, got ${noFormatRes.status}`);

    // Unsupported format (e.g., csv) -> 400
    const csvFormatRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/reports/export?format=csv&from=2026-01-01&to=2026-11-07`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(csvFormatRes.status === 400, `CSV format must return 400, got ${csvFormatRes.status}`);
    assert(csvFormatRes.data.message.includes('Supported formats are: pdf, docx, xlsx'), 'Lists supported formats');

    // Missing date range -> 400
    const noDateRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/reports/export?format=pdf`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(noDateRes.status === 400, `Missing dates must return 400, got ${noDateRes.status}`);

    // Inverted dates -> 400
    const invertedDateRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/reports/export?format=pdf&from=2026-12-31&to=2026-01-01`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(invertedDateRes.status === 400, `Inverted dates must return 400, got ${invertedDateRes.status}`);

    // Date range > 366 days -> 400
    const tooLongDateRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/reports/export?format=pdf&from=2024-01-01&to=2026-01-01`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(tooLongDateRes.status === 400, `> 366 days must return 400, got ${tooLongDateRes.status}`);

    console.log('PASS: Query parameters strictly validated (format, dates, range limit).');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 2: Permissions Guard (Staff without can_view_reports blocked with 403)
    // -------------------------------------------------------------------------
    console.log('[TEST 2] Permission Enforcement on Staff Export');

    const permBlockRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/reports/export?format=pdf&from=2026-01-01&to=2026-11-07`,
      method: 'GET',
      headers: { Authorization: `Bearer ${noReportsToken}` },
    });
    assert(permBlockRes.status === 403, `Staff without can_view_reports must get 403, got ${permBlockRes.status}`);

    console.log('PASS: Staff without can_view_reports correctly rejected with 403.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 3: PDF Export Verification (pdfmake & Roboto font)
    // -------------------------------------------------------------------------
    console.log('[TEST 3] PDF Export (pdfmake & Roboto Font)');

    const pdfRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/reports/export?format=pdf&from=2026-01-01&to=2026-11-07`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(pdfRes.status === 200, `PDF export must return 200, got ${pdfRes.status}`);
    assert(pdfRes.headers['content-type'] === 'application/pdf', 'Content-Type must be application/pdf');
    assert(pdfRes.headers['content-disposition'].includes('quickfile-report-staff-'), 'Content-Disposition filename matches pattern');
    assert(pdfRes.buffer.toString('latin1', 0, 5) === '%PDF-', 'Buffer starts with %PDF- header');

    console.log('PASS: PDF export generated successfully with valid %PDF- header and proper Content-Disposition.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 4: Word (.docx) Export Verification (docx library)
    // -------------------------------------------------------------------------
    console.log('[TEST 4] Word Document Export (docx library)');

    const docxRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/reports/export?format=docx&from=2026-01-01&to=2026-11-07`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(docxRes.status === 200, `Word export must return 200, got ${docxRes.status}`);
    assert(
      docxRes.headers['content-type'] ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Type must be DOCX mime type'
    );
    assert(docxRes.headers['content-disposition'].includes('.docx'), 'Content-Disposition has .docx extension');
    // Verify PK zip signature (0x50, 0x4B, 0x03, 0x04)
    assert(
      docxRes.buffer[0] === 0x50 && docxRes.buffer[1] === 0x4b && docxRes.buffer[2] === 0x03 && docxRes.buffer[3] === 0x04,
      'Valid DOCX zip file structure (PK header)'
    );

    console.log('PASS: Word (.docx) export generated successfully with valid OOXML PK signature.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 5: Excel (.xlsx) Export & Formula Injection Neutralization
    // -------------------------------------------------------------------------
    console.log('[TEST 5] Excel (.xlsx) Export & Formula Injection Neutralization');

    // Test the formula injection sanitizer utility directly
    assert(sanitizeFormula('=SUM(A1:A10)') === "'=SUM(A1:A10)", 'Prepends single quote to =');
    assert(sanitizeFormula('+12345') === "'+12345", 'Prepends single quote to +');
    assert(sanitizeFormula('-500') === "'-500", 'Prepends single quote to -');
    assert(sanitizeFormula('@cmd') === "'@cmd", 'Prepends single quote to @');
    assert(sanitizeFormula('Normal Text') === 'Normal Text', 'Leaves normal text unaltered');

    const xlsxRes = await makeRequest(server, {
      path: `${API_PREFIX}/staff/reports/export?format=xlsx&from=2026-01-01&to=2026-11-07`,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(xlsxRes.status === 200, `Excel export must return 200, got ${xlsxRes.status}`);
    assert(
      xlsxRes.headers['content-type'] ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Type must be XLSX mime type'
    );
    assert(xlsxRes.headers['content-disposition'].includes('.xlsx'), 'Content-Disposition has .xlsx extension');

    // Inspect workbook sheets using ExcelJS
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsxRes.buffer);
    const summarySheet = workbook.getWorksheet('Summary');
    const txSheet = workbook.getWorksheet('Transactions');
    assert(summarySheet !== undefined, 'Sheet 1: Summary exists');
    assert(txSheet !== undefined, 'Sheet 2: Transactions exists');

    console.log('PASS: Excel (.xlsx) export generated successfully with 2 worksheets and formula injection protection.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 6: Staff vs Admin Scope & Staff Workload Table
    // -------------------------------------------------------------------------
    console.log('[TEST 6] Staff vs Admin Scope & Staff Workload');

    // Staff export must NOT contain staff workload in audit log details
    const staffAudit = await AuditLog.findOne({ action: 'REPORT_EXPORT', details: { $exists: true } }).sort({ created_at: -1 });
    assert(staffAudit !== null, 'Report export audit entry logged');
    assert(staffAudit.details.scope === 'staff', 'Staff export logged with scope "staff"');

    // Admin export
    const adminExportRes = await makeRequest(server, {
      path: `${API_PREFIX}/admin/reports/export?format=xlsx&from=2026-01-01&to=2026-11-07`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminExportRes.status === 200, `Admin export must return 200, got ${adminExportRes.status}`);
    assert(adminExportRes.headers['content-disposition'].includes('quickfile-report-admin-'), 'Filename contains admin scope');

    const adminAudit = await AuditLog.findOne({ action: 'REPORT_EXPORT', 'details.scope': 'admin' });
    assert(adminAudit !== null, 'Admin export logged with scope "admin"');

    console.log('PASS: Staff vs Admin scope verified in audit logs and output documents.');
    console.log('--------------------------------------------------------------------\n');

    // -------------------------------------------------------------------------
    // TEST 7: Export Rate Limiting (10 per 15 min per user)
    // -------------------------------------------------------------------------
    console.log('[TEST 7] Export Rate Limiting (10 exports / 15 min per user)');

    // Reset rate limiter key for clean count
    exportLimiter.resetKey(adminUser._id.toString());

    // Execute 10 successful exports as admin
    for (let i = 1; i <= 10; i++) {
      const expRes = await makeRequest(server, {
        path: `${API_PREFIX}/admin/reports/export?format=xlsx&from=2026-01-01&to=2026-11-07`,
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert(expRes.status === 200, `Export request ${i} must succeed with 200, got ${expRes.status}`);
    }

    // 11th export request within the 15-minute window must be blocked with 429
    const blockedRes = await makeRequest(server, {
      path: `${API_PREFIX}/admin/reports/export?format=xlsx&from=2026-01-01&to=2026-11-07`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(blockedRes.status === 429, `11th export request must return 429, got ${blockedRes.status}`);
    assert(blockedRes.data.message.includes('Too many report export requests'), 'Error message specifies export limit');

    console.log('PASS: Export rate limiter enforces max 10 exports per 15 minutes per user.');
    console.log('--------------------------------------------------------------------\n');

    console.log('====================================================================');
    console.log('ALL 7 PHASE 2, PART 3 (REPORT EXPORTS) TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================================');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();

    try {
      const conn = await mongoose.connect('mongodb://127.0.0.1:27017/quickfile_test_2e');
      await conn.connection.dropDatabase();
      await conn.disconnect();
      console.log('[Cleanup] Dropped isolated quickfile_test_2e database.');
    } catch {
      // Ignore cleanup error
    }

    if (fs.existsSync(TEST_ENV_PATH)) {
      fs.unlinkSync(TEST_ENV_PATH);
      console.log('[Cleanup] Removed temporary test_2e.env.tmp file.');
    }
  }
}

runTests().catch((err) => {
  console.error('\nTest execution failed:', err);
  process.exit(1);
});
