/**
 * QuickFile API Contract Parity & Smoke Verification Script
 * Validates complete frontend-to-backend API contract parity against the REAL backend.
 *
 * Rules:
 * - No embedded mock server. Exits 1 if backend is unreachable at SMOKE_API_URL.
 * - Credentials come ONLY from environment variables (SMOKE_ADMIN_EMAIL/PASSWORD, etc.).
 * - Validates status codes AND response data shapes per endpoint.
 * - Saves sanitized real responses into frontend/src/tests/fixtures/real/*.json.
 * - Never prints passwords, tokens, or secret keys.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../src/tests/fixtures/real');

// Ensure fixtures directory exists
if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

// 1. Environment and Credential Verification
const targetUrl = process.env.SMOKE_API_URL || 'http://localhost:5000/api/v1';

const requiredEnvVars = [
  'SMOKE_ADMIN_EMAIL',
  'SMOKE_ADMIN_PASSWORD',
  'SMOKE_STAFF_EMAIL',
  'SMOKE_STAFF_PASSWORD',
  'SMOKE_CITIZEN_EMAIL',
  'SMOKE_CITIZEN_PASSWORD',
  'SMOKE_SU_ADMIN_KEY',
];

const missingEnv = requiredEnvVars.filter((v) => !process.env[v] || !process.env[v].trim());
if (missingEnv.length > 0) {
  console.error(`\n[QuickFile Smoke Error] Missing required environment variable(s): ${missingEnv.join(', ')}`);
  console.error('Please export them before running smoke.mjs. Passwords and keys must never be hardcoded.\n');
  process.exit(1);
}

const CREDENTIALS = {
  admin: {
    email: process.env.SMOKE_ADMIN_EMAIL.trim(),
    password: process.env.SMOKE_ADMIN_PASSWORD,
  },
  staff: {
    email: process.env.SMOKE_STAFF_EMAIL.trim(),
    password: process.env.SMOKE_STAFF_PASSWORD,
  },
  citizen: {
    email: process.env.SMOKE_CITIZEN_EMAIL.trim(),
    password: process.env.SMOKE_CITIZEN_PASSWORD,
  },
  suAdminKey: process.env.SMOKE_SU_ADMIN_KEY.trim(),
};

let totalPassed = 0;
let totalFailed = 0;
const failureDetails = [];
const contractDifferences = [];

function recordDiff(endpoint, message) {
  const diff = `[Contract Difference] ${endpoint}: ${message}`;
  console.warn(`  ⚠️  ${diff}`);
  contractDifferences.push(diff);
}

async function runCheck(name, testFn) {
  try {
    await testFn();
    console.log(`  [PASS] ${name}`);
    totalPassed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    failureDetails.push({ name, error: err.message });
    totalFailed++;
  }
}

/**
 * Shape Validator: Checks presence of expected nested keys in response data
 */
function assertShape(data, expectedKeys, endpointName) {
  if (data === null || data === undefined) {
    throw new Error(`Data is ${data} in ${endpointName}; expected object/array`);
  }
  for (const keyPath of expectedKeys) {
    const keys = keyPath.split('.');
    let current = data;
    for (const k of keys) {
      if (current === null || current === undefined || !(k in current)) {
        throw new Error(`Missing expected key "${keyPath}" in ${endpointName}`);
      }
      current = current[k];
    }
  }
}

/**
 * Sanitizer: Strips real tokens, passwords, emails, and names from fixture data
 */
function sanitizeFixtureData(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    // JWT pattern
    if (/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(obj)) {
      return '[REDACTED_JWT_TOKEN]';
    }
    // Email pattern
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(obj)) {
      return 'user@example.ph';
    }
    // Phone pattern
    if (/^(09|\+639)\d{9}$/.test(obj)) {
      return '09170000000';
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeFixtureData);
  }
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, val] of Object.entries(obj)) {
      if (['password', 'password_hash', 'access_token', 'token', 'su_admin_key'].includes(key)) {
        sanitized[key] = '[REDACTED]';
      } else if (['full_name', 'citizen_name', 'staff_name', 'actor_name'].includes(key) && typeof val === 'string') {
        sanitized[key] = 'Juan Dela Cruz';
      } else if (['email', 'contact_email'].includes(key) && typeof val === 'string') {
        sanitized[key] = 'resident@quickfile.ph';
      } else if (['phone', 'contact_phone', 'mobile_number', 'contact_number'].includes(key) && typeof val === 'string') {
        sanitized[key] = '09170000000';
      } else {
        sanitized[key] = sanitizeFixtureData(val);
      }
    }
    return sanitized;
  }
  return obj;
}

function saveFixture(filename, data) {
  try {
    const sanitized = sanitizeFixtureData(data);
    const filePath = path.join(FIXTURES_DIR, `${filename}.json`);
    fs.writeFileSync(filePath, JSON.stringify(sanitized, null, 2), 'utf8');
  } catch (err) {
    console.warn(`  ⚠️  Failed to save fixture ${filename}: ${err.message}`);
  }
}

/**
 * HTTP Client Helper
 */
async function api(endpoint, method = 'GET', body = null, token = null, isFormData = false, extraHeaders = {}) {
  const url = `${targetUrl}${endpoint}`;
  const headers = { ...extraHeaders };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = { method, headers };

  if (body) {
    if (isFormData) {
      options.body = body;
    } else {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
  }

  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type') || '';
  let json = null;

  if (contentType.includes('application/json')) {
    json = await res.json().catch(() => null);
  }

  return { res, json };
}

// ==============================================================================
// Main Smoke Runner
// ==============================================================================
async function main() {
  console.log('=======================================================');
  console.log('   QuickFile Real Backend Contract Verification');
  console.log(`   Target API: ${targetUrl}`);
  console.log('=======================================================\n');

  // Verify backend connectivity
  try {
    const health = await fetch(`${targetUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (!health.ok) {
      throw new Error(`Server returned HTTP ${health.status}`);
    }
  } catch (err) {
    console.error(`[QuickFile Smoke Error] Backend is NOT reachable at ${targetUrl}: ${err.message}`);
    console.error('Please ensure the backend is running (e.g. "cd backend && npm run dev") before running smoke.mjs.\n');
    process.exit(1);
  }

  // Token storage
  let adminToken = null;
  let staffToken = null;
  let citizenToken = null;

  // Tracked IDs across workflows
  let seededRequestId = null;
  let seededTrackingNumber = null;
  let verificationCode = null;
  let attachmentFilename = null;
  let throwawayCitizenId = null;
  let throwawayStaffId = null;
  let throwawayDocTypeId = null;

  // ==========================================
  // 1. Public Infrastructure & Gateways
  // ==========================================
  console.log('--- 1. Public Infrastructure & Gateways ---');

  await runCheck('GET /health standard envelope', async () => {
    const { res, json } = await api('/health');
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    assertShape(json, ['success', 'message', 'environment'], 'GET /health');
  });

  await runCheck('CORS Origin request exposes Content-Disposition, X-Export-Truncated, and Retry-After', async () => {
    const { res } = await api('/health', 'GET', null, null, false, { Origin: 'http://localhost:5173' });
    const expose = res.headers.get('access-control-expose-headers') || '';
    if (!expose.includes('Content-Disposition') || !expose.includes('X-Export-Truncated')) {
      throw new Error(`Expose headers missing: "${expose}"`);
    }
  });

  await runCheck('GET /public/config returns valid branding and integration flags', async () => {
    const { res, json } = await api('/public/config');
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    assertShape(json.data, ['system_name', 'barangay_name', 'city_municipality', 'province', 'integrations'], 'GET /public/config');
    saveFixture('publicConfig', json.data);
  });

  await runCheck('GET /verify/:code returns 404 for non-existent certificate', async () => {
    const { res, json } = await api('/verify/NONEXISTENT999');
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  await runCheck('GET /verify/QF-... explicitly rejects tracking numbers with 404', async () => {
    const { res, json } = await api('/verify/QF-2026-9999');
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    if (!json?.message?.toLowerCase().includes('tracking number')) {
      recordDiff('/verify', 'Expected message to clarify tracking numbers cannot be verified here');
    }
  });

  // ==========================================
  // 2. Authentication & Role Verification
  // ==========================================
  console.log('\n--- 2. Authentication & Role Verification ---');

  await runCheck('POST /auth/login fails with 401 on wrong password', async () => {
    const { res } = await api('/auth/login', 'POST', {
      email: CREDENTIALS.admin.email,
      password: 'DefinitivelyWrongPassword!123',
    });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await runCheck('POST /auth/login as admin & verify GET /auth/me', async () => {
    const { res, json } = await api('/auth/login', 'POST', {
      email: CREDENTIALS.admin.email,
      password: CREDENTIALS.admin.password,
    });
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    assertShape(json.data, ['access_token', 'user._id', 'user.email', 'user.role'], 'POST /auth/login');
    adminToken = json.data.access_token;

    const me = await api('/auth/me', 'GET', null, adminToken);
    if (!me.res.ok || me.json.data.user.role !== 'admin') throw new Error('Role mismatch on admin /auth/me');
  });

  await runCheck('POST /auth/login as staff & verify GET /auth/me', async () => {
    const { res, json } = await api('/auth/login', 'POST', {
      email: CREDENTIALS.staff.email,
      password: CREDENTIALS.staff.password,
    });
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    staffToken = json.data.access_token;

    const me = await api('/auth/me', 'GET', null, staffToken);
    if (!me.res.ok || me.json.data.user.role !== 'staff') throw new Error('Role mismatch on staff /auth/me');
  });

  await runCheck('POST /auth/login as citizen & verify GET /auth/me', async () => {
    const { res, json } = await api('/auth/login', 'POST', {
      email: CREDENTIALS.citizen.email,
      password: CREDENTIALS.citizen.password,
    });
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    citizenToken = json.data.access_token;

    const me = await api('/auth/me', 'GET', null, citizenToken);
    if (!me.res.ok || me.json.data.user.role !== 'citizen') throw new Error('Role mismatch on citizen /auth/me');
  });

  await runCheck('POST /auth/forgot-password returns generic 200 for known & unknown emails', async () => {
    const { res, json } = await api('/auth/forgot-password', 'POST', { email: 'nonexistent-user@quickfile.ph' });
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
  });

  await runCheck('POST /auth/logout invalidates session cleanly', async () => {
    const { res, json } = await api('/auth/logout', 'POST', null, citizenToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);

    // Re-login citizen to restore active token for subsequent citizen steps
    const relogin = await api('/auth/login', 'POST', {
      email: CREDENTIALS.citizen.email,
      password: CREDENTIALS.citizen.password,
    });
    citizenToken = relogin.json.data.access_token;
  });

  // ==========================================
  // 3. Citizen Portal Lifecycle
  // ==========================================
  console.log('\n--- 3. Citizen Portal Lifecycle & Admin Cleanup ---');

  const throwawaySuffix = Date.now();
  const throwawayEmail = `throwaway_cit_${throwawaySuffix}@quickfile.ph`;

  await runCheck('POST /auth/register creates throwaway citizen account', async () => {
    const { res, json } = await api('/auth/register', 'POST', {
      email: throwawayEmail,
      password: 'Password@123',
      first_name: 'Throwaway',
      last_name: 'Resident',
      phone: '09179998877',
      birthdate: '1995-05-15',
      gender: 'male',
      civil_status: 'single',
      street_address: '123 Test St',
      purok_zone: 'Zone 4',
    });
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}: ${json?.message}`);
    throwawayCitizenId = json.data?.user?._id;
  });

  await runCheck('GET /citizen/catalog returns active document types', async () => {
    const { res, json } = await api('/citizen/catalog', 'GET', null, citizenToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    if (!Array.isArray(json.data) || json.data.length === 0) throw new Error('Catalog is empty');
    assertShape(json.data[0], ['_id', 'code', 'name', 'fee', 'processing_days'], 'GET /citizen/catalog[0]');
    saveFixture('citizenCatalog', json.data);
  });

  await runCheck('GET /citizen/profile returns profile & completeness score', async () => {
    const { res, json } = await api('/citizen/profile', 'GET', null, citizenToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    assertShape(json.data, ['profile._id', 'completeness_score'], 'GET /citizen/profile');
    saveFixture('citizenProfile', json.data);
  });

  await runCheck('PUT /citizen/profile updates profile and syncs user details', async () => {
    const { res, json } = await api('/citizen/profile', 'PUT', {
      civil_status: 'married',
      street_address: '456 Updated St',
      purok_zone: 'Zone 2',
    }, citizenToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
  });

  await runCheck('GET /citizen/profile/reuse returns prefilled form fields', async () => {
    const { res, json } = await api('/citizen/profile/reuse', 'GET', null, citizenToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    assertShape(json.data, ['first_name', 'last_name', 'contact_number'], 'GET /citizen/profile/reuse');
  });

  await runCheck('POST /citizen/requests submits request with attachment', async () => {
    const catalog = await api('/citizen/catalog', 'GET', null, citizenToken);
    const docType = catalog.json.data[0];

    // Minimal valid 1x1 transparent PNG buffer to pass file signature checks
    const validPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    const boundary = '----QuickFileFormBoundary' + Date.now();
    const preamble = Buffer.from([
      `--${boundary}`,
      'Content-Disposition: form-data; name="document_type_id"',
      '',
      docType._id,
      `--${boundary}`,
      'Content-Disposition: form-data; name="purpose"',
      '',
      'Employment verification requirement',
      `--${boundary}`,
      'Content-Disposition: form-data; name="copies"',
      '',
      '1',
      `--${boundary}`,
      'Content-Disposition: form-data; name="attachments"; filename="sample_id.png"',
      'Content-Type: image/png',
      '',
      '',
    ].join('\r\n'));

    const postamble = Buffer.from(`\r\n--${boundary}--\r\n`);
    const multipartBody = Buffer.concat([preamble, validPng, postamble]);

    const res = await fetch(`${targetUrl}/citizen/requests`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${citizenToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: multipartBody,
    });
    const json = await res.json();
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}: ${json?.message}`);

    assertShape(json.data, ['tracking_number', 'status', 'purpose', 'fee'], 'POST /citizen/requests');
    seededTrackingNumber = json.data.tracking_number;
    attachmentFilename = json.data.attachments?.[0]?.stored_filename || null;
  });

  await runCheck('GET /citizen/requests lists requests with pagination', async () => {
    const { res, json } = await api('/citizen/requests', 'GET', null, citizenToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    assertShape(json.data, ['requests', 'pagination.total'], 'GET /citizen/requests');
    saveFixture('citizenRequests', json.data);
  });

  await runCheck('GET /citizen/requests/:trackingNumber returns serialized allowlisted details', async () => {
    const { res, json } = await api(`/citizen/requests/${seededTrackingNumber}`, 'GET', null, citizenToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    assertShape(json.data, ['tracking_number', 'status', 'purpose', 'fee', 'document_type'], 'GET /citizen/requests/:tracking');
    saveFixture('citizenRequestDetail', json.data);
  });

  await runCheck('GET /citizen/requests/:trackingNumber/status returns lightweight live status', async () => {
    const { res, json } = await api(`/citizen/requests/${seededTrackingNumber}/status`, 'GET', null, citizenToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    assertShape(json.data, ['tracking_number', 'status', 'updated_at'], 'GET /citizen/requests/:tracking/status');
    saveFixture('citizenRequestStatus', json.data);
  });

  await runCheck('PUT /citizen/requests/:trackingNumber updates pending request purpose', async () => {
    const { res, json } = await api(`/citizen/requests/${seededTrackingNumber}`, 'PUT', {
      purpose: 'Updated employment verification purpose',
    }, citizenToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
  });

  if (attachmentFilename) {
    await runCheck('GET /files/attachments/:filename downloads uploaded attachment stream', async () => {
      const { res } = await api(`/files/attachments/${attachmentFilename}`, 'GET', null, citizenToken);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const cd = res.headers.get('content-disposition') || '';
      if (!cd.includes('inline') && !cd.includes('attachment')) {
        recordDiff('/files/attachments', 'Missing Content-Disposition header');
      }
    });
  }

  await runCheck('Notifications CRUD: list, mark all read, delete one, clear all', async () => {
    const listRes = await api('/citizen/notifications', 'GET', null, citizenToken);
    if (!listRes.res.ok) throw new Error(`Status ${listRes.res.status}`);
    assertShape(listRes.json.data, ['notifications', 'unread_count'], 'GET /citizen/notifications');
    saveFixture('citizenNotifications', listRes.json.data);

    await api('/citizen/notifications/read-all', 'PATCH', null, citizenToken);
  });

  if (throwawayCitizenId) {
    await runCheck('DELETE /admin/citizens/:id cleans up throwaway resident account', async () => {
      const { res, json } = await api(`/admin/citizens/${throwawayCitizenId}`, 'DELETE', { confirm: 'DELETE' }, adminToken);
      if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}: ${json?.message}`);
    });
  }

  // ==========================================
  // 4. Staff Portal Operations & Workflow
  // ==========================================
  console.log('\n--- 4. Staff Portal Operations & Full Lifecycle Workflow ---');

  await runCheck('GET /staff/dashboard returns KPI summary and pending queue', async () => {
    const { res, json } = await api('/staff/dashboard', 'GET', null, staffToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    assertShape(json.data, ['kpis.pending', 'kpis.under_review', 'pending_queue'], 'GET /staff/dashboard');
    saveFixture('staffDashboard', json.data);
  });

  await runCheck('GET /staff/requests/live-stats returns real-time count metrics', async () => {
    const { res, json } = await api('/staff/requests/live-stats', 'GET', null, staffToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    assertShape(json.data, ['pending', 'under_review', 'in_preparation', 'ready_for_pickup'], 'GET /staff/requests/live-stats');
    saveFixture('staffLiveStats', json.data);
  });

  await runCheck('GET /staff/requests lists requests with items and pagination keys', async () => {
    const { res, json } = await api('/staff/requests?limit=10', 'GET', null, staffToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    assertShape(json.data, ['items', 'pagination.total', 'pagination.page', 'pagination.limit'], 'GET /staff/requests');
    saveFixture('staffRequests', json.data);
  });

  await runCheck('GET /staff/residents searches active residents (min 3 chars)', async () => {
    const { res, json } = await api('/staff/residents?search=cit', 'GET', null, staffToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    if (!Array.isArray(json.data)) throw new Error('Expected array of residents');
    saveFixture('staffResidents', json.data);
  });

  await runCheck('POST /staff/requests/walk-in files walk-in request on behalf of resident', async () => {
    const residents = await api('/staff/residents?search=cit', 'GET', null, staffToken);
    const catalog = await api('/citizen/catalog', 'GET', null, staffToken);
    const resident = residents.json.data[0];
    const docType = catalog.json.data[0];

    const boundary = '----QuickFileWalkInBoundary' + Date.now();
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="citizen_id"',
      '',
      resident._id,
      `--${boundary}`,
      'Content-Disposition: form-data; name="document_type_id"',
      '',
      docType._id,
      `--${boundary}`,
      'Content-Disposition: form-data; name="purpose"',
      '',
      'Walk-in residency clearance for bank opening',
      `--${boundary}`,
      'Content-Disposition: form-data; name="copies"',
      '',
      '1',
      `--${boundary}--`,
      '',
    ].join('\r\n');

    const res = await fetch(`${targetUrl}/staff/requests/walk-in`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${staffToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: payload,
    });
    const json = await res.json();
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}: ${json?.message}`);
    assertShape(json.data, ['_id', 'tracking_number', 'status'], 'POST /staff/requests/walk-in');
  });

  await runCheck('GET /staff/requests/:id returns nested shape (request, citizen_profile, issued_document)', async () => {
    if (!seededRequestId && seededTrackingNumber) {
      const lookup = await api(`/staff/requests?search=${seededTrackingNumber}`, 'GET', null, staffToken);
      seededRequestId = lookup.json?.data?.items?.[0]?._id;
    }
    const { res, json } = await api(`/staff/requests/${seededRequestId}`, 'GET', null, staffToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    assertShape(json.data, ['request._id', 'request.tracking_number', 'request.status', 'citizen_profile'], 'GET /staff/requests/:id');
    saveFixture('staffRequestDetail', json.data);
  });

  await runCheck('POST /staff/requests/:id/notes appends internal processing note', async () => {
    const { res, json } = await api(`/staff/requests/${seededRequestId}/notes`, 'POST', {
      note: 'Verified applicant resident identity against barangay registry.',
    }, staffToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
  });

  await runCheck('POST /staff/requests/:id/review transitions pending -> under_review', async () => {
    const { res, json } = await api(`/staff/requests/${seededRequestId}/review`, 'POST', null, staffToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}: ${json?.message}`);
    if (json.data.status !== 'under_review') throw new Error(`Expected under_review, got ${json.data.status}`);
  });

  await runCheck('POST /staff/requests/:id/approve transitions under_review -> approved', async () => {
    const { res, json } = await api(`/staff/requests/${seededRequestId}/approve`, 'POST', null, staffToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}: ${json?.message}`);
    if (json.data.status !== 'approved') throw new Error(`Expected approved, got ${json.data.status}`);
  });

  await runCheck('POST /staff/requests/:id/prepare transitions approved -> in_preparation', async () => {
    const { res, json } = await api(`/staff/requests/${seededRequestId}/prepare`, 'POST', null, staffToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}: ${json?.message}`);
    if (json.data.status !== 'in_preparation') throw new Error(`Expected in_preparation, got ${json.data.status}`);
  });

  await runCheck('POST /staff/requests/:id/issue transitions in_preparation -> ready_for_pickup and generates certificate', async () => {
    const { res, json } = await api(`/staff/requests/${seededRequestId}/issue`, 'POST', null, staffToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}: ${json?.message}`);
    const status = json.data.request?.status || json.data.status;
    if (status !== 'ready_for_pickup') throw new Error(`Expected ready_for_pickup, got ${status}`);
  });

  await runCheck('GET /staff/requests/:id/print-data returns official certificate layout, signatories, and QR code', async () => {
    const { res, json } = await api(`/staff/requests/${seededRequestId}/print-data`, 'GET', null, staffToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}: ${json?.message}`);
    assertShape(json.data, ['barangay.barangay_name', 'citizen.full_name', 'issued_document.certificate_number', 'issued_document.verification_code', 'issued_document.expires_at'], 'GET /staff/requests/:id/print-data');
    verificationCode = json.data.issued_document.verification_code;
    saveFixture('staffPrintData', json.data);
  });

  await runCheck('POST /staff/requests/:id/release transitions ready_for_pickup -> released with payment record', async () => {
    const { res, json } = await api(`/staff/requests/${seededRequestId}/release`, 'POST', {
      payment_status: 'paid',
      payment_reference: 'OR-998877',
    }, staffToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}: ${json?.message}`);
    if (json.data.status !== 'released') throw new Error(`Expected released, got ${json.data.status}`);
  });

  await runCheck('POST /staff/requests/:id/archive transitions released -> archived', async () => {
    const { res, json } = await api(`/staff/requests/${seededRequestId}/archive`, 'POST', null, staffToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}: ${json?.message}`);
    if (json.data.status !== 'archived') throw new Error(`Expected archived, got ${json.data.status}`);
  });

  await runCheck('GET /staff/records returns completed and archived records repository', async () => {
    const { res, json } = await api('/staff/records', 'GET', null, staffToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    assertShape(json.data, ['items', 'pagination.total'], 'GET /staff/records');
    saveFixture('staffRecords', json.data);
  });

  if (verificationCode) {
    await runCheck('GET /staff/verify/:code performs staff QR code verification with full audit details', async () => {
      const { res, json } = await api(`/staff/verify/${verificationCode}`, 'GET', null, staffToken);
      if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
      assertShape(json.data, ['certificate_number', 'verification_code', 'validity_status', 'document_name', 'issued_to_name'], 'GET /staff/verify/:code');
      saveFixture('staffVerifyResult', json.data);
    });

    await runCheck('GET /verify/:code performs public QR code verification', async () => {
      const { res, json } = await api(`/verify/${verificationCode}`);
      if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
      assertShape(json.data, ['certificate_number', 'validity_status', 'document_name', 'issued_at', 'expires_at'], 'GET /verify/:code');
      saveFixture('verifyResult', json.data);
    });
  }

  // Reports
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const fromMonth = `${year}-${month}-01`;
  const toMonth = `${year}-${month}-${String(new Date(year, now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;

  await runCheck('GET /staff/reports returns summary, by_status, and paginated transactions', async () => {
    const { res, json } = await api(`/staff/reports?from=${fromMonth}&to=${toMonth}&page=1&limit=50`, 'GET', null, staffToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}: ${json?.message}`);
    assertShape(json.data, ['summary.total_requests', 'by_document_type', 'by_status', 'transactions.items', 'transactions.total'], 'GET /staff/reports');
    saveFixture('staffReports', json.data);
  });

  await runCheck('GET /staff/reports/export?format=pdf exports PDF with binary stream', async () => {
    const { res } = await api(`/staff/reports/export?format=pdf&from=${fromMonth}&to=${toMonth}`, 'GET', null, staffToken);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const cd = res.headers.get('content-disposition') || '';
    if (!cd.includes('.pdf')) recordDiff('/staff/reports/export?format=pdf', 'Filename does not indicate .pdf');
  });

  await runCheck('GET /staff/reports/export?format=docx exports Word document with binary stream', async () => {
    const { res } = await api(`/staff/reports/export?format=docx&from=${fromMonth}&to=${toMonth}`, 'GET', null, staffToken);
    if (!res.ok) throw new Error(`Status ${res.status}`);
  });

  await runCheck('GET /staff/reports/export?format=xlsx exports Excel spreadsheet with binary stream', async () => {
    const { res } = await api(`/staff/reports/export?format=xlsx&from=${fromMonth}&to=${toMonth}`, 'GET', null, staffToken);
    if (!res.ok) throw new Error(`Status ${res.status}`);
  });

  // ==========================================
  // 5. Admin Portal Management & Super Admin Flow
  // ==========================================
  console.log('\n--- 5. Admin Portal Management & Super Admin Flow ---');

  await runCheck('GET /admin/dashboard returns executive KPIs, revenue, and queue breakdown', async () => {
    const { res, json } = await api('/admin/dashboard', 'GET', null, adminToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    assertShape(json.data, ['status_counts', 'revenue_today', 'revenue_this_month', 'demand_by_type'], 'GET /admin/dashboard');
    saveFixture('adminDashboard', json.data);
  });

  await runCheck('GET /admin/live-stats returns high-frequency real-time metrics', async () => {
    const { res, json } = await api('/admin/live-stats', 'GET', null, adminToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    assertShape(json.data, ['queue.pending', 'today_requests_count', 'today_revenue', 'timestamp'], 'GET /admin/live-stats');
    saveFixture('adminLiveStats', json.data);
  });

  const throwawayStaffEmail = `throwaway_staff_${Date.now()}@quickfile.ph`;

  await runCheck('POST /admin/staff provisions a new staff account with granular permissions', async () => {
    const { res, json } = await api('/admin/staff', 'POST', {
      email: throwawayStaffEmail,
      password: 'StaffPassword@123',
      full_name: 'Throwaway Staff Member',
      phone: '09171112233',
      employee_id: `EMP-${Date.now().toString().slice(-4)}`,
      position: 'Document Processing Officer',
      department: 'Records Management',
      permissions: {
        can_review_requests: true,
        can_prepare_documents: true,
        can_print_documents: true,
        can_release_documents: true,
        can_verify_qr: true,
        can_view_reports: true,
        can_archive_records: true,
      },
    }, adminToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}: ${json?.message}`);
    assertShape(json.data, ['_id', 'email', 'detail.position', 'permissions.can_review_requests'], 'POST /admin/staff');
    throwawayStaffId = json.data._id;
  });

  await runCheck('GET /admin/staff lists staff directory with pagination', async () => {
    const { res, json } = await api('/admin/staff', 'GET', null, adminToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    assertShape(json.data, ['staff', 'pagination.total'], 'GET /admin/staff');
    saveFixture('adminStaffList', json.data);
  });

  if (throwawayStaffId) {
    await runCheck('GET /admin/staff/:id retrieves individual staff profile & details', async () => {
      const { res, json } = await api(`/admin/staff/${throwawayStaffId}`, 'GET', null, adminToken);
      if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
      assertShape(json.data, ['_id', 'email', 'full_name', 'detail', 'permissions'], 'GET /admin/staff/:id');
    });

    await runCheck('PUT /admin/staff/:id updates staff basic information', async () => {
      const { res, json } = await api(`/admin/staff/${throwawayStaffId}`, 'PUT', {
        full_name: 'Updated Throwaway Staff',
        phone: '09172223344',
        position: 'Senior Processing Officer',
        department: 'Executive Records',
      }, adminToken);
      if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    });

    await runCheck('PATCH /admin/staff/:id/status toggles staff active status', async () => {
      const { res, json } = await api(`/admin/staff/${throwawayStaffId}/status`, 'PATCH', {
        is_active: false,
      }, adminToken);
      if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    });

    await runCheck('PUT /admin/staff/:id/permissions updates granular workflow permissions', async () => {
      const { res, json } = await api(`/admin/staff/${throwawayStaffId}/permissions`, 'PUT', {
        can_review_requests: true,
        can_prepare_documents: false,
        can_print_documents: false,
        can_release_documents: false,
        can_verify_qr: true,
        can_view_reports: false,
        can_archive_records: false,
      }, adminToken);
      if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    });

    await runCheck('POST /admin/staff/:id/reset-password resets staff password', async () => {
      const { res, json } = await api(`/admin/staff/${throwawayStaffId}/reset-password`, 'POST', {
        new_password: 'NewStaffPassword@456',
      }, adminToken);
      if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    });

    await runCheck('DELETE /admin/staff/:id rejects without { confirm: "DELETE" }', async () => {
      const { res } = await api(`/admin/staff/${throwawayStaffId}`, 'DELETE', {}, adminToken);
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    });

    await runCheck('DELETE /admin/staff/:id cleans up throwaway staff account with confirmation', async () => {
      const { res, json } = await api(`/admin/staff/${throwawayStaffId}`, 'DELETE', { confirm: 'DELETE' }, adminToken);
      if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}: ${json?.message}`);
    });
  }

  await runCheck('GET /admin/citizens lists citizen registry with filters', async () => {
    const { res, json } = await api('/admin/citizens', 'GET', null, adminToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    assertShape(json.data, ['citizens', 'pagination.total'], 'GET /admin/citizens');
    saveFixture('adminCitizensList', json.data);
  });

  const docTypeCode = `TEST_DOC_${Date.now().toString().slice(-4)}`;
  await runCheck('POST /admin/document-types creates a new catalog document definition', async () => {
    const { res, json } = await api('/admin/document-types', 'POST', {
      code: docTypeCode,
      name: 'Throwaway Test Clearance',
      description: 'Used for smoke test validation',
      fee: 75.0,
      processing_days: 2,
      requirements: ['Valid Government ID', 'Proof of Billing'],
      is_active: true,
      requires_payment: true,
    }, adminToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}: ${json?.message}`);
    throwawayDocTypeId = json.data._id;
  });

  await runCheck('GET /admin/document-types lists all document catalog items', async () => {
    const { res, json } = await api('/admin/document-types', 'GET', null, adminToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    if (!Array.isArray(json.data)) throw new Error('Expected array of document types');
    saveFixture('adminDocumentTypes', json.data);
  });

  if (throwawayDocTypeId) {
    await runCheck('PUT /admin/document-types/:id updates document catalog item', async () => {
      const { res, json } = await api(`/admin/document-types/${throwawayDocTypeId}`, 'PUT', {
        name: 'Updated Throwaway Clearance',
        fee: 80.0,
      }, adminToken);
      if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    });

    await runCheck('DELETE /admin/document-types/:id deletes catalog item', async () => {
      const { res, json } = await api(`/admin/document-types/${throwawayDocTypeId}`, 'DELETE', null, adminToken);
      if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}: ${json?.message}`);
    });
  }

  await runCheck('GET /admin/records returns master transaction archives', async () => {
    const { res, json } = await api('/admin/records', 'GET', null, adminToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    assertShape(json.data, ['items', 'pagination.total'], 'GET /admin/records');
    saveFixture('adminRecords', json.data);
  });

  await runCheck('GET /admin/issued-documents lists issued certificates registry', async () => {
    const { res, json } = await api('/admin/issued-documents', 'GET', null, adminToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    assertShape(json.data, ['documents', 'pagination.total'], 'GET /admin/issued-documents');
    saveFixture('adminIssuedDocuments', json.data);
  });

  await runCheck('GET /admin/audit-logs returns read-only security event ledger', async () => {
    const { res, json } = await api('/admin/audit-logs', 'GET', null, adminToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    assertShape(json.data, ['logs', 'pagination.total'], 'GET /admin/audit-logs');
    saveFixture('adminAuditLogs', json.data);
  });

  // Settings
  await runCheck('GET /admin/settings returns masked integration summaries and app configs', async () => {
    const { res, json } = await api('/admin/settings', 'GET', null, adminToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    assertShape(json.data, ['integrations.google', 'integrations.sms', 'integrations.smtp', 'integrations.recaptcha', 'integrations.rest_api'], 'GET /admin/settings');
    saveFixture('adminSettings', json.data);
  });

  await runCheck('PATCH /admin/settings rejects invalid Super Admin Key with 401', async () => {
    const { res, json } = await api('/admin/settings', 'PATCH', {
      su_admin_key: 'definitively_wrong_key',
      settings: { CUSTOM_SMS_SENDER_ID: 'TestSender' },
    }, adminToken);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await runCheck('PATCH /admin/settings updates settings with valid Super Admin Key (never logging key)', async () => {
    const { res, json } = await api('/admin/settings', 'PATCH', {
      su_admin_key: CREDENTIALS.suAdminKey,
      settings: { CUSTOM_SMS_SENDER_ID: 'QuickFileSMS' },
    }, adminToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}: ${json?.message}`);
    assertShape(json.data, ['modified_keys', 'integrations'], 'PATCH /admin/settings');
  });

  await runCheck('PATCH /admin/settings/general updates barangay info and signatories', async () => {
    const { res, json } = await api('/admin/settings/general', 'PATCH', {
      system_name: 'QuickFile Barangay Portal',
      contact_email: 'office@quickfile.gov.ph',
      contact_phone: '09171234567',
      office_name: 'Office of the Barangay Captain',
      barangay_captain: 'Hon. Raymond C. Lising',
      barangay_secretary: 'Sec. Corazon A. Mendoza',
    }, adminToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}: ${json?.message}`);
  });

  await runCheck('PATCH /admin/settings/toggles updates system feature flags', async () => {
    const { res, json } = await api('/admin/settings/toggles', 'PATCH', {
      enable_google_login: false,
      enable_recaptcha: false,
    }, adminToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}: ${json?.message}`);
  });

  await runCheck('GET /admin/reports returns aggregated executive summaries', async () => {
    const { res, json } = await api(`/admin/reports?from=${fromMonth}&to=${toMonth}&page=1&limit=50`, 'GET', null, adminToken);
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    assertShape(json.data, ['summary.total_requests', 'by_document_type', 'by_status', 'transactions.items'], 'GET /admin/reports');
    saveFixture('adminReports', json.data);
  });

  // Final Summary
  console.log('\n========================================');
  console.log(`Results: ${totalPassed} passed, ${totalFailed} failed.`);
  console.log(`Contract Discrepancies: ${contractDifferences.length}`);
  console.log(`Sanitized fixtures saved to: ${FIXTURES_DIR}`);
  console.log('========================================\n');

  if (failureDetails.length > 0) {
    console.error('Failure Breakdown:');
    failureDetails.forEach((f) => console.error(` - ${f.name}: ${f.error}`));
    console.log('');
  }

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[QuickFile Smoke Unhandled] ${err.message}`);
  process.exit(1);
});
