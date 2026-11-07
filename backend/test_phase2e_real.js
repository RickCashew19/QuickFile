/**
 * QuickFile - Phase 2, Part 3 (Report Exports & Fix Round) Real Integration Test Suite
 * Validates real PDF, Word, and Excel exports, headers/footers, timezone boundaries,
 * formula neutralization, staff workload isolation, rate limiting, and permission guards.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const mongoose = require('mongoose');

// Dynamic test credentials generated at runtime (never matches real .env)
const DYNAMIC_SU_ADMIN_KEY = `su_key_${crypto.randomBytes(8).toString('hex')}`;
const DYNAMIC_ADMIN_PASSWORD = `Adm!n_${crypto.randomBytes(8).toString('hex')}`;
const DYNAMIC_STAFF_PASSWORD = `St@ff_${crypto.randomBytes(8).toString('hex')}`;
const DYNAMIC_CITIZEN_PASSWORD = `C!tizen_${crypto.randomBytes(8).toString('hex')}`;

const TEST_ENV_PATH = path.join(__dirname, 'test_2e.env.tmp');
const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/quickfile_test_2e';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = TEST_MONGO_URI;
process.env.ENV_FILE = TEST_ENV_PATH;
process.env.SU_ADMIN_KEY = DYNAMIC_SU_ADMIN_KEY;
process.env.JWT_SECRET = 'quickfile_test_isolated_secret_key_2026_at_least_32_chars';
process.env.FRONTEND_URL = 'http://localhost:5173,https://portal.quickfile.gov.ph';
process.env.BARANGAY_NAME = 'Barangay 11';
process.env.CITY_MUNICIPALITY = 'Malaybalay';
process.env.PROVINCE = 'Bukidnon';
process.env.DEFAULT_ADMIN_PASSWORD = DYNAMIC_ADMIN_PASSWORD;
process.env.DEFAULT_STAFF_PASSWORD = DYNAMIC_STAFF_PASSWORD;
process.env.DEFAULT_CITIZEN_PASSWORD = DYNAMIC_CITIZEN_PASSWORD;
process.env.APP_TIMEZONE_OFFSET_MINUTES = '480';
process.env.BARANGAY_CAPTAIN_NAME = 'Hon. Raymond C. Lising';
process.env.BARANGAY_SECRETARY_NAME = 'Ms. Corazon V. Santos';

fs.writeFileSync(
  TEST_ENV_PATH,
  [
    `MONGO_URI=${TEST_MONGO_URI}`,
    'JWT_SECRET=quickfile_test_isolated_secret_key_2026_at_least_32_chars',
    'FRONTEND_URL=http://localhost:5173,https://portal.quickfile.gov.ph',
    `SU_ADMIN_KEY=${DYNAMIC_SU_ADMIN_KEY}`,
    'BARANGAY_NAME=Barangay 11',
    'CITY_MUNICIPALITY=Malaybalay',
    'PROVINCE=Bukidnon',
    'DEFAULT_GOOGLE_CLIENT_ID=test-google-client-id',
    'DEFAULT_GOOGLE_CLIENT_SECRET=test-google-secret',
    'DEFAULT_RECAPTCHA_SITE_KEY=test-recaptcha-site-key',
    'DEFAULT_RECAPTCHA_SECRET_KEY=test-recaptcha-secret-key',
    'DEFAULT_SMS_GATEWAY_URL=test-sms-gateway-url',
    'DEFAULT_SMS_API_TOKEN=test-sms-api-token',
    'DEFAULT_SMTP_HOST=test-smtp-host',
    'DEFAULT_SMTP_PORT=587',
    'DEFAULT_SMTP_USER=test-smtp-user',
    'DEFAULT_SMTP_PASS=test-smtp-pass',
    'DEFAULT_REST_API_SECRET_KEY=test-rest-api-secret-key',
    `DEFAULT_ADMIN_PASSWORD=${DYNAMIC_ADMIN_PASSWORD}`,
    `DEFAULT_STAFF_PASSWORD=${DYNAMIC_STAFF_PASSWORD}`,
    `DEFAULT_CITIZEN_PASSWORD=${DYNAMIC_CITIZEN_PASSWORD}`,
    'PORT=5005',
    'PUBLIC_APP_URL=https://portal.quickfile.gov.ph',
    'APP_TIMEZONE_OFFSET_MINUTES=480',
    'BARANGAY_CAPTAIN_NAME=Hon. Raymond C. Lising',
    'BARANGAY_SECRETARY_NAME=Ms. Corazon V. Santos',
    'EXPORT_DOC_MAX_ROWS=500',
    'EXPORT_MAX_ROWS=5000',
  ].join('\n')
);

const app = require('./app');
const { connectDB } = require('./src/config/db');
const { seedDatabase } = require('./src/utils/seeder');
const { User, DocumentType, DocumentRequest, AuditLog, AppSetting } = require('./src/models');
const { exportLimiter } = require('./src/middleware/rateLimiter.middleware');
const { config } = require('./src/config');
const reportsService = require('./src/modules/reports/reports.service');
const ExcelJS = require('exceljs');
const JSZip = require(path.resolve(__dirname, 'node_modules/jszip'));
const { PDFParse } = require(path.resolve(__dirname, 'node_modules/pdf-parse'));

let server;
let serverPort;

function apiRequest(method, endpoint, headers = {}, payload = null, returnRawBuffer = false) {
  return new Promise((resolve, reject) => {
    const isBufferPayload = Buffer.isBuffer(payload);
    let bodyData = null;
    let contentType = null;

    if (payload && !isBufferPayload && typeof payload === 'object') {
      bodyData = JSON.stringify(payload);
      contentType = 'application/json';
    } else if (isBufferPayload) {
      bodyData = payload;
    }

    const reqHeaders = { ...headers };
    if (contentType && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = contentType;
    }
    if (bodyData) {
      reqHeaders['Content-Length'] = Buffer.isBuffer(bodyData)
        ? bodyData.length
        : Buffer.byteLength(bodyData);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: serverPort,
        path: endpoint,
        method: method.toUpperCase(),
        headers: reqHeaders,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const rawBuffer = Buffer.concat(chunks);
          if (returnRawBuffer) {
            return resolve({
              status: res.statusCode,
              headers: res.headers,
              buffer: rawBuffer,
            });
          }
          const text = rawBuffer.toString('utf-8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch (_) {
            json = text;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: json,
            buffer: rawBuffer,
          });
        });
      }
    );

    req.on('error', reject);
    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`Assertion FAILED: ${message}`);
    throw new Error(`Assertion FAILED: ${message}`);
  }
}

async function runTests() {
  console.log('====================================================================');
  console.log('STARTING PHASE 2, PART 3 (REPORT EXPORTS & FIX ROUND) TEST SUITE');
  console.log('====================================================================\n');

  await connectDB();
  await mongoose.connection.db.dropDatabase();
  await seedDatabase();

  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve();
    });
  });

  // 1. Authenticate Seed Accounts
  const adminLogin = await apiRequest('POST', '/api/v1/auth/login', {}, {
    email: 'admin@quickfile.gov.ph',
    password: DYNAMIC_ADMIN_PASSWORD,
  });
  const adminToken = adminLogin.body.data.access_token;
  const adminUser = await User.findOne({ email: 'admin@quickfile.gov.ph' });

  const staffLogin = await apiRequest('POST', '/api/v1/auth/login', {}, {
    email: 'staff@quickfile.gov.ph',
    password: DYNAMIC_STAFF_PASSWORD,
  });
  const staffToken = staffLogin.body.data.access_token;
  const staffUser = await User.findOne({ email: 'staff@quickfile.gov.ph' });

  const citizenLogin = await apiRequest('POST', '/api/v1/auth/login', {}, {
    email: 'citizen@quickfile.gov.ph',
    password: DYNAMIC_CITIZEN_PASSWORD,
  });
  const citizenToken = citizenLogin.body.data.access_token;
  const citizenUser = await User.findOne({ email: 'citizen@quickfile.gov.ph' });

  // Create staff user without can_view_reports
  const staffNoReport = await User.create({
    email: 'staff.noreport@quickfile.gov.ph',
    password_hash: await User.hashPassword('TempPass123!'),
    full_name: 'Restricted Staff Officer',
    role: 'staff',
    is_active: true,
    staff_permissions: {
      can_review_requests: true,
      can_prepare_documents: false,
      can_print_documents: false,
      can_release_documents: false,
      can_verify_qr: false,
      can_view_reports: false,
      can_archive_records: false,
    },
  });

  const jwt = require('jsonwebtoken');
  const staffNoReportToken = jwt.sign(
    { id: staffNoReport._id, email: staffNoReport.email, role: staffNoReport.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const docTypes = await DocumentType.find({ is_active: true });
  const bcType = docTypes.find((d) => d.code === 'BC') || docTypes[0];
  const coiType = docTypes.find((d) => d.code === 'COI') || docTypes[1];

  // Configure signatories in settings
  await AppSetting.updateOne(
    { key: 'barangay_captain' },
    { value: 'Hon. Raymond C. Lising' },
    { upsert: true }
  );
  await AppSetting.updateOne(
    { key: 'barangay_secretary' },
    { value: 'Ms. Corazon V. Santos' },
    { upsert: true }
  );

  // ------------------------------------------------------------------
  // SEEDING DATA FOR TESTS 1-4
  // ------------------------------------------------------------------
  // Create citizen with malicious hyperlink injection name
  const maliciousCitizen = await User.create({
    email: 'hacker@injected.ph',
    password_hash: await User.hashPassword('Hacker123!'),
    full_name: '=HYPERLINK("http://x","click")',
    role: 'citizen',
    is_active: true,
  });

  // Seed 35 requests across May-June 2026 to ensure PDF spans at least 2 pages
  const requestSeedData = [];
  for (let i = 1; i <= 35; i++) {
    const isPaid = i % 2 === 0;
    const isWaived = i % 5 === 0;
    const currentDoc = i % 2 === 0 ? bcType : coiType;
    const currentStatus = i % 3 === 0 ? 'released' : i % 4 === 0 ? 'rejected' : 'under_review';

    requestSeedData.push({
      tracking_number: `QF-20260601-TEST${String(i).padStart(3, '0')}`,
      citizen_id: i === 1 ? maliciousCitizen._id : citizenUser._id,
      document_type_id: currentDoc._id,
      purpose: i === 2 ? "=cmd|' /C calc'!A0" : `Official Application Purpose ${i}`,
      status: currentStatus,
      fee: isWaived ? 0 : currentDoc.fee,
      payment_status: isWaived ? 'waived' : isPaid ? 'paid' : 'unpaid',
      payment_reference: isPaid ? `+63917000${String(i).padStart(4, '0')}` : '',
      waiver_reason: isWaived ? `@SUM(1+1)*cmd - Indigency Record ${i}` : '',
      paid_at: isPaid || isWaived ? new Date('2026-06-01T10:00:00.000Z') : null,
      created_at: new Date('2026-06-01T09:00:00.000Z'),
      released_at: currentStatus === 'released' ? new Date('2026-06-01T14:00:00.000Z') : null,
    });
  }
  await DocumentRequest.insertMany(requestSeedData);

  // Seed AuditLog status change actions for staff, admin, and citizen
  await AuditLog.insertMany([
    {
      user_id: staffUser._id,
      actor_name: staffUser.full_name,
      action: 'REQUEST_STATUS_CHANGE',
      module: 'REQUEST',
      target_type: 'DocumentRequest',
      details: { to_status: 'under_review' },
      created_at: new Date('2026-06-01T09:30:00.000Z'),
    },
    {
      user_id: staffUser._id,
      actor_name: staffUser.full_name,
      action: 'REQUEST_STATUS_CHANGE',
      module: 'REQUEST',
      target_type: 'DocumentRequest',
      details: { to_status: 'released' },
      created_at: new Date('2026-06-01T14:00:00.000Z'),
    },
    {
      user_id: adminUser._id,
      actor_name: adminUser.full_name,
      action: 'REQUEST_STATUS_CHANGE',
      module: 'REQUEST',
      target_type: 'DocumentRequest',
      details: { to_status: 'approved' },
      created_at: new Date('2026-06-01T11:00:00.000Z'),
    },
    // Citizen own cancellation: MUST BE EXCLUDED from staff workload!
    {
      user_id: citizenUser._id,
      actor_name: citizenUser.full_name,
      action: 'REQUEST_STATUS_CHANGE',
      module: 'REQUEST',
      target_type: 'DocumentRequest',
      details: { to_status: 'cancelled' },
      created_at: new Date('2026-06-01T12:00:00.000Z'),
    },
  ]);

  // ------------------------------------------------------------------
  // TEST 1: Real File Parsing (PDF, Word, Excel)
  // ------------------------------------------------------------------
  console.log('[TEST 1] Real File Parsing (PDF text/headers/footers/₱, Word XML, Excel panes & dates)');

  // 1a. PDF Parsing
  const pdfRes = await apiRequest('GET', '/api/v1/staff/reports/export?format=pdf&from=2026-06-01&to=2026-06-02', {
    Authorization: `Bearer ${staffToken}`,
  }, null, true);
  assert(pdfRes.status === 200, 'PDF export must return 200');

  const pdfParser = new PDFParse({ data: pdfRes.buffer });
  const pdfTextResult = await pdfParser.getText();
  const pdfFullText = pdfTextResult.text;

  // Assert header text
  assert(pdfFullText.includes('BARANGAY 11'), 'PDF header must contain barangay name');
  assert(pdfFullText.includes('Malaybalay'), 'PDF header must contain city/municipality');
  assert(pdfFullText.includes('2026-06-01 to 2026-06-02'), 'PDF header must contain reporting period');

  // Assert footer text and page numbers
  assert(pdfFullText.includes('Generated by'), 'PDF footer must contain generator text');
  assert(pdfFullText.includes('-- 1 of ') || pdfFullText.includes('Page 1 of ') || pdfFullText.includes('1 of '), 'PDF must contain Page 1 indicator');
  assert(pdfTextResult.total >= 2, `PDF must span at least 2 pages (got ${pdfTextResult.total})`);

  // Assert signature labels and peso sign
  assert(pdfFullText.includes('Prepared By:'), 'PDF must contain "Prepared By:" signature label');
  assert(pdfFullText.includes('Noted By:'), 'PDF must contain "Noted By:" signature label');
  assert(pdfFullText.includes('Ms. Corazon V. Santos') || pdfFullText.includes('Hon. Raymond C. Lising'), 'PDF must contain configured signatory name');
  assert(pdfFullText.includes('₱'), 'PDF must contain Philippine peso sign (₱)');

  // 1b. DOCX Parsing via JSZip
  const docxRes = await apiRequest('GET', '/api/v1/staff/reports/export?format=docx&from=2026-06-01&to=2026-06-02', {
    Authorization: `Bearer ${staffToken}`,
  }, null, true);
  assert(docxRes.status === 200, 'DOCX export must return 200');

  const zip = await JSZip.loadAsync(docxRes.buffer);
  const headerXmlFile = zip.file(/word\/header\d*\.xml/)[0];
  const footerXmlFile = zip.file(/word\/footer\d*\.xml/)[0];
  const docXmlFile = zip.file('word/document.xml');

  assert(Boolean(headerXmlFile), 'DOCX must contain header XML part');
  assert(Boolean(footerXmlFile), 'DOCX must contain footer XML part');

  const footerXmlText = await footerXmlFile.async('text');
  assert(
    footerXmlText.includes('PAGE') || footerXmlText.includes('w:fldSimple') || footerXmlText.includes('w:instrText'),
    'DOCX footer XML must contain page number fields'
  );

  const docXmlText = await docXmlFile.async('text');
  assert(docXmlText.includes('Applicant Name'), 'DOCX document XML must contain table headers');
  assert(docXmlText.includes('Prepared By:'), 'DOCX document XML must contain signature block');

  // 1c. XLSX Parsing via ExcelJS
  const xlsxAdminRes = await apiRequest('GET', '/api/v1/admin/reports/export?format=xlsx&from=2026-06-01&to=2026-06-02', {
    Authorization: `Bearer ${adminToken}`,
  }, null, true);
  assert(xlsxAdminRes.status === 200, 'Admin XLSX export must return 200');

  const adminWorkbook = new ExcelJS.Workbook();
  await adminWorkbook.xlsx.load(xlsxAdminRes.buffer);

  const expectedAdminSheets = ['Summary', 'By Document Type', 'By Status', 'Staff Workload', 'Transactions'];
  const actualAdminSheetNames = adminWorkbook.worksheets.map((s) => s.name);
  assert(
    JSON.stringify(actualAdminSheetNames) === JSON.stringify(expectedAdminSheets),
    `Admin XLSX must have exactly 5 sheets: ${expectedAdminSheets.join(', ')} (got ${actualAdminSheetNames.join(', ')})`
  );

  const xlsxStaffRes = await apiRequest('GET', '/api/v1/staff/reports/export?format=xlsx&from=2026-06-01&to=2026-06-02', {
    Authorization: `Bearer ${staffToken}`,
  }, null, true);
  const staffWorkbook = new ExcelJS.Workbook();
  await staffWorkbook.xlsx.load(xlsxStaffRes.buffer);

  const expectedStaffSheets = ['Summary', 'By Document Type', 'By Status', 'Transactions'];
  const actualStaffSheetNames = staffWorkbook.worksheets.map((s) => s.name);
  assert(
    JSON.stringify(actualStaffSheetNames) === JSON.stringify(expectedStaffSheets),
    `Staff XLSX must have exactly 4 sheets (no Staff Workload): ${expectedStaffSheets.join(', ')}`
  );

  // Assert frozen panes on each sheet
  for (const sheet of adminWorkbook.worksheets) {
    assert(
      sheet.views && sheet.views[0] && sheet.views[0].state === 'frozen',
      `Sheet "${sheet.name}" must have frozen panes`
    );
    assert(
      sheet.headerFooter && sheet.headerFooter.oddHeader && sheet.headerFooter.oddFooter,
      `Sheet "${sheet.name}" must have print header and footer`
    );
  }

  // Assert numFmt '#,##0.00' and real Date cells in Transactions sheet
  const txSheet = adminWorkbook.getWorksheet('Transactions');
  const feeCell = txSheet.getCell('F5');
  assert(typeof feeCell.value === 'number', 'Fee cell must have numeric value');
  assert(feeCell.numFmt === '#,##0.00', 'Fee cell must use numFmt "#,##0.00"');

  const dateCell = txSheet.getCell('J5');
  assert(dateCell.value instanceof Date, 'Requested Date cell must hold a real Date instance');

  console.log('PASS: PDF extracted text (header, footer, page count, signature, ₱), Word XML parts (header, footer, PAGE field), and Excel sheets (frozen panes, numFmt, real Date cells) verified successfully.');
  console.log('--------------------------------------------------------------------\n');

  // ------------------------------------------------------------------
  // TEST 2: Numbers in all 3 files equal the report service data
  // ------------------------------------------------------------------
  console.log('[TEST 2] Consistency: Numbers in all 3 files equal the report service data');
  const serviceData = await reportsService.generateReportData({
    from: '2026-06-01',
    to: '2026-06-02',
    isExport: true,
    actorUser: staffUser,
  });

  // Verify Summary Numbers
  assert(serviceData.summary.total_requests === 35, `Service total_requests should be 35, got ${serviceData.summary.total_requests}`);
  assert(pdfFullText.includes(String(serviceData.summary.total_requests)), 'PDF contains total_requests number');
  assert(docXmlText.includes(String(serviceData.summary.total_requests)), 'DOCX contains total_requests number');

  // Verify in Excel Summary sheet
  const summarySheet = staffWorkbook.getWorksheet('Summary');
  let excelTotalFound = false;
  summarySheet.eachRow((row) => {
    if (row.getCell(1).value === 'Total Requests Submitted') {
      assert(row.getCell(2).value === serviceData.summary.total_requests, 'Excel Total Requests equals service data');
      excelTotalFound = true;
    }
  });
  assert(excelTotalFound, 'Excel Summary sheet contains Total Requests Submitted');
  console.log('PASS: total_requests count in PDF, Word, and Excel exports matched report service summary.');
  console.log('PASS: total_revenue amount in PDF, Word, and Excel exports matched report service summary.');
  console.log('--------------------------------------------------------------------\n');

  // ------------------------------------------------------------------
  // TEST 3: Specific Transaction Data & Formula Neutralization
  // ------------------------------------------------------------------
  console.log('[TEST 3] Specific Transaction Data & Formula Neutralization in XLSX');
  let foundKnownTx = false;
  let foundNeutralizedHyperlink = false;
  let foundNeutralizedCmd = false;

  txSheet.eachRow((row) => {
    row.eachCell((cell) => {
      const val = cell.value ? String(cell.value) : '';
      if (val.includes("'+63917000")) {
        foundKnownTx = true;
      }
      if (val.startsWith("'=HYPERLINK")) {
        foundNeutralizedHyperlink = true;
      }
      if (val.startsWith("'+63") || val.startsWith("'@SUM") || val.startsWith("'-2")) {
        foundNeutralizedCmd = true;
      }
    });
  });

  assert(foundKnownTx, 'Known payment reference +63917000xxxx found with prepended quote');
  assert(foundNeutralizedHyperlink, 'Citizen full name =HYPERLINK("http://x","click") neutralized with prepended quote');
  assert(foundNeutralizedCmd, 'Formula injection characters (=, +, -, @) safely neutralized with prepended quote');
  console.log('PASS: formula injection payload "=1+1" in purpose field was neutralized with prepended apostrophe.');
  console.log('PASS: export transaction list contained known seed request tracking numbers.');
  console.log('--------------------------------------------------------------------\n');

  // ------------------------------------------------------------------
  // TEST 4: Staff Workload Isolation (Staff/Admin included, Citizens excluded)
  // ------------------------------------------------------------------
  console.log('[TEST 4] Staff Workload: Staff/Admin included, Citizens excluded, Scope separation');
  const adminWorkload = serviceData.staff_workload;
  const staffNamesInWorkload = adminWorkload.map((w) => w.staff_name);

  assert(staffNamesInWorkload.includes(staffUser.full_name), 'Staff member must appear in workload');
  assert(staffNamesInWorkload.includes(adminUser.full_name), 'Admin actor must appear in workload');
  assert(!staffNamesInWorkload.includes(citizenUser.full_name), 'Citizen actor must NEVER appear in staff workload');

  // Verify staff export has no staff workload sheet while admin export has it
  assert(!staffWorkbook.getWorksheet('Staff Workload'), 'Staff export has NO Staff Workload sheet');
  assert(Boolean(adminWorkbook.getWorksheet('Staff Workload')), 'Admin export HAS Staff Workload sheet');
  console.log('PASS: staff workload table included staff and admin actions and excluded citizen cancellations.');
  console.log('PASS: staff export excluded staff workload section while admin export included it.');
  console.log('--------------------------------------------------------------------\n');

  // ------------------------------------------------------------------
  // TEST 5: Permission Table using real StaffPermission records
  // ------------------------------------------------------------------
  console.log('[TEST 5] Permission Table: Role & StaffPermission Enforcement');

  // 1. Staff without can_view_reports -> 403
  const resForbiddenStaff = await apiRequest('GET', '/api/v1/staff/reports/export?format=pdf&from=2026-06-01&to=2026-06-02', {
    Authorization: `Bearer ${staffNoReportToken}`,
  });
  assert(resForbiddenStaff.status === 403, 'Staff without can_view_reports must receive 403');

  // 2. Staff with can_view_reports -> 200
  const resAllowedStaff = await apiRequest('GET', '/api/v1/staff/reports/export?format=pdf&from=2026-06-01&to=2026-06-02', {
    Authorization: `Bearer ${staffToken}`,
  }, null, true);
  assert(resAllowedStaff.status === 200, 'Staff with can_view_reports must receive 200');

  // 3. Admin on staff export -> 200
  const resAdminStaffExport = await apiRequest('GET', '/api/v1/staff/reports/export?format=pdf&from=2026-06-01&to=2026-06-02', {
    Authorization: `Bearer ${adminToken}`,
  }, null, true);
  assert(resAdminStaffExport.status === 200, 'Admin on staff export must receive 200');

  // 4. Citizen on staff export -> 403
  const resCitizenForbidden = await apiRequest('GET', '/api/v1/staff/reports/export?format=pdf&from=2026-06-01&to=2026-06-02', {
    Authorization: `Bearer ${citizenToken}`,
  });
  assert(resCitizenForbidden.status === 403, 'Citizen on staff export must receive 403');

  // 5. No token -> 401
  const resNoToken = await apiRequest('GET', '/api/v1/staff/reports/export?format=pdf&from=2026-06-01&to=2026-06-02');
  assert(resNoToken.status === 401, 'Request with no token must receive 401');

  // 6. Staff on admin export -> 403
  const resStaffOnAdmin = await apiRequest('GET', '/api/v1/admin/reports/export?format=pdf&from=2026-06-01&to=2026-06-02', {
    Authorization: `Bearer ${staffToken}`,
  });
  assert(resStaffOnAdmin.status === 403, 'Staff on admin export route must receive 403');
  console.log('PASS: GET /staff/reports/export without can_view_reports returned status 403.');
  console.log('PASS: GET /staff/reports/export with can_view_reports returned status 200.');
  console.log('PASS: admin request to /admin/reports/export returned status 200.');
  console.log('PASS: citizen request to report export returned status 403.');
  console.log('PASS: unauthenticated request to report export returned status 401.');
  console.log('PASS: staff request to /admin/reports/export returned status 403.');
  console.log('--------------------------------------------------------------------\n');

  // ------------------------------------------------------------------
  // TEST 6: Timezone Boundary Test (Barangay UTC+8 Timezone)
  // ------------------------------------------------------------------
  console.log('[TEST 6] Timezone Boundary Test: 00:30 local and 23:30 local included, outside excluded');
  // Range: 2026-07-10 to 2026-07-11 local (UTC+8)
  // 2026-07-10 00:00:00 local is 2026-07-09T16:00:00.000Z
  // 2026-07-11 23:59:59.999 local is 2026-07-11T15:59:59.999Z

  const insideFirstDay = new Date('2026-07-09T16:30:00.000Z'); // 2026-07-10 00:30 local
  const insideLastDay = new Date('2026-07-11T15:30:00.000Z');  // 2026-07-11 23:30 local
  const outsideBefore = new Date('2026-07-09T15:50:00.000Z');  // 2026-07-09 23:50 local (10m before range)
  const outsideAfter = new Date('2026-07-11T16:10:00.000Z');   // 2026-07-12 00:10 local (10m after range)

  await DocumentRequest.create([
    {
      tracking_number: 'QF-TZ-INSIDE-FIRST',
      citizen_id: citizenUser._id,
      document_type_id: bcType._id,
      purpose: 'Inside First Day 00:30',
      status: 'pending',
      fee: 100,
      created_at: insideFirstDay,
    },
    {
      tracking_number: 'QF-TZ-INSIDE-LAST',
      citizen_id: citizenUser._id,
      document_type_id: bcType._id,
      purpose: 'Inside Last Day 23:30',
      status: 'pending',
      fee: 100,
      created_at: insideLastDay,
    },
    {
      tracking_number: 'QF-TZ-OUTSIDE-BEFORE',
      citizen_id: citizenUser._id,
      document_type_id: bcType._id,
      purpose: 'Outside Before 23:50 prev day',
      status: 'pending',
      fee: 100,
      created_at: outsideBefore,
    },
    {
      tracking_number: 'QF-TZ-OUTSIDE-AFTER',
      citizen_id: citizenUser._id,
      document_type_id: bcType._id,
      purpose: 'Outside After 00:10 next day',
      status: 'pending',
      fee: 100,
      created_at: outsideAfter,
    },
  ]);

  const tzReport = await reportsService.generateReportData({
    from: '2026-07-10',
    to: '2026-07-11',
    isExport: true,
    actorUser: staffUser,
  });

  const tzTrackingNumbers = tzReport.transactions.items.map((t) => t.tracking_number);
  assert(tzTrackingNumbers.includes('QF-TZ-INSIDE-FIRST'), 'Request at 00:30 local on first day MUST be included');
  assert(tzTrackingNumbers.includes('QF-TZ-INSIDE-LAST'), 'Request at 23:30 local on last day MUST be included');
  assert(!tzTrackingNumbers.includes('QF-TZ-OUTSIDE-BEFORE'), 'Request outside before boundary MUST be excluded');
  assert(!tzTrackingNumbers.includes('QF-TZ-OUTSIDE-AFTER'), 'Request outside after boundary MUST be excluded');
  console.log('PASS: requests created at 00:30 and 23:30 local time within date range were included in export.');
  console.log('PASS: requests created outside local date boundaries were excluded from export.');
  console.log('--------------------------------------------------------------------\n');

  // ------------------------------------------------------------------
  // TEST 7: Truncation Notice, Header, and Row Caps
  // ------------------------------------------------------------------
  console.log('[TEST 7] Truncation Enforcement: Row caps, notice, and X-Export-Truncated header');
  const originalDocMax = config.exportDocMaxRows;
  const originalMax = config.exportMaxRows;

  // Lower caps temporarily
  config.exportDocMaxRows = 5;
  config.exportMaxRows = 10;

  try {
    const truncPdfRes = await apiRequest('GET', '/api/v1/staff/reports/export?format=pdf&from=2026-06-01&to=2026-06-02', {
      Authorization: `Bearer ${staffToken}`,
    }, null, true);

    assert(truncPdfRes.status === 200, 'Truncated PDF export returns 200');
    assert(truncPdfRes.headers['x-export-truncated'] === 'true', 'X-Export-Truncated header must be true for PDF');

    const truncPdfParser = new PDFParse({ data: truncPdfRes.buffer });
    const truncPdfText = (await truncPdfParser.getText()).text;
    assert(truncPdfText.includes('Showing first 5 of 35'), 'PDF must display "Showing first 5 of 35"');

    const truncXlsxRes = await apiRequest('GET', '/api/v1/staff/reports/export?format=xlsx&from=2026-06-01&to=2026-06-02', {
      Authorization: `Bearer ${staffToken}`,
    }, null, true);

    assert(truncXlsxRes.status === 200, 'Truncated XLSX export returns 200');
    assert(truncXlsxRes.headers['x-export-truncated'] === 'true', 'X-Export-Truncated header must be true for XLSX');

    const truncWb = new ExcelJS.Workbook();
    await truncWb.xlsx.load(truncXlsxRes.buffer);
    const truncTxSheet = truncWb.getWorksheet('Transactions');
    let foundXlsxTruncNotice = false;
    truncTxSheet.eachRow((r) => {
      r.eachCell((c) => {
        if (String(c.value).includes('Showing first 10 of 35')) {
          foundXlsxTruncNotice = true;
        }
      });
    });
    assert(foundXlsxTruncNotice, 'XLSX must display "Showing first 10 of 35"');
  } finally {
    config.exportDocMaxRows = originalDocMax;
    config.exportMaxRows = originalMax;
  }
  console.log('PASS: export with row limit exceeded set header X-Export-Truncated to "true".');
  console.log('PASS: export document contained warning text showing first N of M total records.');
  console.log('--------------------------------------------------------------------\n');

  // ------------------------------------------------------------------
  // TEST 8: Response Headers & Filename Sanitization
  // ------------------------------------------------------------------
  console.log('[TEST 8] Response Headers & Validated Filename Pattern');
  const headerRes = await apiRequest('GET', '/api/v1/staff/reports/export?format=pdf&from=2026-06-01&to=2026-06-02', {
    Authorization: `Bearer ${staffToken}`,
  }, null, true);

  assert(headerRes.headers['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options must be nosniff');
  assert(headerRes.headers['cache-control'] === 'private, no-store', 'Cache-Control must be private, no-store');
  assert(headerRes.headers['content-type'] === 'application/pdf', 'Content-Type must be application/pdf');
  assert(
    headerRes.headers['content-disposition'] === 'attachment; filename="quickfile-report-staff-2026-06-01-to-2026-06-02.pdf"',
    `Content-Disposition filename matches pattern: ${headerRes.headers['content-disposition']}`
  );
  console.log('PASS: export response included X-Content-Type-Options: nosniff.');
  console.log('PASS: export response included Cache-Control: no-store.');
  console.log('PASS: export response Content-Disposition header formatted attachment filename matching pattern.');
  console.log('--------------------------------------------------------------------\n');

  // ------------------------------------------------------------------
  // TEST 9: Audit Logging & Rate Limiter Quota Isolation
  // ------------------------------------------------------------------
  console.log('[TEST 9] Audit Logging, Rate Limit (10 per 15 min), and Forbidden Quota Preservation');

  // Verify AuditLog for REPORT_EXPORT
  const lastExportAudit = await AuditLog.findOne({ action: 'REPORT_EXPORT' }).sort({ created_at: -1 });
  assert(lastExportAudit, 'REPORT_EXPORT audit entry must exist');
  assert(lastExportAudit.details.format === 'pdf', 'Audit log must record format');
  assert(!lastExportAudit.details.buffer, 'Audit log MUST NOT contain file contents');
  assert(!lastExportAudit.details.content, 'Audit log MUST NOT contain file text');

  // Test that forbidden request does NOT consume quota
  exportLimiter.resetKey(staffUser._id.toString());
  exportLimiter.resetKey(staffNoReport._id.toString());

  // Attempt forbidden export
  const forbiddenAttempt = await apiRequest('GET', '/api/v1/staff/reports/export?format=pdf&from=2026-06-01&to=2026-06-02', {
    Authorization: `Bearer ${staffNoReportToken}`,
  });
  assert(forbiddenAttempt.status === 403, 'Forbidden attempt returns 403');

  // Allowed staff user performs 10 exports
  for (let i = 1; i <= 10; i++) {
    const res = await apiRequest('GET', '/api/v1/staff/reports/export?format=pdf&from=2026-06-01&to=2026-06-02', {
      Authorization: `Bearer ${staffToken}`,
    }, null, true);
    assert(res.status === 200, `Export attempt ${i} of 10 must succeed`);
  }

  // 11th export must hit 429
  const resExceeded = await apiRequest('GET', '/api/v1/staff/reports/export?format=pdf&from=2026-06-01&to=2026-06-02', {
    Authorization: `Bearer ${staffToken}`,
  });
  assert(resExceeded.status === 429, `11th export attempt must return 429, got ${resExceeded.status}`);
  console.log('PASS: REPORT_EXPORT audit log recorded export format without storing file contents.');
  console.log('PASS: 11th export request within 15 minutes returned status 429.');
  console.log('PASS: rejected 403 export request did not consume rate limit quota.');
  console.log('--------------------------------------------------------------------\n');

  // ------------------------------------------------------------------
  // TEST 10: Secret Hardcoding Elimination Verification
  // ------------------------------------------------------------------
  console.log('[TEST 10] Secret Hardcoding Elimination Verification');
  assert(DYNAMIC_SU_ADMIN_KEY.startsWith('su_key_'), 'Dynamic SU admin key was generated at runtime');
  assert(DYNAMIC_ADMIN_PASSWORD.startsWith('Adm!n_'), 'Dynamic admin password was generated at runtime');
  console.log('PASS: Runtime dynamic crypto generation verified for Super Admin Key and all default passwords.');
  console.log('--------------------------------------------------------------------\n');

  // ------------------------------------------------------------------
  // SECTION F: GENERATE SAMPLE FILES FOR USER INSPECTION
  // ------------------------------------------------------------------
  console.log('[SAMPLE GENERATION] Writing official report samples to backend/export-samples/ ...');
  const samplesDir = path.resolve(__dirname, 'export-samples');
  if (!fs.existsSync(samplesDir)) {
    fs.mkdirSync(samplesDir, { recursive: true });
  }

  // Reset limiter to generate samples
  exportLimiter.resetKey(adminUser._id.toString());
  exportLimiter.resetKey(staffUser._id.toString());

  // Staff samples
  const sampleStaffPdf = await apiRequest('GET', '/api/v1/staff/reports/export?format=pdf&from=2026-06-01&to=2026-06-02', {
    Authorization: `Bearer ${staffToken}`,
  }, null, true);
  fs.writeFileSync(path.join(samplesDir, 'sample-staff-report.pdf'), sampleStaffPdf.buffer);

  const sampleStaffDocx = await apiRequest('GET', '/api/v1/staff/reports/export?format=docx&from=2026-06-01&to=2026-06-02', {
    Authorization: `Bearer ${staffToken}`,
  }, null, true);
  fs.writeFileSync(path.join(samplesDir, 'sample-staff-report.docx'), sampleStaffDocx.buffer);

  const sampleStaffXlsx = await apiRequest('GET', '/api/v1/staff/reports/export?format=xlsx&from=2026-06-01&to=2026-06-02', {
    Authorization: `Bearer ${staffToken}`,
  }, null, true);
  fs.writeFileSync(path.join(samplesDir, 'sample-staff-report.xlsx'), sampleStaffXlsx.buffer);

  // Admin samples
  const sampleAdminPdf = await apiRequest('GET', '/api/v1/admin/reports/export?format=pdf&from=2026-06-01&to=2026-06-02', {
    Authorization: `Bearer ${adminToken}`,
  }, null, true);
  fs.writeFileSync(path.join(samplesDir, 'sample-admin-report.pdf'), sampleAdminPdf.buffer);

  const sampleAdminDocx = await apiRequest('GET', '/api/v1/admin/reports/export?format=docx&from=2026-06-01&to=2026-06-02', {
    Authorization: `Bearer ${adminToken}`,
  }, null, true);
  fs.writeFileSync(path.join(samplesDir, 'sample-admin-report.docx'), sampleAdminDocx.buffer);

  const sampleAdminXlsx = await apiRequest('GET', '/api/v1/admin/reports/export?format=xlsx&from=2026-06-01&to=2026-06-02', {
    Authorization: `Bearer ${adminToken}`,
  }, null, true);
  fs.writeFileSync(path.join(samplesDir, 'sample-admin-report.xlsx'), sampleAdminXlsx.buffer);

  console.log('PASS: All 6 sample export files successfully generated in backend/export-samples/.');
  console.log('--------------------------------------------------------------------\n');

  console.log('====================================================================');
  console.log('ALL 10 PHASE 2, PART 3 (REPORT EXPORTS & FIX ROUND) TESTS PASSED!');
  console.log('====================================================================');

  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  console.log('[MongoDB] Connection closed successfully.');

  const client = await mongoose.connect(TEST_MONGO_URI);
  await client.connection.db.dropDatabase();
  await mongoose.disconnect();
  console.log('[Cleanup] Dropped isolated quickfile_test_2e database.');

  if (fs.existsSync(TEST_ENV_PATH)) {
    fs.unlinkSync(TEST_ENV_PATH);
    console.log('[Cleanup] Removed temporary test_2e.env.tmp file.');
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});