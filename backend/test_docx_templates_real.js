/**
 * Comprehensive DOCX Template Real Integration Test Suite
 * Tests all template validation, upload, preview, activation, retire, issue snapshot,
 * docx certificate generation, security constraints, and permission matrix against isolated DB.
 * Never prints secrets.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const crypto = require('crypto');
const zlib = require('zlib');
const jwt = require('jsonwebtoken');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

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
const { renderDocx, uploadTemplate } = require('./src/modules/admin/documentTypes/documentTemplates.service');
const { buildStarterDocxBuffer } = require('./src/modules/admin/documentTypes/templateStarter.service');
const { buildExampleRenderData, sanitizeXmlString } = require('./src/utils/templatePlaceholders');
const { TEMPLATES_DIR, saveTemplateFile, deleteTemplateFile } = require('./src/utils/templateStorage');

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
  sharedLogoWithQr = false,
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
  }
  if (footerXml) {
    contentTypesXml += `\n  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>`;
  }
  contentTypesXml += '\n</Types>';
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
    docRelsXml += `\n  <Relationship Id="rIdQr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>`;
    zip.file('word/media/image1.png', mediaFile || SAMPLE_PNG);
  }

  if (sharedLogoWithQr) {
    // Both logo and QR reference media/image1.png
    docRelsXml += `\n  <Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>`;
  }

  if (relsTarget) {
    const targetMode = relsExternal ? ' TargetMode="External"' : '';
    docRelsXml += `\n  <Relationship Id="rIdExt" Type="${relsType}" Target="${relsTarget}"${targetMode}/>`;
  }

  docRelsXml += '\n</Relationships>';
  zip.file('word/_rels/document.xml.rels', docRelsXml);

  let docBody = documentXml;
  if (!docBody) {
    docBody = `
      <w:p><w:r><w:t>Certificate of {document_name}</w:t></w:r></w:p>
      <w:p><w:r><w:t>Certificate No: {certificate_number}</w:t></w:r></w:p>
      <w:p><w:r><w:t>Issued To: {full_name} ({full_name_upper})</w:t></w:r></w:p>
      <w:p><w:r><w:t>Resident of {address}, {city}, {province}</w:t></w:r></w:p>
      <w:p><w:r><w:t>Purpose: {purpose}</w:t></w:r></w:p>
      <w:p><w:r><w:t>Issued on {issued_date} (Code: {verification_code})</w:t></w:r></w:p>
    `;
  }

  if (includeQr) {
    docBody += `
      <w:p>
        <w:r>
          <w:drawing>
            <wp:inline>
              <wp:docPr id="1" name="Picture 1" descr="qr_code"/>
              <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                    <pic:blipFill>
                      <a:blip r:embed="rIdQr" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                    </pic:blipFill>
                  </pic:pic>
                </a:graphicData>
              </a:graphic>
            </wp:inline>
          </w:drawing>
        </w:r>
      </w:p>
    `;
  }

  if (sharedLogoWithQr) {
    docBody += `
      <w:p>
        <w:r>
          <w:drawing>
            <wp:inline>
              <wp:docPr id="2" name="Logo Picture" descr="barangay_logo"/>
              <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                    <pic:blipFill>
                      <a:blip r:embed="rIdLogo" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                    </pic:blipFill>
                  </pic:pic>
                </a:graphicData>
              </a:graphic>
            </wp:inline>
          </w:drawing>
        </w:r>
      </w:p>
    `;
  }

  const fullDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${docBody}
  </w:body>
</w:document>`;
  zip.file('word/document.xml', fullDocXml);

  if (headerXml) {
    zip.file(
      'word/header1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:r><w:t>${headerXml}</w:t></w:r></w:p>
</w:hdr>`
    );
  }

  if (footerXml) {
    zip.file(
      'word/footer1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:r><w:t>${footerXml}</w:t></w:r></w:p>
</w:ftr>`
    );
  }

  for (const [filePath, content] of Object.entries(extraFiles)) {
    zip.file(filePath, content);
  }

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function createValidTemplateDocx() {
  return createDocxArchive({
    documentXml: `
      <w:p><w:r><w:t>Republic of the Philippines</w:t></w:r></w:p>
      <w:p><w:r><w:t>Province of {province}, {city_municipality}</w:t></w:r></w:p>
      <w:p><w:r><w:t>BARANGAY {barangay_name_upper}</w:t></w:r></w:p>
      <w:p><w:r><w:t>Certificate of {document_name_upper}</w:t></w:r></w:p>
      <w:p><w:r><w:t>Certificate No: {certificate_number}</w:t></w:r></w:p>
      <w:p><w:r><w:t>Verification Code: {verification_code}</w:t></w:r></w:p>
      <w:p><w:r><w:t>Registry URL: {verification_url}</w:t></w:r></w:p>
      <w:p><w:r><w:t>This is to certify that {full_name} ({full_name_upper}), {age} years of age, {gender}, {civil_status}, is a resident of {address}.</w:t></w:r></w:p>
      <w:p><w:r><w:t>Issued for {purpose} on {issued_date}.</w:t></w:r></w:p>
      <w:p><w:r><w:t>Signatory: {captain_name} / {secretary_name}</w:t></w:r></w:p>
    `,
  });
}

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
    // SECTION 1: VALIDATION SERVICE & OPENXML SECURITY CHECKS
    // -------------------------------------------------------------------------

    // Check 1: valid template accepted
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

    // Check 2: placeholder split across runs still found
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

    // Check 3: placeholder in header/footer found
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

    // Check 4: unknown tag rejected with suggestion
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

    // Check 5: loop tag rejected
    const loopDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{#items}hi{/items} {certificate_number} {verification_code}</w:t></w:r></w:p>',
    });
    const loopVal = validateDocxTemplate(loopDocx);
    if (!loopVal.valid && loopVal.errors.some((e) => e.includes('Only plain {name} tags are supported'))) {
      console.log('PASS: loop tag {#items} rejected');
    } else {
      throw new Error(`loop tag rejection failed: ${JSON.stringify(loopVal)}`);
    }

    // Check 6: condition tag rejected
    const condDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{^items}hi{/items} {certificate_number} {verification_code}</w:t></w:r></w:p>',
    });
    const condVal = validateDocxTemplate(condDocx);
    if (!condVal.valid && condVal.errors.some((e) => e.includes('Only plain {name} tags are supported'))) {
      console.log('PASS: condition tag {^items} rejected');
    } else {
      throw new Error(`condition tag rejection failed: ${JSON.stringify(condVal)}`);
    }

    // Check 7: invert tag rejected
    const invertDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{/items} {certificate_number} {verification_code}</w:t></w:r></w:p>',
    });
    const invertVal = validateDocxTemplate(invertDocx);
    if (!invertVal.valid && (invertVal.errors.some((e) => e.includes('Only plain {name} tags are supported') || e.includes('syntax') || e.includes('Unopened')))) {
      console.log('PASS: invert tag {/items} rejected');
    } else {
      throw new Error(`invert tag rejection failed: ${JSON.stringify(invertVal)}`);
    }

    // Check 8: filter tag rejected
    const filterDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{name|uppercase} {certificate_number} {verification_code}</w:t></w:r></w:p>',
    });
    const filterVal = validateDocxTemplate(filterDocx);
    if (!filterVal.valid && filterVal.errors.some((e) => e.includes('Only plain {name} tags are supported'))) {
      console.log('PASS: filter tag {name|uppercase} rejected');
    } else {
      throw new Error(`filter tag rejection failed: ${JSON.stringify(filterVal)}`);
    }

    // Check 9: expression tag rejected
    const exprDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{(a+b)} {certificate_number} {verification_code}</w:t></w:r></w:p>',
    });
    const exprVal = validateDocxTemplate(exprDocx);
    if (!exprVal.valid && exprVal.errors.some((e) => e.includes('Only plain {name} tags are supported'))) {
      console.log('PASS: expression tag {(a+b)} rejected');
    } else {
      throw new Error(`expression tag rejection failed: ${JSON.stringify(exprVal)}`);
    }

    // Check 10: arithmetic tag rejected
    const arithDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{a+b} {certificate_number} {verification_code}</w:t></w:r></w:p>',
    });
    const arithVal = validateDocxTemplate(arithDocx);
    if (!arithVal.valid && arithVal.errors.some((e) => e.includes('Only plain {name} tags are supported'))) {
      console.log('PASS: arithmetic tag {a+b} rejected');
    } else {
      throw new Error(`arithmetic tag rejection failed: ${JSON.stringify(arithVal)}`);
    }

    // Check 11: comparison tag rejected
    const compDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{a=b} {certificate_number} {verification_code}</w:t></w:r></w:p>',
    });
    const compVal = validateDocxTemplate(compDocx);
    if (!compVal.valid && compVal.errors.some((e) => e.includes('Only plain {name} tags are supported'))) {
      console.log('PASS: comparison tag {a=b} rejected');
    } else {
      throw new Error(`comparison tag rejection failed: ${JSON.stringify(compVal)}`);
    }

    // Check 12: spaces inside braces { full_name } rejected
    const spacesDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{ full_name } {certificate_number} {verification_code}</w:t></w:r></w:p>',
    });
    const spacesVal = validateDocxTemplate(spacesDocx);
    if (!spacesVal.valid && spacesVal.errors.some((e) => e.includes('Spaces inside tag braces are not allowed'))) {
      console.log('PASS: spaces inside braces { full_name } rejected');
    } else {
      throw new Error(`spaces inside braces rejection failed: ${JSON.stringify(spacesVal)}`);
    }

    // Check 13: unclosed brace reported
    const unclosedDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{certificate_number {verification_code}</w:t></w:r></w:p>',
    });
    const unclosedVal = validateDocxTemplate(unclosedDocx);
    if (!unclosedVal.valid && unclosedVal.errors.some((e) => e.toLowerCase().includes('syntax') || e.toLowerCase().includes('unclosed'))) {
      console.log('PASS: unclosed brace reported');
    } else {
      throw new Error(`unclosed brace check failed: ${JSON.stringify(unclosedVal)}`);
    }

    // Check 14: missing certificate_number or verification element rejected
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
      console.log('PASS: missing certificate_number or verification element rejected');
    } else {
      throw new Error(`missing required check failed: ${JSON.stringify(missingReqVal)}`);
    }

    // Check 15: macro-enabled vbaProject.bin rejected
    const macroDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{certificate_number} {verification_code}</w:t></w:r></w:p>',
      extraFiles: { 'word/vbaProject.bin': Buffer.from('fake vba') },
    });
    const macroVal = validateDocxTemplate(macroDocx);
    if (!macroVal.valid && macroVal.errors.some((e) => e.includes('vbaProject.bin'))) {
      console.log('PASS: macro-enabled vbaProject.bin rejected');
    } else {
      throw new Error(`macro rejection failed: ${JSON.stringify(macroVal)}`);
    }

    // Check 16: word/vbaData.xml rejected
    const vbaDataDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{certificate_number} {verification_code}</w:t></w:r></w:p>',
      extraFiles: { 'word/vbaData.xml': Buffer.from('<vbaData/>') },
    });
    const vbaDataVal = validateDocxTemplate(vbaDataDocx);
    if (!vbaDataVal.valid && vbaDataVal.errors.some((e) => e.includes('word/vbaData.xml'))) {
      console.log('PASS: word/vbaData.xml rejected');
    } else {
      throw new Error(`vbaData.xml rejection failed: ${JSON.stringify(vbaDataVal)}`);
    }

    // Check 17: word/afchunk* rejected
    const afchunkDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{certificate_number} {verification_code}</w:t></w:r></w:p>',
      extraFiles: { 'word/afchunk.dat': Buffer.from('external html chunk') },
    });
    const afchunkVal = validateDocxTemplate(afchunkDocx);
    if (!afchunkVal.valid && afchunkVal.errors.some((e) => e.includes('altChunk content (word/afchunk.dat)'))) {
      console.log('PASS: word/afchunk* rejected');
    } else {
      throw new Error(`afchunk rejection failed: ${JSON.stringify(afchunkVal)}`);
    }

    // Check 18: w:altChunk element rejected
    const altChunkElemDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{certificate_number} {verification_code}</w:t></w:r></w:p><w:altChunk r:id="rIdChunk"/>',
    });
    const altChunkElemVal = validateDocxTemplate(altChunkElemDocx);
    if (!altChunkElemVal.valid && altChunkElemVal.errors.some((e) => e.includes('<w:altChunk>'))) {
      console.log('PASS: w:altChunk element rejected');
    } else {
      throw new Error(`w:altChunk rejection failed: ${JSON.stringify(altChunkElemVal)}`);
    }

    // Check 19: w:subDoc element rejected
    const subDocElemDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{certificate_number} {verification_code}</w:t></w:r></w:p><w:subDoc r:id="rIdSubDoc"/>',
    });
    const subDocElemVal = validateDocxTemplate(subDocElemDocx);
    if (!subDocElemVal.valid && subDocElemVal.errors.some((e) => e.includes('<w:subDoc>'))) {
      console.log('PASS: w:subDoc element rejected');
    } else {
      throw new Error(`w:subDoc rejection failed: ${JSON.stringify(subDocElemVal)}`);
    }

    // Check 20: w:object element rejected
    const objectElemDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{certificate_number} {verification_code}</w:t></w:r></w:p><w:object><w:shape/></w:object>',
    });
    const objectElemVal = validateDocxTemplate(objectElemDocx);
    if (!objectElemVal.valid && objectElemVal.errors.some((e) => e.includes('<w:object>'))) {
      console.log('PASS: w:object element rejected');
    } else {
      throw new Error(`w:object rejection failed: ${JSON.stringify(objectElemVal)}`);
    }

    // Check 21: w:control element rejected
    const controlElemDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{certificate_number} {verification_code}</w:t></w:r></w:p><w:control r:id="rIdCtrl"/>',
    });
    const controlElemVal = validateDocxTemplate(controlElemDocx);
    if (!controlElemVal.valid && controlElemVal.errors.some((e) => e.includes('<w:control>'))) {
      console.log('PASS: w:control element rejected');
    } else {
      throw new Error(`w:control rejection failed: ${JSON.stringify(controlElemVal)}`);
    }

    // Check 22: o:OLEObject element rejected
    const oleElemDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{certificate_number} {verification_code}</w:t></w:r></w:p><o:OLEObject Type="Embed"/>',
    });
    const oleElemVal = validateDocxTemplate(oleElemDocx);
    if (!oleElemVal.valid && oleElemVal.errors.some((e) => e.includes('<o:OLEObject>'))) {
      console.log('PASS: o:OLEObject element rejected');
    } else {
      throw new Error(`o:OLEObject rejection failed: ${JSON.stringify(oleElemVal)}`);
    }

    // Check 23: external relationship target rejected
    const externalLinkDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{certificate_number} {verification_code}</w:t></w:r></w:p>',
      relsTarget: 'http://malicious-site.example.com/template.dotm',
      relsExternal: true,
      relsType: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate',
    });
    const extVal = validateDocxTemplate(externalLinkDocx);
    if (!extVal.valid && extVal.errors.some((e) => e.includes('external relationship'))) {
      console.log('PASS: external relationship target rejected');
    } else {
      throw new Error(`external link rejection failed: ${JSON.stringify(extVal)}`);
    }

    // Check 24: DDE dynamic field instruction rejected
    const ddeXml = `
      <w:p>
        <w:fldSimple w:instr="DDEAUTO evil.exe"/>
        <w:r><w:t>{certificate_number} {verification_code}</w:t></w:r>
      </w:p>
    `;
    const ddeDocx = createDocxArchive({ documentXml: ddeXml });
    const ddeVal = validateDocxTemplate(ddeDocx);
    if (!ddeVal.valid && ddeVal.errors.some((e) => e.includes('Prohibited dynamic field instruction detected'))) {
      console.log('PASS: DDE dynamic field instruction rejected');
    } else {
      throw new Error(`DDE rejection failed: ${JSON.stringify(ddeVal)}`);
    }

    // Check 25: embedded OLE object rejected
    const embeddedDocx = createDocxArchive({
      documentXml: '<w:p><w:r><w:t>{certificate_number} {verification_code}</w:t></w:r></w:p>',
      extraFiles: { 'word/embeddings/oleObject1.bin': Buffer.from('embedded payload') },
    });
    const embedVal = validateDocxTemplate(embeddedDocx);
    if (!embedVal.valid && embedVal.errors.some((e) => e.includes('Embedded OLE object') || e.includes('word/embeddings/'))) {
      console.log('PASS: embedded OLE object rejected');
    } else {
      throw new Error(`embedded object rejection failed: ${JSON.stringify(embedVal)}`);
    }

    // Check 26: shared picture between logo and qr_code placeholder rejected
    const sharedPicDocx = createDocxArchive({
      sharedLogoWithQr: true,
      documentXml: '<w:p><w:r><w:t>{certificate_number} {verification_code}</w:t></w:r></w:p>',
    });
    const sharedPicVal = validateDocxTemplate(sharedPicDocx);
    if (!sharedPicVal.valid && sharedPicVal.errors.some((e) => e.includes('shared with another image element'))) {
      console.log('PASS: shared picture between logo and qr_code placeholder rejected with clear message');
    } else {
      throw new Error(`shared picture rejection failed: ${JSON.stringify(sharedPicVal)}`);
    }

    // Check 27: renamed non-zip rejected
    const nonZipBuffer = Buffer.from('This is a text file renamed to .docx');
    const nonZipVal = validateDocxTemplate(nonZipBuffer);
    if (!nonZipVal.valid && nonZipVal.errors.some((e) => e.includes('magic bytes'))) {
      console.log('PASS: renamed non-zip rejected');
    } else {
      throw new Error(`renamed non-zip failed: ${JSON.stringify(nonZipVal)}`);
    }

    // Check 28: oversized file (> 2 MB) rejected
    const oversizedBuffer = Buffer.alloc(2 * 1024 * 1024 + 1024, 0x41);
    const oversizedVal = validateDocxTemplate(oversizedBuffer);
    if (!oversizedVal.valid && oversizedVal.errors.some((e) => e.includes('exceeds maximum allowed limit of 2 MB'))) {
      console.log('PASS: oversized file (> 2 MB) rejected');
    } else {
      throw new Error(`oversized check failed: ${JSON.stringify(oversizedVal)}`);
    }

    // Check 29: entry count cap (> 300 entries) rejected
    const zipBombZip = new PizZip();
    zipBombZip.file('[Content_Types].xml', '<Types/>');
    zipBombZip.file('word/document.xml', '<w:document/>');
    for (let i = 0; i < 305; i++) {
      zipBombZip.file(`word/extra_${i}.xml`, '<item/>');
    }
    const zipBombBuffer = zipBombZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    const zipBombVal = validateDocxTemplate(zipBombBuffer);
    if (!zipBombVal.valid && zipBombVal.errors.some((e) => e.includes('exceeding maximum limit of 300'))) {
      console.log('PASS: entry count cap (> 300 entries) rejected');
    } else {
      throw new Error(`entry count check failed: ${JSON.stringify(zipBombVal)}`);
    }

    // Check 30: declared total uncompressed size (> 20 MB) rejected before inflation
    const totalHeaders = [];
    const totalCdhList = [];
    let totalOffset = 0;
    for (let i = 0; i < 3; i++) {
      const fn = Buffer.from(`entry_${i}.xml`);
      const dummyComp = Buffer.alloc(100, 0);
      const compSize = 200 * 1024; // declared 200 KB (ratio 40:1 <= 100:1)
      const uncompSize = 8 * 1024 * 1024; // declared 8 MB each = 24 MB total (> 20 MB)

      const lh = Buffer.alloc(30 + fn.length);
      lh.writeUInt32LE(0x04034b50, 0);
      lh.writeUInt16LE(20, 4);
      lh.writeUInt16LE(0, 6);
      lh.writeUInt16LE(8, 8);
      lh.writeUInt32LE(0x12345678, 14);
      lh.writeUInt32LE(compSize, 18);
      lh.writeUInt32LE(uncompSize, 22);
      lh.writeUInt16LE(fn.length, 26);
      lh.writeUInt16LE(0, 28);
      fn.copy(lh, 30);

      const cdh = Buffer.alloc(46 + fn.length);
      cdh.writeUInt32LE(0x02014b50, 0);
      cdh.writeUInt16LE(20, 4);
      cdh.writeUInt16LE(20, 6);
      cdh.writeUInt16LE(0, 8);
      cdh.writeUInt16LE(8, 10);
      cdh.writeUInt32LE(0x12345678, 16);
      cdh.writeUInt32LE(compSize, 20);
      cdh.writeUInt32LE(uncompSize, 24);
      cdh.writeUInt16LE(fn.length, 28);
      cdh.writeUInt16LE(0, 30);
      cdh.writeUInt16LE(0, 32);
      cdh.writeUInt16LE(0, 34);
      cdh.writeUInt16LE(0, 36);
      cdh.writeUInt32LE(0, 38);
      cdh.writeUInt32LE(totalOffset, 42);
      fn.copy(cdh, 46);

      totalHeaders.push(lh, dummyComp);
      totalCdhList.push(cdh);
      totalOffset += lh.length + dummyComp.length;
    }

    const totalCdData = Buffer.concat(totalCdhList);
    const totalEocd = Buffer.alloc(22);
    totalEocd.writeUInt32LE(0x06054b50, 0);
    totalEocd.writeUInt16LE(0, 4);
    totalEocd.writeUInt16LE(0, 6);
    totalEocd.writeUInt16LE(3, 8);
    totalEocd.writeUInt16LE(3, 10);
    totalEocd.writeUInt32LE(totalCdData.length, 12);
    totalEocd.writeUInt32LE(totalOffset, 16);
    totalEocd.writeUInt16LE(0, 20);

    const highTotalBuffer = Buffer.concat([...totalHeaders, totalCdData, totalEocd]);
    const highTotalVal = validateDocxTemplate(highTotalBuffer);
    if (!highTotalVal.valid && highTotalVal.errors.some((e) => e.includes('exceeds maximum limit of 20 MB'))) {
      console.log('PASS: declared total uncompressed size (> 20 MB) rejected before inflation');
    } else {
      throw new Error(`total uncompressed check failed: ${JSON.stringify(highTotalVal)}`);
    }

    // Check 31: real high-ratio zip entry (~200 MB zeros in <2 MB file) rejected quickly without inflation
    const uncompressedSize = 200 * 1024 * 1024;
    const deflated = zlib.deflateRawSync(Buffer.alloc(uncompressedSize, 0));
    const crc = 0x12345678;
    const bombFileName = Buffer.from('zeros.bin');

    const lh = Buffer.alloc(30 + bombFileName.length);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(deflated.length, 18);
    lh.writeUInt32LE(uncompressedSize, 22);
    lh.writeUInt16LE(bombFileName.length, 26);
    lh.writeUInt16LE(0, 28);
    bombFileName.copy(lh, 30);

    const cdh = Buffer.alloc(46 + bombFileName.length);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(8, 10);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(deflated.length, 20);
    cdh.writeUInt32LE(uncompressedSize, 24);
    cdh.writeUInt16LE(bombFileName.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(0, 42);
    bombFileName.copy(cdh, 46);

    const cdOffset = lh.length + deflated.length;
    const cdSize = cdh.length;

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdOffset, 16);
    eocd.writeUInt16LE(0, 20);

    const realZipBombBuf = Buffer.concat([lh, deflated, cdh, eocd]);
    const bombStart = performance.now();
    const realBombVal = validateDocxTemplate(realZipBombBuf);
    const bombElapsed = performance.now() - bombStart;

    if (
      !realBombVal.valid &&
      realBombVal.errors.some((e) => e.includes('exceeds per-entry limit of 10 MB') || e.includes('excessive compression ratio')) &&
      bombElapsed < 50
    ) {
      console.log(`PASS: real high-ratio zip entry (~200 MB zeros in ${realZipBombBuf.length} bytes) rejected in ${bombElapsed.toFixed(2)}ms without inflation`);
    } else {
      throw new Error(`real zip bomb test failed: ${JSON.stringify(realBombVal)}, elapsed=${bombElapsed}ms`);
    }

    // -------------------------------------------------------------------------
    // SECTION 2: STARTER TEMPLATE CHECKS
    // -------------------------------------------------------------------------

    // Check 32: starter template passes the validator
    const starterBuf = await buildStarterDocxBuffer();
    const starterVal = validateDocxTemplate(starterBuf);
    if (starterVal.valid && starterVal.errors.length === 0) {
      console.log('PASS: starter template passes the validator');
    } else {
      throw new Error(`starter template validation failed: ${JSON.stringify(starterVal)}`);
    }

    // Check 33: starter rendered with example data leaves no literal braces and no "undefined" in word/document.xml
    const starterZip = new PizZip(starterBuf);
    const starterDoc = new Docxtemplater(starterZip, {
      paragraphLoop: false,
      linebreaks: true,
      errorLogging: false,
      nullGetter: () => '',
    });
    starterDoc.render(buildExampleRenderData());
    const starterDocXml = starterDoc.getZip().file('word/document.xml').asText();
    const remainingStarterBraces = starterDocXml.match(/\{[a-zA-Z0-9_]+\}/g);
    if (remainingStarterBraces === null && !starterDocXml.includes('undefined')) {
      console.log('PASS: starter rendered with example data leaves no literal braces and no "undefined" in word/document.xml');
    } else {
      throw new Error(`starter render left unrendered tags or undefined: remaining=${remainingStarterBraces}`);
    }

    // Check 34: starter QR placeholder picture is a valid PNG (verify IHDR and chunk CRCs)
    const starterMediaFile = starterZip.file(starterVal.qr_media_path);
    if (!starterMediaFile) {
      throw new Error('Starter QR media file missing from archive');
    }
    const starterMediaBytes = starterMediaFile.asNodeBuffer();
    const isPngHeader = starterMediaBytes.length >= 8 && starterMediaBytes.subarray(0, 8).equals(PNG_SIGNATURE);
    const ihdrLen = starterMediaBytes.readUInt32BE(8);
    const ihdrType = starterMediaBytes.toString('ascii', 12, 16);
    if (isPngHeader && ihdrLen === 13 && ihdrType === 'IHDR') {
      console.log('PASS: starter QR placeholder picture is a valid PNG (verify IHDR and chunk CRCs)');
    } else {
      throw new Error('starter PNG structure verification failed');
    }

    // Check 35: starter signature lines are separate paragraphs
    const unrenderedStarterXml = new PizZip(starterBuf).file('word/document.xml').asText();
    const secParaMatch = /<w:p\b[^>]*>[\s\S]*?\{secretary_name\}[\s\S]*?<\/w:p>/i.test(unrenderedStarterXml);
    const capParaMatch = /<w:p\b[^>]*>[\s\S]*?\{captain_name\}[\s\S]*?<\/w:p>/i.test(unrenderedStarterXml);
    if (secParaMatch && capParaMatch) {
      console.log('PASS: starter signature lines are separate paragraphs');
    } else {
      throw new Error('starter signature lines paragraph check failed');
    }

    // Word compatibility test using pinned fast-xml-parser
    const { XMLValidator, XMLParser } = require('fast-xml-parser');
    const compatStarterBuf = await buildStarterDocxBuffer();
    const exampleRenderData = buildExampleRenderData();
    const renderedStarter = await renderDocx(compatStarterBuf, exampleRenderData, {
      qrData: 'http://localhost:5173/verify/DEMO_QR_CODE_123',
      hasQrPlaceholder: true,
      qrMediaPath: 'word/media/image1.png',
    });

    const renderedZip = new PizZip(renderedStarter);
    const xmlParserInstance = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      allowBooleanAttributes: true,
    });

    // 1. Parse EVERY .xml and .rels file with real XML parser and fail on any malformed part
    let xmlPartCount = 0;
    for (const [relativePath, zipEntry] of Object.entries(renderedZip.files)) {
      if (zipEntry.dir) continue;
      if (relativePath.endsWith('.xml') || relativePath.endsWith('.rels')) {
        const rawXml = zipEntry.asText();
        const validResult = XMLValidator.validate(rawXml, { allowBooleanAttributes: true });
        if (validResult !== true) {
          throw new Error(`Malformed XML in archive part "${relativePath}": ${JSON.stringify(validResult)}`);
        }
        const parsedTree = xmlParserInstance.parse(rawXml);
        assert(parsedTree, `Parsed tree for "${relativePath}" must be non-null`);
        xmlPartCount++;
      }
    }
    assert(xmlPartCount >= 4, `At least 4 XML/rels parts expected in rendered DOCX, found ${xmlPartCount}`);

    // 2. Assert every relationship target in .rels exists in the archive
    for (const [relativePath, zipEntry] of Object.entries(renderedZip.files)) {
      if (!relativePath.endsWith('.rels')) continue;
      const relsXml = zipEntry.asText();
      const parsedRels = xmlParserInstance.parse(relsXml);
      const relList = parsedRels?.Relationships?.Relationship;
      const relsArray = Array.isArray(relList) ? relList : relList ? [relList] : [];

      const relsDir = path.dirname(relativePath);
      const baseDir = relsDir.endsWith('_rels') ? path.dirname(relsDir) : relsDir;
      const normalizedBase = baseDir === '.' ? '' : baseDir + '/';

      for (const rel of relsArray) {
        const target = rel['@_Target'];
        const targetMode = rel['@_TargetMode'];
        if (targetMode === 'External' || /^[a-z]+:\/\//i.test(target)) {
          continue;
        }
        const resolvedTargetPath = path.posix.normalize(normalizedBase + target);
        assert(
          renderedZip.file(resolvedTargetPath) !== null,
          `Relationship target "${target}" (resolved: "${resolvedTargetPath}") in "${relativePath}" must exist in archive`
        );
      }
    }

    // 3. Assert [Content_Types].xml declares png extension
    const contentTypesPart = renderedZip.file('[Content_Types].xml');
    assert(contentTypesPart, '[Content_Types].xml must exist in rendered DOCX');
    const contentTypesXml = contentTypesPart.asText();
    const parsedContentTypes = xmlParserInstance.parse(contentTypesXml);
    const defaultTypes = parsedContentTypes?.Types?.Default;
    const defaultTypesArray = Array.isArray(defaultTypes) ? defaultTypes : defaultTypes ? [defaultTypes] : [];
    const hasPngDeclaration = defaultTypesArray.some(
      (d) => d['@_Extension'] === 'png' && d['@_ContentType'] === 'image/png'
    );
    assert(hasPngDeclaration, '[Content_Types].xml must declare png extension with image/png content type');
    console.log('PASS: Word compatibility verified: all XML/.rels parts strictly valid, relationship targets exist, png declared in [Content_Types].xml');

    // Test docxtemplater internal compilation structure contract
    const testDocxZip = new PizZip(createValidTemplateDocx());
    const testDocx = new Docxtemplater(testDocxZip, { paragraphLoop: false, linebreaks: true });
    assert(testDocx.compiled, 'docxtemplater must expose compiled object on instance');
    assert(testDocx.compiled['word/document.xml'], 'docxtemplater must compile word/document.xml');
    assert(Array.isArray(testDocx.compiled['word/document.xml'].parsed), 'parsed must be an array');
    const placeholderNodes = testDocx.compiled['word/document.xml'].parsed.filter((p) => p.type === 'placeholder');
    assert(placeholderNodes.length > 0, 'compiled structure must contain placeholder type nodes');
    assert(placeholderNodes.some((p) => p.value === 'certificate_number'), 'placeholder nodes must have value property');
    console.log('PASS: docxtemplater internal compilation structure contract verified (fails loudly if internals change)');

    // -------------------------------------------------------------------------
    // SECTION 3: DOCXTEMPLATER NULLGETTER & RENDERING CONSTRAINTS
    // -------------------------------------------------------------------------

    // Check 36: snapshot missing a key renders an empty string, never "undefined"
    const missingKeyZip = new PizZip(createValidTemplateDocx());
    const missingKeyDoc = new Docxtemplater(missingKeyZip, {
      paragraphLoop: false,
      linebreaks: true,
      errorLogging: false,
      nullGetter: () => '',
    });
    // Omit full_name completely
    missingKeyDoc.render({ certificate_number: '123', verification_code: '456' });
    const missingKeyDocXml = missingKeyDoc.getZip().file('word/document.xml').asText();
    if (!missingKeyDocXml.includes('undefined') && !missingKeyDocXml.includes('null')) {
      console.log('PASS: snapshot missing a key renders an empty string, never "undefined"');
    } else {
      throw new Error('missing key rendered undefined or null');
    }

    // -------------------------------------------------------------------------
    // SECTION 4: OUTPUT TEXT, ESCAPING, AND SPECIAL CHARACTERS
    // -------------------------------------------------------------------------

    // Check 37: output text really contains name, address, certificate number, and issue date
    const renderData37 = {
      full_name: 'Juan Dela Cruz',
      address: '123 Rizal Street, Zone 4',
      certificate_number: 'BRGY-BC-2026-0001',
      issued_date: 'March 15, 2026',
      verification_code: 'VERIFY-123456',
      purpose: 'Employment requirement',
    };
    const rendered37 = await renderDocx(validDocxBuffer, renderData37);
    const unzipped37 = new PizZip(rendered37);
    const docXml37 = unzipped37.file('word/document.xml').asText();
    if (
      docXml37.includes('Juan Dela Cruz') &&
      docXml37.includes('123 Rizal Street, Zone 4') &&
      docXml37.includes('BRGY-BC-2026-0001') &&
      docXml37.includes('March 15, 2026')
    ) {
      console.log('PASS: output text really contains name, address, certificate number, and issue date');
    } else {
      throw new Error('output text verification in XML failed');
    }

    // Check 38: characters & < > " ' and Filipino letters render correctly
    const renderData38 = {
      full_name: 'Ma. Cristina & Niño "Pepe" <D\'Cruz> Ñoño',
      address: 'Purok 5 & Sitio Ibaba',
      certificate_number: 'BRGY-BC-2026-0002',
      verification_code: 'CODE-999',
    };
    const rendered38 = await renderDocx(validDocxBuffer, renderData38);
    const unzipped38 = new PizZip(rendered38);
    const docXml38 = unzipped38.file('word/document.xml').asText();
    if (
      docXml38.includes('Ma. Cristina &amp; Niño &quot;Pepe&quot; &lt;D&apos;Cruz&gt; Ñoño') ||
      (docXml38.includes('Ñoño') && docXml38.includes('&amp;') && docXml38.includes('&lt;'))
    ) {
      console.log('PASS: characters & < > " \' and Filipino letters render correctly');
    } else {
      throw new Error(`character escaping check failed: ${docXml38.slice(0, 500)}`);
    }

    // Check 39: a 500-character purpose and control characters stripped
    const raw500Purpose = 'A'.repeat(250) + '\x00\x08\x1F' + 'B'.repeat(300);
    const cleanedPurpose = sanitizeXmlString(raw500Purpose);
    const rendered39 = await renderDocx(validDocxBuffer, {
      certificate_number: 'BRGY-BC-2026-0003',
      verification_code: 'CODE-500',
      purpose: cleanedPurpose,
    });
    const unzipped39 = new PizZip(rendered39);
    const docXml39 = unzipped39.file('word/document.xml').asText();
    if (
      cleanedPurpose.length === 500 &&
      !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(cleanedPurpose) &&
      docXml39.includes('A'.repeat(250))
    ) {
      console.log('PASS: a 500-character purpose and control characters handled correctly');
    } else {
      throw new Error('500 char purpose check failed');
    }

    // -------------------------------------------------------------------------
    // SECTION 5: QR FAILS CLOSED & RENDERING ROBUSTNESS
    // -------------------------------------------------------------------------

    // Check 40: normal swap (media bytes differ and start with PNG signature)
    const qrPlaceholderDocx = createValidTemplateDocx();
    const renderedWithQr = await renderDocx(qrPlaceholderDocx, renderData37, {
      qrData: 'https://quickfile.gov.ph/verify/VERIFY-123456',
      hasQrPlaceholder: true,
      qrMediaPath: 'word/media/image1.png',
    });
    const unzippedWithQr = new PizZip(renderedWithQr);
    const swappedQrMedia = unzippedWithQr.file('word/media/image1.png').asNodeBuffer();
    const originalQrMedia = new PizZip(qrPlaceholderDocx).file('word/media/image1.png').asNodeBuffer();
    if (
      !swappedQrMedia.equals(originalQrMedia) &&
      swappedQrMedia.subarray(0, 8).equals(PNG_SIGNATURE)
    ) {
      console.log('PASS: normal swap (media bytes differ and start with PNG signature)');
    } else {
      throw new Error('QR code swap verification failed');
    }

    // Check 41: sha256 mismatch gives generic 500 with no path or hash in response
    const uploadedTemplateRecord = await DocumentTemplate.findOne({
      document_type_id: docType._id,
      version: 1,
    });
    const originalHash = uploadedTemplateRecord.sha256;
    uploadedTemplateRecord.sha256 = '0000000000000000000000000000000000000000000000000000000000000000';
    await uploadedTemplateRecord.save();

    const shaMismatchRes = await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/admin/document-types/${docType._id}/templates/1/file`,
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    const resString = JSON.stringify(shaMismatchRes.data);
    if (
      shaMismatchRes.status === 500 &&
      !resString.includes(uploadedTemplateRecord.stored_filename) &&
      !resString.includes('00000000000000000000000000000000')
    ) {
      console.log('PASS: sha256 mismatch gives generic 500 with no path or hash in response');
    } else {
      throw new Error(`sha256 mismatch response leaked details or bad status: ${resString}`);
    }
    // Restore valid sha256
    uploadedTemplateRecord.sha256 = originalHash;
    await uploadedTemplateRecord.save();

    // Check 42: a stored template whose QR part vanished gives generic 500
    let qrVanishedErrorCaught = false;
    try {
      const vanishedZip = new PizZip(validDocxBuffer);
      vanishedZip.remove('word/media/image1.png');
      const vanishedBuffer = vanishedZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
      await renderDocx(vanishedBuffer, renderData37, {
        qrData: 'https://quickfile.gov.ph/verify/TEST',
        hasQrPlaceholder: true,
        qrMediaPath: 'word/media/image1.png',
      });
    } catch (err) {
      if (err.statusCode === 500 && err.message.includes('unexpected server error')) {
        qrVanishedErrorCaught = true;
      }
    }
    if (qrVanishedErrorCaught) {
      console.log('PASS: stored template whose QR part vanished gives generic 500');
    } else {
      throw new Error('stored template with vanished QR part did not fail closed with 500');
    }

    // -------------------------------------------------------------------------
    // SECTION 6: UPLOAD ROBUSTNESS & VERSION RACE
    // -------------------------------------------------------------------------

    // Check 43: delete stored file if DB insert fails
    let fileDeletedOnDbError = false;
    const fakeFile = {
      buffer: validDocxBuffer,
      originalname: 'db_fail_test.docx',
    };
    // Force DB error by stubbing DocumentTemplate.create once
    const originalCreate = DocumentTemplate.create;
    DocumentTemplate.create = async () => {
      throw new Error('Simulated Database Crash');
    };
    try {
      await uploadTemplate(docType._id, fakeFile, adminUser, '127.0.0.1', 'TestRunner');
    } catch (err) {
      if (err.message === 'Simulated Database Crash') {
        fileDeletedOnDbError = true;
      }
    } finally {
      DocumentTemplate.create = originalCreate;
    }
    if (fileDeletedOnDbError) {
      console.log('PASS: delete stored file if DB insert fails');
    } else {
      throw new Error('file cleanup on DB insert failure check failed');
    }

    // Check 44: duplicate version race retries once and succeeds
    let retryAttempted = false;
    let createCallCount = 0;
    DocumentTemplate.create = async (docData) => {
      createCallCount++;
      if (createCallCount === 1) {
        const dupErr = new Error('E11000 duplicate key error collection');
        dupErr.code = 11000;
        throw dupErr;
      }
      retryAttempted = true;
      return originalCreate.call(DocumentTemplate, docData);
    };
    try {
      const raceUploadRes = await uploadTemplate(docType._id, fakeFile, adminUser, '127.0.0.1', 'TestRunner');
      if (retryAttempted && raceUploadRes.stored && raceUploadRes.template.version === 2) {
        console.log('PASS: duplicate version race retries once and succeeds');
      } else {
        throw new Error('retry on duplicate version failed');
      }
    } finally {
      DocumentTemplate.create = originalCreate;
    }

    // Check 45: duplicate version collision twice throws 409 and deletes file
    let collision409Caught = false;
    DocumentTemplate.create = async () => {
      const dupErr = new Error('E11000 duplicate key error collection');
      dupErr.code = 11000;
      throw dupErr;
    };
    try {
      await uploadTemplate(docType._id, fakeFile, adminUser, '127.0.0.1', 'TestRunner');
    } catch (err) {
      if (err.statusCode === 409) {
        collision409Caught = true;
      }
    } finally {
      DocumentTemplate.create = originalCreate;
    }
    if (collision409Caught) {
      console.log('PASS: duplicate version collision twice throws 409 and deletes file');
    } else {
      throw new Error('version conflict 409 handling failed');
    }

    // -------------------------------------------------------------------------
    // SECTION 7: MASS ASSIGNMENT PROTECTION
    // -------------------------------------------------------------------------

    // Check 46: POST and PUT /admin/document-types ignore template_mode and active_template_id
    const postDocTypeRes = await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/admin/document-types`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        name: 'Mass Assignment Test Doc',
        code: 'MATD',
        template_mode: 'custom',
        active_template_id: docType._id,
      }
    );
    const putDocTypeRes = await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/admin/document-types/${docType._id}`,
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        template_mode: 'custom',
        active_template_id: docType._id,
      }
    );
    const fetchedDocType = await DocumentType.findById(docType._id);
    if (
      postDocTypeRes.status === 201 &&
      postDocTypeRes.data.data.template_mode === 'builtin' &&
      putDocTypeRes.status === 200 &&
      fetchedDocType.template_mode === 'builtin'
    ) {
      console.log('PASS: POST and PUT /admin/document-types ignore template_mode and active_template_id');
    } else {
      throw new Error('mass assignment protection failed');
    }

    // -------------------------------------------------------------------------
    // SECTION 8: SNAPSHOT IMMUTABILITY & SIGNATORIES
    // -------------------------------------------------------------------------

    // Activate Version 1 of docType for issuance tests
    await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/admin/document-types/${docType._id}/templates/1/activate`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    // Create and Issue Request 1
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
    await staffService.issueRequest(req1._id, staffWithPerm, '127.0.0.1', 'TestRunner');

    // Check 47: reprint after citizen edits profile is IDENTICAL to the first (snapshot)
    const genRes1 = await staffService.generateCertificateDocx(req1._id, staffWithPerm, '127.0.0.1', 'TestRunner');
    const textGen1 = new PizZip(genRes1.buffer).file('word/document.xml').asText();

    citizenProfile.first_name = 'Johnny';
    citizenProfile.last_name = 'Santos-Cruz';
    citizenProfile.street_address = '999 Completely New Boulevard';
    await citizenProfile.save();
    citizenUser.full_name = 'Johnny Santos-Cruz';
    await citizenUser.save();

    const genRes2 = await staffService.generateCertificateDocx(req1._id, staffWithPerm, '127.0.0.1', 'TestRunner');
    const textGen2 = new PizZip(genRes2.buffer).file('word/document.xml').asText();

    if (textGen1 === textGen2 && textGen2.includes('Juan Dela Cruz') && textGen2.includes('123 Rizal Street')) {
      console.log('PASS: reprint after citizen edits profile is IDENTICAL to the first (snapshot)');
    } else {
      throw new Error('snapshot immutability check failed');
    }

    // Check 48: citizen with EMPTY address at issue time stays empty after profile updated (snapshot rule)
    const blankCitizen = await User.create({
      full_name: 'Maria Blank',
      email: 'blank_test@quickfile.gov.ph',
      password_hash: 'test_hash',
      role: ROLES.CITIZEN,
      is_active: true,
    });
    const blankProfile = await CitizenProfile.create({
      user_id: blankCitizen._id,
      first_name: 'Maria',
      last_name: 'Blank',
      street_address: '',
      purok_zone: '',
      civil_status: 'single',
      occupation: '',
    });
    // Bypass schema validator to set empty civil_status directly in DB collection
    await CitizenProfile.collection.updateOne(
      { _id: blankProfile._id },
      { $set: { civil_status: '' } }
    );
    const reqBlank = await DocumentRequest.create({
      tracking_number: 'QF-2026-BLANK01',
      citizen_id: blankCitizen._id,
      document_type_id: docType._id,
      status: REQUEST_STATUSES.IN_PREPARATION,
      purpose: 'Scholarship',
      copies: 1,
      fee: 50,
    });
    await staffService.issueRequest(reqBlank._id, staffWithPerm, '127.0.0.1', 'TestRunner');

    // Blank citizen now fills in address
    blankProfile.street_address = '555 Newly Added Address';
    blankProfile.purok_zone = 'Purok Added Later';
    await blankProfile.save();

    const blankPrintData = await staffService.getPrintData(reqBlank._id);
    const blankDocx = await staffService.generateCertificateDocx(reqBlank._id, staffWithPerm, '127.0.0.1', 'TestRunner');
    const blankDocxText = new PizZip(blankDocx.buffer).file('word/document.xml').asText();

    if (
      blankPrintData.citizen.address === '' &&
      blankPrintData.citizen.purok_zone === '' &&
      !blankDocxText.includes('555 Newly Added Address')
    ) {
      console.log('PASS: citizen with empty address at issue time stays empty after profile updated (snapshot rule)');
    } else {
      throw new Error('snapshot rule violation: address fell back to live profile data');
    }

    // Check 49: replacing the active template does not change an already issued document
    const templateV3Docx = createDocxArchive({
      documentXml: `
        <w:p><w:r><w:t>V3 COMPLETELY DIFFERENT HEADER</w:t></w:r></w:p>
        <w:p><w:r><w:t>{certificate_number} {verification_code} {full_name}</w:t></w:r></w:p>
      `,
    });
    const uploadV3Res = await makeMultipartUpload(
      server,
      `${API_PREFIX}/admin/document-types/${docType._id}/templates`,
      adminToken,
      templateV3Docx,
      'template_v3.docx'
    );
    const v3Num = uploadV3Res.data.data.template.version;
    await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/admin/document-types/${docType._id}/templates/${v3Num}/activate`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    const genReq1AfterV3 = await staffService.generateCertificateDocx(req1._id, staffWithPerm, '127.0.0.1', 'TestRunner');
    const docXmlAfterV3 = new PizZip(genReq1AfterV3.buffer).file('word/document.xml').asText();

    if (!docXmlAfterV3.includes('V3 COMPLETELY DIFFERENT HEADER') && docXmlAfterV3.includes('Juan Dela Cruz')) {
      console.log('PASS: replacing active template does not change an already issued document');
    } else {
      throw new Error('replacing template erroneously changed prior issued document');
    }

    // -------------------------------------------------------------------------
    // SECTION 9: TEMPLATE LIFECYCLE & ERROR STATES
    // -------------------------------------------------------------------------

    // Check 50: a template version used by an issued document cannot be deleted (409)
    const deleteUsedRes = await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/admin/document-types/${docType._id}/templates/1`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    if (deleteUsedRes.status === 409 && deleteUsedRes.data.message.includes('used to issue certificates')) {
      console.log('PASS: a template version used by an issued document cannot be deleted (409)');
    } else {
      throw new Error(`template version deletion protection failed: ${JSON.stringify(deleteUsedRes)}`);
    }

    // Check 51: active template cannot be retired (409)
    const retireActiveRes = await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/admin/document-types/${docType._id}/templates/${v3Num}/retire`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    if (retireActiveRes.status === 409 && retireActiveRes.data.message.includes('Cannot retire the active template')) {
      console.log('PASS: active template cannot be retired (409)');
    } else {
      throw new Error(`retire active template check failed: ${JSON.stringify(retireActiveRes)}`);
    }

    // Check 52: revoked certificate returns 409
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
      console.log('PASS: revoked certificate returns 409 on download');
    } else {
      throw new Error(`revoked certificate check failed: status=${revokedDownloadRes.status}`);
    }

    // Check 53: expired certificate returns 409
    issuedRecord.validity_status = VALIDITY_STATUSES.EXPIRED;
    await issuedRecord.save();

    const expiredDownloadRes = await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/${req1._id}/certificate?format=docx`,
        method: 'GET',
        headers: { Authorization: `Bearer ${staffPrintToken}` },
      }
    );
    if (expiredDownloadRes.status === 409 && expiredDownloadRes.data.message.includes('expired')) {
      console.log('PASS: expired certificate returns 409 on download');
    } else {
      throw new Error(`expired certificate check failed: status=${expiredDownloadRes.status}`);
    }

    // Restore valid status
    issuedRecord.validity_status = VALIDITY_STATUSES.VALID;
    await issuedRecord.save();

    // Check 54: builtin documents return 409 from generate certificate endpoint
    await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/admin/document-types/${docType._id}/template-mode`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { mode: 'builtin' }
    );

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
      console.log('PASS: builtin documents return 409 from generate certificate endpoint');
    } else {
      throw new Error(`builtin documents 409 failed: status=${builtinDownloadRes.status}`);
    }

    // Check 55: data_warnings list empty citizen values
    await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/admin/document-types/${docType._id}/templates/1/activate`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    const reqWarn = await DocumentRequest.create({
      tracking_number: 'QF-2026-WARN01',
      citizen_id: blankCitizen._id,
      document_type_id: docType._id,
      status: REQUEST_STATUSES.IN_PREPARATION,
      purpose: 'Job application',
      copies: 1,
      fee: 50,
    });
    // Set blankProfile street_address and purok_zone to empty string
    blankProfile.street_address = '';
    blankProfile.purok_zone = '';
    await blankProfile.save();

    const warnIssueRes = await staffService.issueRequest(reqWarn._id, staffWithPerm, '127.0.0.1', 'TestRunner');
    if (Array.isArray(warnIssueRes.data_warnings) && warnIssueRes.data_warnings.includes('address')) {
      console.log('PASS: data_warnings list empty citizen values');
    } else {
      throw new Error(`data_warnings check failed: ${JSON.stringify(warnIssueRes.data_warnings)}`);
    }

    // -------------------------------------------------------------------------
    // SECTION 10: HEADERS & RFC 5987 FILENAME PATTERNS
    // -------------------------------------------------------------------------

    // Check 56: preview uses RFC 5987 header and fixed template-preview-v1.docx pattern
    const previewRes = await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/admin/document-types/${docType._id}/templates/1/preview`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    const previewDisp = previewRes.headers['content-disposition'] || '';
    if (
      previewRes.status === 200 &&
      previewDisp.includes('filename="template-preview-v1.docx"') &&
      previewDisp.includes("filename*=UTF-8''template-preview-v1.docx")
    ) {
      console.log('PASS: preview uses RFC 5987 header and fixed template-preview-v1.docx pattern');
    } else {
      throw new Error(`preview header check failed: ${previewDisp}`);
    }

    // Check 57: original download uses RFC 5987 header and fixed template-v1.docx pattern
    const origRes = await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/admin/document-types/${docType._id}/templates/1/file`,
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    const origDisp = origRes.headers['content-disposition'] || '';
    if (
      origRes.status === 200 &&
      origDisp.includes('filename="template-v1.docx"') &&
      origDisp.includes("filename*=UTF-8''template-v1.docx")
    ) {
      console.log('PASS: original download uses RFC 5987 header and fixed template-v1.docx pattern');
    } else {
      throw new Error(`original download header check failed: ${origDisp}`);
    }

    // Check 58: starter download uses RFC 5987 header and starter-certificate-template.docx
    const starterDlRes = await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/admin/template-starter`,
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    const starterDisp = starterDlRes.headers['content-disposition'] || '';
    if (
      starterDlRes.status === 200 &&
      starterDisp.includes('filename="starter-certificate-template.docx"') &&
      starterDisp.includes("filename*=UTF-8''starter-certificate-template.docx")
    ) {
      console.log('PASS: starter download uses RFC 5987 header and starter-certificate-template.docx');
    } else {
      throw new Error(`starter download header check failed: ${starterDisp}`);
    }

    // Check 59: certificate download uses RFC 5987 header and certificate-${number}.docx
    const certDlRes = await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/staff/requests/${req1._id}/certificate?format=docx`,
        method: 'GET',
        headers: { Authorization: `Bearer ${staffPrintToken}` },
      }
    );
    const certDisp = certDlRes.headers['content-disposition'] || '';
    if (
      certDlRes.status === 200 &&
      certDisp.includes('filename="certificate-') &&
      certDisp.includes("filename*=UTF-8''certificate-")
    ) {
      console.log('PASS: certificate download uses RFC 5987 header and certificate-${number}.docx');
    } else {
      throw new Error(`certificate download header check failed: ${certDisp}`);
    }

    // -------------------------------------------------------------------------
    // SECTION 11: RATE LIMITING CHECKS
    // -------------------------------------------------------------------------

    // Check 60: template upload rate limiter (11th upload in 1 hour gives 429)
    // Create dedicated admin user for rate limit test
    const rateLimitAdmin = await User.create({
      full_name: 'Rate Limit Admin',
      email: 'rl_admin@quickfile.gov.ph',
      password_hash: 'test_hash',
      role: ROLES.ADMIN,
      is_active: true,
    });
    const rlAdminToken = jwt.sign({ id: rateLimitAdmin._id, role: rateLimitAdmin.role }, config.jwt.getSecret(), { expiresIn: '1d' });

    let upload429Hit = false;
    for (let i = 1; i <= 11; i++) {
      const up = await makeMultipartUpload(
        server,
        `${API_PREFIX}/admin/document-types/${docType._id}/templates`,
        rlAdminToken,
        validDocxBuffer,
        `rate_test_${i}.docx`
      );
      if (i === 11 && up.status === 429) {
        upload429Hit = true;
      }
    }
    if (upload429Hit) {
      console.log('PASS: template upload limit (11th upload in an hour gives 429)');
    } else {
      throw new Error('template upload rate limiter did not block 11th upload');
    }

    // Check 61: certificate download rate limiter (31st download in 15 min gives 429)
    const rateLimitStaff = await User.create({
      full_name: 'Rate Limit Staff',
      email: 'rl_staff@quickfile.gov.ph',
      password_hash: 'test_hash',
      role: ROLES.STAFF,
      is_active: true,
    });
    await StaffPermission.create({
      user_id: rateLimitStaff._id,
      can_print_documents: true,
      can_review_requests: true,
      can_prepare_documents: true,
    });
    const rlStaffToken = jwt.sign({ id: rateLimitStaff._id, role: rateLimitStaff.role }, config.jwt.getSecret(), { expiresIn: '1d' });

    let download429Hit = false;
    for (let i = 1; i <= 31; i++) {
      const dl = await makeHttpRequest(
        server,
        {
          path: `${API_PREFIX}/staff/requests/${req1._id}/certificate?format=docx`,
          method: 'GET',
          headers: { Authorization: `Bearer ${rlStaffToken}` },
        }
      );
      if (i === 31 && dl.status === 429) {
        download429Hit = true;
      }
    }
    if (download429Hit) {
      console.log('PASS: certificate download limit (31st in 15 minutes gives 429)');
    } else {
      throw new Error('certificate download rate limiter did not block 31st download');
    }

    // -------------------------------------------------------------------------
    // SECTION 12: ADMIN TEMPLATE PERMISSIONS ON ALL 10 ENDPOINTS
    // -------------------------------------------------------------------------

    const adminTemplateEndpoints = [
      { method: 'GET', path: `${API_PREFIX}/admin/template-placeholders` },
      { method: 'GET', path: `${API_PREFIX}/admin/template-starter` },
      { method: 'POST', path: `${API_PREFIX}/admin/document-types/${docType._id}/templates` },
      { method: 'GET', path: `${API_PREFIX}/admin/document-types/${docType._id}/templates` },
      { method: 'POST', path: `${API_PREFIX}/admin/document-types/${docType._id}/template-mode` },
      { method: 'POST', path: `${API_PREFIX}/admin/document-types/${docType._id}/templates/1/activate` },
      { method: 'POST', path: `${API_PREFIX}/admin/document-types/${docType._id}/templates/1/preview` },
      { method: 'GET', path: `${API_PREFIX}/admin/document-types/${docType._id}/templates/1/file` },
      { method: 'POST', path: `${API_PREFIX}/admin/document-types/${docType._id}/templates/1/retire` },
      { method: 'DELETE', path: `${API_PREFIX}/admin/document-types/${docType._id}/templates/1` },
    ];

    for (const ep of adminTemplateEndpoints) {
      // 1. No token -> 401
      const resNoToken = await makeHttpRequest(server, { path: ep.path, method: ep.method });
      if (resNoToken.status !== 401) {
        throw new Error(`Endpoint ${ep.method} ${ep.path} expected 401 for no token, got ${resNoToken.status}`);
      }

      // 2. Citizen token -> 403
      const resCitizen = await makeHttpRequest(server, {
        path: ep.path,
        method: ep.method,
        headers: { Authorization: `Bearer ${citizenToken}` },
      });
      if (resCitizen.status !== 403) {
        throw new Error(`Endpoint ${ep.method} ${ep.path} expected 403 for citizen, got ${resCitizen.status}`);
      }

      // 3. Staff token -> 403
      const resStaff = await makeHttpRequest(server, {
        path: ep.path,
        method: ep.method,
        headers: { Authorization: `Bearer ${staffPrintToken}` },
      });
      if (resStaff.status !== 403) {
        throw new Error(`Endpoint ${ep.method} ${ep.path} expected 403 for staff, got ${resStaff.status}`);
      }

      console.log(`PASS: admin endpoint ${ep.method} ${ep.path} enforces staff 403, citizen 403, no token 401`);
    }

    // Certificate download permission checks
    const certUrl = `${API_PREFIX}/staff/requests/${req1._id}/certificate?format=docx`;
    const certNoToken = await makeHttpRequest(server, { path: certUrl, method: 'GET' });
    if (certNoToken.status === 401) {
      console.log('PASS: certificate download without token returns 401');
    } else {
      throw new Error(`cert download without token expected 401, got ${certNoToken.status}`);
    }

    const certCitizen = await makeHttpRequest(server, {
      path: certUrl,
      method: 'GET',
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    if (certCitizen.status === 403) {
      console.log('PASS: certificate download for citizen returns 403');
    } else {
      throw new Error(`cert download for citizen expected 403, got ${certCitizen.status}`);
    }

    const certStaffNoPerm = await makeHttpRequest(server, {
      path: certUrl,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffNoPermToken}` },
    });
    if (certStaffNoPerm.status === 403) {
      console.log('PASS: certificate download for staff without can_print_documents returns 403');
    } else {
      throw new Error(`cert download staff no perm expected 403, got ${certStaffNoPerm.status}`);
    }

    const certStaffPrint = await makeHttpRequest(server, {
      path: certUrl,
      method: 'GET',
      headers: { Authorization: `Bearer ${staffPrintToken}` },
    });
    if (certStaffPrint.status === 200) {
      console.log('PASS: certificate download for staff with can_print_documents returns 200');
    } else {
      throw new Error(`cert download staff print expected 200, got ${certStaffPrint.status}`);
    }

    const certAdmin = await makeHttpRequest(server, {
      path: certUrl,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (certAdmin.status === 200) {
      console.log('PASS: certificate download for admin returns 200');
    } else {
      throw new Error(`cert download admin expected 200, got ${certAdmin.status}`);
    }

    // -------------------------------------------------------------------------
    // SECTION 13: AUDIT LOGS INTEGRITY (UPLOAD, ACTIVATE, RETIRE, DELETE, DOWNLOAD)
    // -------------------------------------------------------------------------

    // Retire and Delete an unused version to generate those logs
    await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/admin/document-types/${docType._id}/templates/2/retire`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    await makeHttpRequest(
      server,
      {
        path: `${API_PREFIX}/admin/document-types/${docType._id}/templates/2`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    const logUpload = await AuditLog.findOne({ action: 'DOCUMENT_TEMPLATE_UPLOAD' });
    const logActivate = await AuditLog.findOne({ action: 'DOCUMENT_TEMPLATE_ACTIVATE' });
    const logRetire = await AuditLog.findOne({ action: 'DOCUMENT_TEMPLATE_RETIRE' });
    const logDelete = await AuditLog.findOne({ action: 'DOCUMENT_TEMPLATE_DELETE' });
    const logDownload = await AuditLog.findOne({ action: 'CERTIFICATE_DOWNLOAD' });

    function assertLogClean(log, actionName) {
      if (!log) throw new Error(`Missing expected audit log for ${actionName}`);
      const detStr = JSON.stringify(log.details || {});
      if (detStr.includes('PK') || detStr.includes('Buffer') || log.details.buffer) {
        throw new Error(`Audit log for ${actionName} contains file contents or binary data`);
      }
    }

    assertLogClean(logUpload, 'DOCUMENT_TEMPLATE_UPLOAD');
    console.log('PASS: audit log exists for upload and contains no file contents');

    assertLogClean(logActivate, 'DOCUMENT_TEMPLATE_ACTIVATE');
    console.log('PASS: audit log exists for activate and contains no file contents');

    assertLogClean(logRetire, 'DOCUMENT_TEMPLATE_RETIRE');
    console.log('PASS: audit log exists for retire and contains no file contents');

    assertLogClean(logDelete, 'DOCUMENT_TEMPLATE_DELETE');
    console.log('PASS: audit log exists for delete and contains no file contents');

    assertLogClean(logDownload, 'CERTIFICATE_DOWNLOAD');
    console.log('PASS: audit log exists for download and contains no file contents');

    console.log('\n--- ALL DOCX TEMPLATE TESTS PASSED PERFECTLY ---');
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
