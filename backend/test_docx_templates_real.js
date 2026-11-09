/**
 * Comprehensive DOCX Template Real Integration Test Suite
 * Tests all template validation, upload, preview, activation, retire, issue snapshot,
 * docx certificate generation, security constraints, and permission matrix against isolated DB.
 * Never prints secrets.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const PizZip = require('pizzip');

// Temporary isolated environment settings
const TEST_ENV_PATH = path.resolve(__dirname, 'test_docx.env.tmp');
const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/quickfile_docx_test';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = TEST_MONGO_URI;
process.env.ENV_FILE = TEST_ENV_PATH;
process.env.SU_ADMIN_KEY = 'su_key_test_docx_secret_key_12345';
process.env.JWT_SECRET = 'quickfile_docx_test_jwt_secret_at_least_32_chars_long';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.PUBLIC_APP_URL = 'http://localhost:5173';
process.env.BARANGAY_NAME = 'Barangay 11';
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
    'JWT_SECRET=quickfile_docx_test_jwt_secret_at_least_32_chars_long',
    'FRONTEND_URL=http://localhost:5173',
    'PUBLIC_APP_URL=http://localhost:5173',
    'SU_ADMIN_KEY=su_key_test_docx_secret_key_12345',
    'BARANGAY_NAME=Barangay 11',
    'CITY_MUNICIPALITY=Malaybalay',
    'PROVINCE=Bukidnon',
    'APP_TIMEZONE_OFFSET_MINUTES=480',
    'CERTIFICATE_VALIDITY_DAYS=180',
  ].join('\n'),
  'utf8'
);

const app = require('./app');
const { connectDB, disconnectDB } = require('./src/config/db');
const { config } = require('./src/config');
const {
  User,
  CitizenProfile,
  DocumentType,
  DocumentTemplate,
  DocumentRequest,
  IssuedDocument,
  AppSetting,
  StaffPermission,
  AuditLog,
} = require('./src/models');
const { API_PREFIX, ROLES, REQUEST_STATUSES, VALIDITY_STATUSES } = require('./src/config/constants');
const { validateDocxTemplate, PNG_SIGNATURE } = require('./src/modules/admin/documentTypes/templateValidator.service');
const { renderDocxWithTimeout } = require('./src/modules/admin/documentTypes/documentTemplates.service');
const { TEMPLATES_DIR } = require('./src/utils/templateStorage');

// Helper to create a 1x1 valid PNG image buffer
const SAMPLE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

/**
 * Creates in-memory DOCX archives using PizZip (no committed binaries)
 */
function createDocxArchive({
  documentXml = '',
  headerXml = null,
  footerXml = null,
  extraFiles = {},
  relsTarget = null,
  relsExternal = false,
  relsType = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
  includeQr = true,
  mediaFile = null,
}) {
  const zip = new PizZip();

  let contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`;

  if (headerXml) {
    contentTypesXml += `\n  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>`;
    zip.file(
      'word/header1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>${headerXml}</w:t></w:r></w:p></w:hdr>`
    );
  }

  if (footerXml) {
    contentTypesXml += `\n  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>`;
    zip.file(
      'word/footer1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>${footerXml}</w:t></w:r></w:p></w:ftr>`
    );
  }

  contentTypesXml += `\n</Types>`;
  zip.file('[Content_Types].xml', contentTypesXml);

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  let docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`;

  if (includeQr) {
    docRelsXml += `\n  <Relationship Id="rIdQr1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/qr_placeholder.png"/>`;
    zip.file('word/media/qr_placeholder.png', mediaFile || SAMPLE_PNG);
  }

  if (relsTarget) {
    const extAttr = relsExternal ? ' TargetMode="External"' : '';
    docRelsXml += `\n  <Relationship Id="rIdExt1" Type="${relsType}" Target="${relsTarget}"${extAttr}/>`;
  }

  docRelsXml += `\n</Relationships>`;
  zip.file('word/_rels/document.xml.rels', docRelsXml);

  let qrDrawingXml = '';
  if (includeQr) {
    qrDrawingXml = `<w:drawing>
      <wp:inline>
        <wp:docPr id="1" name="Picture 1" descr="qr_code" title="qr_code"/>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:blipFill>
                <a:blip r:embed="rIdQr1"/>
              </pic:blipFill>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>`;
  }

  const finalDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    ${documentXml}
    <w:p><w:r>${qrDrawingXml}</w:r></w:p>
  </w:body>
</w:document>`;

  zip.file('word/document.xml', finalDocXml);

  for (const [filePath, content] of Object.entries(extraFiles)) {
    zip.file(filePath, content);
  }

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Creates standard valid template buffer
 */
function createValidTemplateDocx() {
  const bodyXml = `
    <w:p><w:r><w:t>Certificate Number: {certificate_number}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Verification Code: {verification_code}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Recipient: {full_name}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Address: {address}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Date Issued: {issued_date}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Purpose: {purpose}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Captain: {captain_name}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Secretary: {secretary_name}</w:t></w:r></w:p>
  `;
  return createDocxArchive({ documentXml: bodyXml, includeQr: true });
}

function makeHttpRequest(server, { path, method = 'GET', headers = {} }, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
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
    if (postData) req.write(postData);
    req.end();
  });
}

function makeMultipartUpload(server, urlPath, token, fileBuffer, filename, fieldName = 'template') {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const boundary = `----WebKitFormBoundary${crypto.randomBytes(16).toString('hex')}`;
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, fileBuffer, footer]);

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
          Authorization: `Bearer ${token}`,
        },
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
    req.write(body);
    req.end();
  });
}

async function runTestSuite() {
  console.log('--- QuickFile DOCX Certificate Templates Test Suite ---');

  await connectDB();
  const db = (await import('mongoose')).default.connection.db;

  // Clean collections in isolated test DB
  const collections = await db.collections();
  for (const c of collections) {
    await c.deleteMany({});
  }

  // Configure required barangay settings including signatories
  await AppSetting.create([
    { key: 'barangay_name', value: 'Barangay 11' },
    { key: 'city_municipality', value: 'Malaybalay' },
    { key: 'province', value: 'Bukidnon' },
    { key: 'office_name', value: 'Office of the Punong Barangay' },
    { key: 'barangay_captain', value: 'Hon. Roberto S. Gomez' },
    { key: 'barangay_secretary', value: 'Elena V. Santos' },
  ]);

  // Create test users
  const adminUser = await User.create({
    full_name: 'System Admin',
    email: 'admin_test@quickfile.gov.ph',
    password_hash: 'test_hash',
    role: ROLES.ADMIN,
    is_active: true,
  });

  const staffWithoutPerm = await User.create({
    full_name: 'Staff Without Print',
    email: 'staff_noprint@quickfile.gov.ph',
    password_hash: 'test_hash',
    role: ROLES.STAFF,
    is_active: true,
  });
  await StaffPermission.create({
    user_id: staffWithoutPerm._id,
    can_print_documents: false,
    can_review_requests: true,
    can_prepare_documents: true,
  });

  const staffWithPerm = await User.create({
    full_name: 'Staff With Print',
    email: 'staff_print@quickfile.gov.ph',
    password_hash: 'test_hash',
    role: ROLES.STAFF,
    is_active: true,
  });
  await StaffPermission.create({
    user_id: staffWithPerm._id,
    can_print_documents: true,
    can_review_requests: true,
    can_prepare_documents: true,
  });

  const citizenUser = await User.create({
    full_name: 'Juan Dela Cruz',
    email: 'citizen_test@quickfile.gov.ph',
    password_hash: 'test_hash',
    role: ROLES.CITIZEN,
    is_active: true,
  });
  const citizenProfile = await CitizenProfile.create({
    user_id: citizenUser._id,
    first_name: 'Juan',
    middle_name: 'Santos',
    last_name: 'Dela Cruz',
    suffix: '',
    street_address: '123 Rizal Street',
    purok_zone: 'Zone 4',
    barangay: 'Barangay 11',
    city: 'Malaybalay',
    province: 'Bukidnon',
    civil_status: 'single',
    gender: 'male',
    birthdate: new Date('1995-06-15T00:00:00.000Z'),
    occupation: 'Clerk',
  });

  // Create tokens
  const adminToken = jwt.sign({ id: adminUser._id, role: adminUser.role }, config.jwt.getSecret(), { expiresIn: '1d' });
  const staffNoPermToken = jwt.sign({ id: staffWithoutPerm._id, role: staffWithoutPerm.role }, config.jwt.getSecret(), { expiresIn: '1d' });
  const staffPrintToken = jwt.sign({ id: staffWithPerm._id, role: staffWithPerm.role }, config.jwt.getSecret(), { expiresIn: '1d' });
  const citizenToken = jwt.sign({ id: citizenUser._id, role: citizenUser.role }, config.jwt.getSecret(), { expiresIn: '1d' });

  // Create DocumentType
  const docType = await DocumentType.create({
    name: 'Barangay Clearance',
    code: 'BC',
    fee: 50,
    processing_days: 1,
    is_active: true,
    template_mode: 'builtin',
  });

  // Start HTTP server on dynamic port
  const server = http.createServer(app);
  await new Promise((res) => server.listen(0, res));

  try {
    // -------------------------------------------------------------------------
    // Check 1: valid template accepted
    // -------------------------------------------------------------------------
    const validDocxBuffer = createValidTemplateDocx();
    const uploadRes = await makeMultipartUpload(
      server,
      `${API_PREFIX}/admin/document-types/${docType._id}/templates`,
      adminToken,
      validDocxBuffer,
      'test_valid_template.docx'
    );
    if (uploadRes.status === 201 && uploadRes.data.success && uploadRes.data.data.template.version === 1) {
      console.log('PASS: valid template accepted');
    } else {
      throw new Error(`valid template accepted failed: ${JSON.stringify(uploadRes.data)}`);
    }

    // -------------------------------------------------------------------------
    // Check 2: placeholder split across runs still found
    // -------------------------------------------------------------------------
    const splitRunXml = `
      <w:p>
        <w:r><w:t>Name: {</w:t></w:r>
        <w:r><w:t>full_</w:t></w:r>
        <w:r><w:t>name}</w:t></w:r>
      </w:p>
      <w:p><w:r><w:t>{certificate_number} {verification_code}</w:t></w:r></w:p>
    `;
    const splitRunDocx = createDocxArchive({ documentXml: splitRunXml });
    const splitVal = validateDocxTemplate(splitRunDocx);
    if (splitVal.valid && splitVal.placeholders_found.includes('full_name')) {
      console.log('PASS: placeholder split across runs still found');
    } else {
      throw new Error(`placeholder split across runs failed: ${JSON.stringify(splitVal)}`);
    }

    // -------------------------------------------------------------------------
    // Check 3: placeholder in header/footer found
    // -------------------------------------------------------------------------
    const headerFooterDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{certificate_number} {verification_code}</w:t></w:r></w:p>',
      headerXml: 'Header document: {document_name}',
      footerXml: 'Official {barangay_name}',
    });
    const hfVal = validateDocxTemplate(headerFooterDocx);
    if (
      hfVal.valid &&
      hfVal.placeholders_found.includes('document_name') &&
      hfVal.placeholders_found.includes('barangay_name')
    ) {
      console.log('PASS: placeholder in header/footer found');
    } else {
      throw new Error(`placeholder in header/footer failed: ${JSON.stringify(hfVal)}`);
    }

    // -------------------------------------------------------------------------
    // Check 4: unknown tag rejected with suggestion
    // -------------------------------------------------------------------------
    const unknownTagDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{certificate_number} {verification_code} {purpos}</w:t></w:r></w:p>',
    });
    const unkVal = validateDocxTemplate(unknownTagDocx);
    if (
      !unkVal.valid &&
      unkVal.unknown.includes('purpos') &&
      unkVal.errors.some((e) => e.includes('Did you mean "{purpose}"?'))
    ) {
      console.log('PASS: unknown tag rejected with suggestion');
    } else {
      throw new Error(`unknown tag suggestion failed: ${JSON.stringify(unkVal)}`);
    }

    // -------------------------------------------------------------------------
    // Check 5: loop/condition/expression/filter rejected
    // -------------------------------------------------------------------------
    const loopDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{#citizens} {certificate_number} {verification_code} {/citizens}</w:t></w:r></w:p>',
    });
    const loopVal = validateDocxTemplate(loopDocx);
    if (!loopVal.valid && loopVal.errors.some((e) => e.includes('Only plain {name} tags are supported'))) {
      console.log('PASS: loop/condition/expression/filter rejected');
    } else {
      throw new Error(`loop rejection failed: ${JSON.stringify(loopVal)}`);
    }

    // -------------------------------------------------------------------------
    // Check 6: unclosed brace reported
    // -------------------------------------------------------------------------
    const unclosedDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{certificate_number {verification_code}</w:t></w:r></w:p>',
    });
    const unclosedVal = validateDocxTemplate(unclosedDocx);
    if (!unclosedVal.valid && unclosedVal.errors.some((e) => e.toLowerCase().includes('syntax') || e.toLowerCase().includes('unclosed'))) {
      console.log('PASS: unclosed brace reported');
    } else {
      throw new Error(`unclosed brace check failed: ${JSON.stringify(unclosedVal)}`);
    }

    // -------------------------------------------------------------------------
    // Check 7: missing certificate_number or verification rejected
    // -------------------------------------------------------------------------
    const missingReqDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>Only {full_name} is here</w:t></w:r></w:p>',
      includeQr: false,
    });
    const missingReqVal = validateDocxTemplate(missingReqDocx);
    if (
      !missingReqVal.valid &&
      missingReqVal.errors.some((e) => e.includes('{certificate_number}')) &&
      missingReqVal.errors.some((e) => e.includes('verification element'))
    ) {
      console.log('PASS: missing certificate_number or verification rejected');
    } else {
      throw new Error(`missing required check failed: ${JSON.stringify(missingReqVal)}`);
    }

    // -------------------------------------------------------------------------
    // Check 8: macro-enabled file rejected
    // -------------------------------------------------------------------------
    const macroDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{certificate_number} {verification_code}</w:t></w:r></w:p>',
      extraFiles: { 'word/vbaProject.bin': Buffer.from('fake vba') },
    });
    const macroVal = validateDocxTemplate(macroDocx);
    if (!macroVal.valid && macroVal.errors.some((e) => e.includes('vbaProject.bin'))) {
      console.log('PASS: macro-enabled rejected');
    } else {
      throw new Error(`macro rejection failed: ${JSON.stringify(macroVal)}`);
    }

    // -------------------------------------------------------------------------
    // Check 9: external link rejected
    // -------------------------------------------------------------------------
    const externalLinkDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{certificate_number} {verification_code}</w:t></w:r></w:p>',
      relsTarget: 'http://malicious-site.example.com/template.dotm',
      relsExternal: true,
      relsType: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate',
    });
    const extVal = validateDocxTemplate(externalLinkDocx);
    if (!extVal.valid && extVal.errors.some((e) => e.includes('external relationship'))) {
      console.log('PASS: external link rejected');
    } else {
      throw new Error(`external link rejection failed: ${JSON.stringify(extVal)}`);
    }

    // -------------------------------------------------------------------------
    // Check 10: DDE field rejected
    // -------------------------------------------------------------------------
    const ddeXml = `
      <w:p>
        <w:fldSimple w:instr="DDEAUTO evil.exe"/>
        <w:r><w:t>{certificate_number} {verification_code}</w:t></w:r>
      </w:p>
    `;
    const ddeDocx = createDocxArchive({ documentXml: ddeXml });
    const ddeVal = validateDocxTemplate(ddeDocx);
    if (!ddeVal.valid && ddeVal.errors.some((e) => e.includes('Prohibited dynamic field instruction detected'))) {
      console.log('PASS: DDE field rejected');
    } else {
      throw new Error(`DDE rejection failed: ${JSON.stringify(ddeVal)}`);
    }

    // -------------------------------------------------------------------------
    // Check 11: embedded object rejected
    // -------------------------------------------------------------------------
    const embeddedDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{certificate_number} {verification_code}</w:t></w:r></w:p>',
      extraFiles: { 'word/embeddings/oleObject1.bin': Buffer.from('embedded payload') },
    });
    const embedVal = validateDocxTemplate(embeddedDocx);
    if (!embedVal.valid && embedVal.errors.some((e) => e.includes('Embedded OLE object') || e.includes('word/embeddings/'))) {
      console.log('PASS: embedded object rejected');
    } else {
      throw new Error(`embedded object rejection failed: ${JSON.stringify(embedVal)}`);
    }

    // -------------------------------------------------------------------------
    // Check 12: renamed non-zip rejected
    // -------------------------------------------------------------------------
    const nonZipBuffer = Buffer.from('This is a text file renamed to .docx');
    const nonZipVal = validateDocxTemplate(nonZipBuffer);
    if (!nonZipVal.valid && nonZipVal.errors.some((e) => e.includes('magic bytes'))) {
      console.log('PASS: renamed non-zip rejected');
    } else {
      throw new Error(`renamed non-zip failed: ${JSON.stringify(nonZipVal)}`);
    }

    // -------------------------------------------------------------------------
    // Check 13: oversized file rejected
    // -------------------------------------------------------------------------
    const oversizedBuffer = Buffer.alloc(2 * 1024 * 1024 + 1024, 0x41);
    const oversizedVal = validateDocxTemplate(oversizedBuffer);
    if (!oversizedVal.valid && oversizedVal.errors.some((e) => e.includes('exceeds maximum allowed limit of 2 MB'))) {
      console.log('PASS: oversized file rejected');
    } else {
      throw new Error(`oversized check failed: ${JSON.stringify(oversizedVal)}`);
    }

    // -------------------------------------------------------------------------
    // Check 14: zip-bomb-style files rejected
    // -------------------------------------------------------------------------
    const zipBombZip = new PizZip();
    zipBombZip.file('[Content_Types].xml', '<Types/>');
    zipBombZip.file('word/document.xml', '<w:document/>');
    // Add 305 small entries to exceed entry cap
    for (let i = 0; i < 305; i++) {
      zipBombZip.file(`word/extra_${i}.xml`, '<item/>');
    }
    const zipBombBuffer = zipBombZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    const zipBombVal = validateDocxTemplate(zipBombBuffer);
    if (!zipBombVal.valid && zipBombVal.errors.some((e) => e.includes('exceeding maximum limit of 300'))) {
      console.log('PASS: zip-bomb-style files rejected');
    } else {
      throw new Error(`zip bomb check failed: ${JSON.stringify(zipBombVal)}`);
    }

    // -------------------------------------------------------------------------
    // Check 15: output text really contains name, address, certificate number, and issue date
    // -------------------------------------------------------------------------
    const renderData15 = {
      full_name: 'Juan Dela Cruz',
      address: '123 Rizal Street, Zone 4',
      certificate_number: 'BRGY-BC-2026-0001',
      issued_date: 'March 15, 2026',
      verification_code: 'VERIFY-123456',
      purpose: 'Employment requirement',
    };
    const rendered15 = await renderDocxWithTimeout(validDocxBuffer, renderData15);
    const unzipped15 = new PizZip(rendered15);
    const docXml15 = unzipped15.file('word/document.xml').asText();
    if (
      docXml15.includes('Juan Dela Cruz') &&
      docXml15.includes('123 Rizal Street, Zone 4') &&
      docXml15.includes('BRGY-BC-2026-0001') &&
      docXml15.includes('March 15, 2026')
    ) {
      console.log('PASS: output text really contains name, address, certificate number, and issue date (unzip and read word/document.xml)');
    } else {
      throw new Error('output text verification in XML failed');
    }

    // -------------------------------------------------------------------------
    // Check 16: characters & < > " ' and Filipino letters render correctly
    // -------------------------------------------------------------------------
    const renderData16 = {
      full_name: 'Ma. Cristina & Niño "Pepe" <D\'Cruz> Ñoño',
      address: 'Purok 5 & Sitio Ibaba',
      certificate_number: 'BRGY-BC-2026-0002',
      verification_code: 'CODE-999',
    };
    const rendered16 = await renderDocxWithTimeout(validDocxBuffer, renderData16);
    const unzipped16 = new PizZip(rendered16);
    const docXml16 = unzipped16.file('word/document.xml').asText();
    if (
      docXml16.includes('Ma. Cristina &amp; Niño &quot;Pepe&quot; &lt;D&apos;Cruz&gt; Ñoño') ||
      (docXml16.includes('Ñoño') && docXml16.includes('&amp;') && docXml16.includes('&lt;'))
    ) {
      console.log('PASS: characters & < > " \' and Filipino letters render correctly');
    } else {
      throw new Error(`character escaping check failed: ${docXml16.slice(0, 500)}`);
    }

    // -------------------------------------------------------------------------
    // Check 17: a 500-character purpose and control characters
    // -------------------------------------------------------------------------
    const raw500Purpose = 'A'.repeat(250) + '\x00\x08\x1F' + 'B'.repeat(300); // 550 chars with control chars
    const { sanitizeXmlString } = require('./src/utils/templatePlaceholders');
    const cleanedPurpose = sanitizeXmlString(raw500Purpose);
    const rendered17 = await renderDocxWithTimeout(validDocxBuffer, {
      certificate_number: 'BRGY-BC-2026-0003',
      verification_code: 'CODE-500',
      purpose: cleanedPurpose,
    });
    const unzipped17 = new PizZip(rendered17);
    const docXml17 = unzipped17.file('word/document.xml').asText();
    if (
      cleanedPurpose.length === 500 &&
      !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(cleanedPurpose) &&
      docXml17.includes('A'.repeat(250))
    ) {
      console.log('PASS: a 500-character purpose and control characters');
    } else {
      throw new Error('500 char purpose check failed');
    }

    // -------------------------------------------------------------------------
    // Activate Template Version 1 on DocumentType
    // -------------------------------------------------------------------------
    const activateRes = await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/admin/document-types/${docType._id}/templates/1/activate`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    if (activateRes.status !== 200 || !activateRes.data.success) {
      throw new Error(`Failed to activate template: ${JSON.stringify(activateRes.data)}`);
    }

    // Create and Issue Document Request for Juan Dela Cruz
    const req1 = await DocumentRequest.create({
      tracking_number: 'QF-2026-TEST01',
      citizen_id: citizenUser._id,
      document_type_id: docType._id,
      status: REQUEST_STATUSES.IN_PREPARATION,
      purpose: 'Passport application',
      copies: 1,
      fee: 50,
    });

    const staffService = require('./src/modules/staff/staff.service');
    const issueResult = await staffService.issueRequest(req1._id, staffWithPerm, '127.0.0.1', 'TestRunner');

    // -------------------------------------------------------------------------
    // Check 18: reprint after citizen edits profile is IDENTICAL to the first (snapshot)
    // -------------------------------------------------------------------------
    // First generation
    const genRes1 = await staffService.generateCertificateDocx(req1._id, staffWithPerm, '127.0.0.1', 'TestRunner');
    const unzippedGen1 = new PizZip(genRes1.buffer);
    const textGen1 = unzippedGen1.file('word/document.xml').asText();

    // Citizen updates profile
    citizenProfile.first_name = 'Johnny';
    citizenProfile.last_name = 'Santos-Cruz';
    citizenProfile.street_address = '999 Completely New Boulevard';
    await citizenProfile.save();
    citizenUser.full_name = 'Johnny Santos-Cruz';
    await citizenUser.save();

    // Second generation (reprint)
    const genRes2 = await staffService.generateCertificateDocx(req1._id, staffWithPerm, '127.0.0.1', 'TestRunner');
    const unzippedGen2 = new PizZip(genRes2.buffer);
    const textGen2 = unzippedGen2.file('word/document.xml').asText();

    // Assert reprint text is identical and retained original snapshot data
    if (textGen1 === textGen2 && textGen2.includes('Juan Dela Cruz') && textGen2.includes('123 Rizal Street')) {
      console.log('PASS: reprint after the citizen edits their profile is IDENTICAL to the first (snapshot)');
    } else {
      throw new Error('snapshot immutability check failed');
    }

    // -------------------------------------------------------------------------
    // Check 19: replacing the template does not change an already issued document
    // -------------------------------------------------------------------------
    // Upload Version 2 of template with new unique text
    const templateV2Docx = createDocxArchive({
      documentXml: `
        <w:p><w:r><w:t>NEW TEMPLATE V2 HEADER</w:t></w:r></w:p>
        <w:p><w:r><w:t>{certificate_number} {verification_code} {full_name}</w:t></w:r></w:p>
      `,
    });
    const uploadV2Res = await makeMultipartUpload(
      server,
      `${API_PREFIX}/admin/document-types/${docType._id}/templates`,
      adminToken,
      templateV2Docx,
      'template_v2.docx'
    );
    if (uploadV2Res.status !== 201) {
      throw new Error(`Upload v2 failed: ${JSON.stringify(uploadV2Res.data)}`);
    }

    // Activate Version 2
    await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/admin/document-types/${docType._id}/templates/2/activate`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    // Re-download req1 certificate: must still use Version 1, not V2
    const genReq1AfterV2 = await staffService.generateCertificateDocx(req1._id, staffWithPerm, '127.0.0.1', 'TestRunner');
    const unzippedGenReq1AfterV2 = new PizZip(genReq1AfterV2.buffer);
    const docXmlAfterV2 = unzippedGenReq1AfterV2.file('word/document.xml').asText();

    if (!docXmlAfterV2.includes('NEW TEMPLATE V2 HEADER') && docXmlAfterV2.includes('Juan Dela Cruz')) {
      console.log('PASS: replacing the template does not change an already issued document');
    } else {
      throw new Error('replacing template erroneously changed prior issued document');
    }

    // -------------------------------------------------------------------------
    // Check 20: a template version used by an issued document cannot be deleted
    // -------------------------------------------------------------------------
    const deleteV1Res = await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/admin/document-types/${docType._id}/templates/1`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    if (deleteV1Res.status === 409 && deleteV1Res.data.message.includes('used to issue certificates')) {
      console.log('PASS: a template version used by an issued document cannot be deleted');
    } else {
      throw new Error(`template version deletion protection failed: ${JSON.stringify(deleteV1Res)}`);
    }

    // -------------------------------------------------------------------------
    // Check 21: revoked certificate returns 409
    // -------------------------------------------------------------------------
    const issuedRecord = await IssuedDocument.findOne({ request_id: req1._id });
    issuedRecord.validity_status = VALIDITY_STATUSES.REVOKED;
    await issuedRecord.save();

    const revokedDownloadRes = await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/${req1._id}/certificate?format=docx`,
        method: 'GET',
        headers: { Authorization: `Bearer ${staffPrintToken}` },
      }
    );
    if (revokedDownloadRes.status === 409 && revokedDownloadRes.data.message.includes('revoked')) {
      console.log('PASS: revoked certificate returns 409');
    } else {
      throw new Error(`revoked certificate check failed: status=${revokedDownloadRes.status}`);
    }

    // Restore valid status for subsequent checks
    issuedRecord.validity_status = VALIDITY_STATUSES.VALID;
    await issuedRecord.save();

    // -------------------------------------------------------------------------
    // Check 22: builtin documents return 409 from the generate endpoint
    // -------------------------------------------------------------------------
    // Switch document type to builtin mode
    await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/admin/document-types/${docType._id}/template-mode`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { mode: 'builtin' }
    );

    // Issue new request in builtin mode
    const reqBuiltin = await DocumentRequest.create({
      tracking_number: 'QF-2026-BUILTIN01',
      citizen_id: citizenUser._id,
      document_type_id: docType._id,
      status: REQUEST_STATUSES.IN_PREPARATION,
      purpose: 'Postal ID',
      copies: 1,
      fee: 50,
    });
    await staffService.issueRequest(reqBuiltin._id, staffWithPerm, '127.0.0.1', 'TestRunner');

    const builtinDownloadRes = await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/${reqBuiltin._id}/certificate?format=docx`,
        method: 'GET',
        headers: { Authorization: `Bearer ${staffPrintToken}` },
      }
    );
    if (builtinDownloadRes.status === 409 && builtinDownloadRes.data.message.includes('built-in layout')) {
      console.log('PASS: builtin documents return 409 from the generate endpoint');
    } else {
      throw new Error(`builtin documents 409 failed: status=${builtinDownloadRes.status}`);
    }

    // -------------------------------------------------------------------------
    // Check 23: permission table (citizen, staff without can_print_documents, staff with it, admin, no token)
    // -------------------------------------------------------------------------
    const targetUrl = `${API_PREFIX}/staff/requests/${req1._id}/certificate?format=docx`;

    // 1. No token -> 401
    const resNoToken = await makeHttpRequest(server, { path: targetUrl, method: 'GET' });
    // 2. Citizen token -> 403
    const resCitizen = await makeHttpRequest(server, { path: targetUrl, method: 'GET', headers: { Authorization: `Bearer ${citizenToken}` } });
    // 3. Staff without can_print_documents -> 403
    const resStaffNoPerm = await makeHttpRequest(server, { path: targetUrl, method: 'GET', headers: { Authorization: `Bearer ${staffNoPermToken}` } });
    // 4. Staff with can_print_documents -> 200
    const resStaffPrint = await makeHttpRequest(server, { path: targetUrl, method: 'GET', headers: { Authorization: `Bearer ${staffPrintToken}` } });
    // 5. Admin token -> 200
    const resAdmin = await makeHttpRequest(server, { path: targetUrl, method: 'GET', headers: { Authorization: `Bearer ${adminToken}` } });

    if (
      resNoToken.status === 401 &&
      resCitizen.status === 403 &&
      resStaffNoPerm.status === 403 &&
      resStaffPrint.status === 200 &&
      resAdmin.status === 200
    ) {
      console.log('PASS: permission table (citizen, staff without can_print_documents, staff with it, admin, no token)');
    } else {
      throw new Error(
        `Permission table check failed: noToken=${resNoToken.status}, citizen=${resCitizen.status}, staffNoPerm=${resStaffNoPerm.status}, staffPrint=${resStaffPrint.status}, admin=${resAdmin.status}`
      );
    }

    console.log('\n--- ALL 23 DOCX TEMPLATE TESTS PASSED PERFECTLY ---');
  } finally {
    // Teardown HTTP server
    await new Promise((res) => server.close(res));

    // Cleanup uploaded files in uploads/templates created during test
    try {
      const files = fs.readdirSync(TEMPLATES_DIR);
      for (const f of files) {
        if (f.endsWith('.docx')) {
          fs.unlinkSync(path.join(TEMPLATES_DIR, f));
        }
      }
    } catch {
      // ignore
    }

    // Drop test database and close connection
    await db.dropDatabase();
    await disconnectDB();

    // Clean up temporary env file
    if (fs.existsSync(TEST_ENV_PATH)) {
      fs.unlinkSync(TEST_ENV_PATH);
    }
  }
}

runTestSuite()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('TEST SUITE ERROR:', err);
    process.exit(1);
  });
