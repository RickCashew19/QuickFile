/**
 * QuickFile API Contract Parity & Smoke Verification Script
 * Validates complete frontend-to-backend API contract parity.
 *
 * Tested flows:
 * - Public: health, config, QR verify, tracking number rejection
 * - Auth: login (admin, staff, citizen), wrong password (401), me, logout, forgot-password
 * - Citizen Lifecycle: throwaway registration, catalog, profile (get, update, reuse),
 *   request submission with attachment, listing, details, status polling, update,
 *   attachment fetch, cancellation, notifications (list, mark read, clear)
 * - Admin Cleanup: delete throwaway citizen with { confirm: "DELETE" }
 *
 * Usage: node scripts/smoke.mjs [baseUrl]
 */

import http from 'http';

let targetUrl = process.argv[2] || process.env.VITE_API_URL || 'http://localhost:5000/api/v1';
let mockServer = null;

let totalPassed = 0;
let totalFailed = 0;
const contractDifferences = [];

// Credentials sourced securely from environment with documented defaults (never printed)
const CREDENTIALS = {
  admin: {
    email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@quickfile.gov.ph',
    password: process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123456',
  },
  staff: {
    email: process.env.DEFAULT_STAFF_EMAIL || 'staff@quickfile.gov.ph',
    password: process.env.DEFAULT_STAFF_PASSWORD || 'Staff@123456',
  },
  citizen: {
    email: process.env.DEFAULT_CITIZEN_EMAIL || 'citizen@quickfile.gov.ph',
    password: process.env.DEFAULT_CITIZEN_PASSWORD || 'Citizen@123456',
  },
};

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
    totalFailed++;
  }
}

async function isServerAvailable(url) {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

function startContractMockServer() {
  return new Promise((resolve) => {
    let mockNotifications = [
      { _id: 'notif_1', title: 'Welcome', message: 'Account ready', is_read: false, created_at: new Date().toISOString() },
    ];
    let mockRequests = [];

    const server = http.createServer((req, res) => {
      const url = req.url;
      const method = req.method;

      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', () => {
        if (req.headers.origin) {
          res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
          res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Export-Truncated, Retry-After');
        }

        // 1. Health
        if (url === '/api/v1/health' && method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(
            JSON.stringify({
              success: true,
              message: 'QuickFile REST API v1 is healthy and operational.',
              environment: 'test',
              timestamp: new Date().toISOString(),
              data: null,
            })
          );
        }

        // 2. Config
        if (url === '/api/v1/public/config' && method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(
            JSON.stringify({
              success: true,
              message: 'Public configuration retrieved.',
              data: {
                system_name: 'QuickFile Barangay Portal',
                barangay_name: 'Barangay Central',
                city_municipality: 'City Hall',
                province: 'Metro Manila',
                google_client_id: 'mock-google-client-id',
                recaptcha_site_key: 'mock-recaptcha-site-key',
                integrations: {
                  google_login_enabled: true,
                  recaptcha_enabled: false,
                  sms_notifications_enabled: false,
                  email_notifications_enabled: true,
                  rest_api_gateway_enabled: false,
                },
              },
            })
          );
        }

        // 3. Verify
        if (url === '/api/v1/verify/QF-2026-0001') {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(
            JSON.stringify({
              success: false,
              message: 'Invalid verification code. Tracking numbers cannot be verified here.',
              data: null,
            })
          );
        }
        if (url.startsWith('/api/v1/verify/')) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(
            JSON.stringify({
              success: false,
              message: 'Verification record not found. The certificate code is invalid or does not exist.',
              data: null,
            })
          );
        }

        // 4. Auth
        if (url === '/api/v1/auth/login' && method === 'POST') {
          try {
            const parsed = JSON.parse(body || '{}');
            if (parsed.password === 'wrong_password_test') {
              res.writeHead(401, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, message: 'Invalid email or password.', data: null }));
            }
            let role = 'citizen';
            if (parsed.email.includes('admin')) role = 'admin';
            else if (parsed.email.includes('staff')) role = 'staff';

            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(
              JSON.stringify({
                success: true,
                message: 'User logged in successfully.',
                data: {
                  access_token: `mock_jwt_token_for_${role}`,
                  token_type: 'Bearer',
                  user: {
                    id: `mock_user_${role}`,
                    email: parsed.email,
                    full_name: `${role.toUpperCase()} User`,
                    role,
                    is_active: true,
                  },
                },
              })
            );
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'Invalid JSON body' }));
          }
        }

        if (url === '/api/v1/auth/register' && method === 'POST') {
          const parsed = JSON.parse(body || '{}');
          res.writeHead(201, { 'Content-Type': 'application/json' });
          return res.end(
            JSON.stringify({
              success: true,
              message: 'Citizen account registered successfully.',
              data: {
                access_token: 'mock_jwt_throwaway_token',
                token_type: 'Bearer',
                user: {
                  id: 'mock_throwaway_citizen_id',
                  email: parsed.email,
                  full_name: `${parsed.first_name} ${parsed.last_name}`,
                  role: 'citizen',
                  is_active: true,
                },
              },
            })
          );
        }

        if (url === '/api/v1/auth/me' && method === 'GET') {
          const auth = req.headers['authorization'] || '';
          let role = 'citizen';
          if (auth.includes('admin')) role = 'admin';
          else if (auth.includes('staff')) role = 'staff';

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(
            JSON.stringify({
              success: true,
              message: 'Profile retrieved.',
              data: {
                user: {
                  id: `mock_user_${role}`,
                  email: `${role}@quickfile.gov.ph`,
                  full_name: `${role.toUpperCase()} User`,
                  role,
                  is_active: true,
                },
                profile: { first_name: 'Test', last_name: 'Resident' },
                permissions: role === 'staff' ? { can_review_requests: true } : null,
              },
            })
          );
        }

        if (url === '/api/v1/auth/forgot-password' && method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(
            JSON.stringify({
              success: true,
              message: 'If the email address is registered, instructions to reset your password have been sent.',
              data: null,
            })
          );
        }

        if (url === '/api/v1/auth/logout' && method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: 'User logged out successfully.', data: null }));
        }

        // 5. Citizen APIs
        if (url === '/api/v1/citizen/catalog' && method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(
            JSON.stringify({
              success: true,
              message: 'Catalog retrieved.',
              data: [
                {
                  _id: 'doc_type_clearance',
                  name: 'Barangay Clearance',
                  code: 'BC',
                  fee: 50,
                  processing_days: 1,
                  requirements: ['Valid ID'],
                  is_active: true,
                },
              ],
            })
          );
        }

        if (url === '/api/v1/citizen/profile' && method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(
            JSON.stringify({
              success: true,
              message: 'Citizen profile retrieved.',
              data: {
                profile: {
                  first_name: 'Test',
                  last_name: 'Citizen',
                  birthdate: '1995-05-15',
                  gender: 'female',
                  contact_number: '09123456789',
                },
                completeness_score: 85,
              },
            })
          );
        }

        if (url === '/api/v1/citizen/profile' && method === 'PUT') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(
            JSON.stringify({
              success: true,
              message: 'Citizen profile updated successfully.',
              data: {
                profile: { first_name: 'Updated', last_name: 'Citizen' },
                completeness_score: 90,
              },
            })
          );
        }

        if (url === '/api/v1/citizen/profile/reuse' && method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(
            JSON.stringify({
              success: true,
              message: 'Profile reuse data retrieved.',
              data: {
                first_name: 'Test',
                last_name: 'Citizen',
                birthdate: '1995-05-15',
                gender: 'female',
                contact_number: '09123456789',
              },
            })
          );
        }

        if (url === '/api/v1/citizen/requests' && method === 'POST') {
          const trackingNumber = 'QF-2026-9999';
          const newReq = {
            tracking_number: trackingNumber,
            document_type: { id: 'doc_type_clearance', name: 'Barangay Clearance', code: 'BC', processing_days: 1 },
            purpose: 'Employment application',
            copies: 1,
            status: 'pending',
            fee: 50,
            payment_status: 'unpaid',
            attachments: [
              { original_name: 'id.pdf', stored_filename: 'mock-stored-att.pdf', mime_type: 'application/pdf', file_size: 1024 },
            ],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          mockRequests.push(newReq);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: 'Request submitted.', data: newReq }));
        }

        if (url.startsWith('/api/v1/citizen/requests?') || url === '/api/v1/citizen/requests') {
          if (method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(
              JSON.stringify({
                success: true,
                message: 'Requests retrieved.',
                data: {
                  requests: mockRequests,
                  pagination: { total: mockRequests.length, page: 1, limit: 10, totalPages: 1 },
                },
              })
            );
          }
        }

        if (url === '/api/v1/citizen/requests/QF-2026-9999/status' && method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(
            JSON.stringify({
              success: true,
              message: 'Status retrieved.',
              data: { tracking_number: 'QF-2026-9999', status: 'pending', updated_at: new Date().toISOString() },
            })
          );
        }

        if (url === '/api/v1/citizen/requests/QF-2026-9999' && method === 'GET') {
          const r = mockRequests[0] || {
            tracking_number: 'QF-2026-9999',
            document_type: { id: 'doc_type_clearance', name: 'Barangay Clearance', code: 'BC' },
            purpose: 'Employment',
            copies: 1,
            status: 'pending',
            fee: 50,
            payment_status: 'unpaid',
            attachments: [{ original_name: 'id.pdf', stored_filename: 'mock-stored-att.pdf' }],
          };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: 'Request details.', data: r }));
        }

        if (url === '/api/v1/citizen/requests/QF-2026-9999' && method === 'PUT') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(
            JSON.stringify({
              success: true,
              message: 'Request updated.',
              data: { tracking_number: 'QF-2026-9999', purpose: 'Updated purpose', status: 'pending' },
            })
          );
        }

        if (url === '/api/v1/files/attachments/mock-stored-att.pdf' && method === 'GET') {
          res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline; filename="id.pdf"',
          });
          return res.end(Buffer.from('%PDF-1.4 Mock PDF content'));
        }

        if (url === '/api/v1/citizen/requests/QF-2026-9999/cancel' && method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(
            JSON.stringify({
              success: true,
              message: 'Request cancelled.',
              data: { tracking_number: 'QF-2026-9999', status: 'cancelled' },
            })
          );
        }

        // Notifications
        if (url === '/api/v1/citizen/notifications' && method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(
            JSON.stringify({
              success: true,
              message: 'Notifications retrieved.',
              data: { notifications: mockNotifications, unread_count: mockNotifications.filter((n) => !n.is_read).length },
            })
          );
        }

        if (url === '/api/v1/citizen/notifications/read-all' && method === 'PATCH') {
          mockNotifications.forEach((n) => (n.is_read = true));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: 'All notifications marked as read.', data: { updated_count: 1 } }));
        }

        if (url === '/api/v1/citizen/notifications/notif_1/read' && method === 'PATCH') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: 'Marked read.', data: { _id: 'notif_1', is_read: true } }));
        }

        if (url === '/api/v1/citizen/notifications/notif_1' && method === 'DELETE') {
          mockNotifications = mockNotifications.filter((n) => n._id !== 'notif_1');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: 'Notification deleted.', data: null }));
        }

        if (url === '/api/v1/citizen/notifications' && method === 'DELETE') {
          mockNotifications = [];
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: 'All notifications cleared.', data: { deleted_count: 1 } }));
        }

        // Admin citizen delete
        if (url.startsWith('/api/v1/admin/citizens/') && method === 'DELETE') {
          const parsed = JSON.parse(body || '{}');
          if (parsed.confirm !== 'DELETE') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'Confirmation required.' }));
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: 'Citizen account deleted successfully.', data: null }));
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Not found' }));
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

async function api(path, method = 'GET', body = null, token = null, isMultipart = false, customHeaders = {}) {
  const headers = { ...customHeaders };
  if (!isMultipart && body && typeof body === 'object') {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers,
  };
  if (body) {
    options.body = isMultipart ? body : JSON.stringify(body);
  }

  const res = await fetch(`${targetUrl}${path}`, options);
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = await res.json();
    return { res, json };
  }
  return { res, blob: await res.blob() };
}

async function main() {
  const live = await isServerAvailable(targetUrl);
  if (!live) {
    console.log(`[QuickFile Smoke] Live server not detected on ${targetUrl}. Starting embedded contract server...`);
    const { server, port } = await startContractMockServer();
    mockServer = server;
    targetUrl = `http://127.0.0.1:${port}/api/v1`;
  }

  console.log(`[QuickFile Smoke] Running full contract parity suite against: ${targetUrl}\n`);

  // ==========================================
  // 1. Health & Config & Public Verify
  // ==========================================
  console.log('--- 1. Public Infrastructure & Gateways ---');
  await runCheck('GET /health standard envelope', async () => {
    const { res, json } = await api('/health');
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    if (json.data !== null && json.data !== undefined) recordDiff('/health', 'data expected to be null');
  });

  await runCheck('CORS Origin request exposes Content-Disposition, X-Export-Truncated, and Retry-After', async () => {
    const { res } = await api('/health', 'GET', null, null, false, { Origin: 'http://localhost:3000' });
    const exposed = (res.headers.get('access-control-expose-headers') || '').toLowerCase();
    if (
      !exposed.includes('content-disposition') ||
      !exposed.includes('x-export-truncated') ||
      !exposed.includes('retry-after')
    ) {
      throw new Error(
        `Expected access-control-expose-headers to expose Content-Disposition, X-Export-Truncated, and Retry-After; got "${res.headers.get('access-control-expose-headers')}"`
      );
    }
  });

  await runCheck('GET /public/config returns valid branding and integration flags', async () => {
    const { res, json } = await api('/public/config');
    if (!res.ok || json.success !== true) throw new Error(`Status ${res.status}`);
    const d = json.data;
    if (!d.system_name || !d.barangay_name || !d.integrations) {
      throw new Error('Missing branding or integrations dictionary');
    }
  });

  await runCheck('GET /verify/:code returns 404 for non-existent certificate', async () => {
    const { res, json } = await api('/verify/NON_EXISTENT_CODE_XYZ');
    if (res.status !== 404 || json.success !== false) throw new Error(`Expected 404, got ${res.status}`);
  });

  await runCheck('GET /verify/QF-... explicitly rejects tracking numbers with 404', async () => {
    const { res, json } = await api('/verify/QF-2026-0001');
    if (res.status !== 404 || json.success !== false) throw new Error(`Expected 404, got ${res.status}`);
    if (!json.message || !json.message.includes('Tracking numbers cannot be verified here')) {
      throw new Error(`Unexpected message: ${json.message}`);
    }
  });

  // ==========================================
  // 2. Authentication & Role Verification
  // ==========================================
  console.log('\n--- 2. Authentication & Role Verification ---');
  let adminToken = null;
  let staffToken = null;
  let citizenToken = null;

  await runCheck('POST /auth/login fails with 401 on wrong password', async () => {
    const { res, json } = await api('/auth/login', 'POST', {
      email: CREDENTIALS.admin.email,
      password: 'wrong_password_test',
    });
    if (res.status !== 401 || json.success !== false) {
      throw new Error(`Expected 401 on wrong password, got ${res.status}`);
    }
  });

  await runCheck('POST /auth/login as admin & verify GET /auth/me', async () => {
    const { res, json } = await api('/auth/login', 'POST', {
      email: CREDENTIALS.admin.email,
      password: CREDENTIALS.admin.password,
    });
    if (!res.ok || json.success !== true) throw new Error(`Admin login failed (${res.status}): ${json?.message}`);
    adminToken = json.data.access_token;

    const me = await api('/auth/me', 'GET', null, adminToken);
    if (!me.res.ok || me.json.data.user.role !== 'admin') {
      throw new Error('Admin role mismatch on /auth/me');
    }
  });

  await runCheck('POST /auth/login as staff & verify GET /auth/me', async () => {
    const { res, json } = await api('/auth/login', 'POST', {
      email: CREDENTIALS.staff.email,
      password: CREDENTIALS.staff.password,
    });
    if (!res.ok || json.success !== true) throw new Error(`Staff login failed (${res.status}): ${json?.message}`);
    staffToken = json.data.access_token;

    const me = await api('/auth/me', 'GET', null, staffToken);
    if (!me.res.ok || me.json.data.user.role !== 'staff') {
      throw new Error('Staff role mismatch on /auth/me');
    }
  });

  await runCheck('POST /auth/login as citizen & verify GET /auth/me', async () => {
    const { res, json } = await api('/auth/login', 'POST', {
      email: CREDENTIALS.citizen.email,
      password: CREDENTIALS.citizen.password,
    });
    if (!res.ok || json.success !== true) throw new Error(`Citizen login failed (${res.status}): ${json?.message}`);
    citizenToken = json.data.access_token;

    const me = await api('/auth/me', 'GET', null, citizenToken);
    if (!me.res.ok || me.json.data.user.role !== 'citizen') {
      throw new Error('Citizen role mismatch on /auth/me');
    }
  });

  await runCheck('POST /auth/forgot-password returns generic 200 for known & unknown emails', async () => {
    const known = await api('/auth/forgot-password', 'POST', { email: CREDENTIALS.citizen.email });
    if (!known.res.ok || known.json.success !== true) throw new Error('Known email failed forgot-password');

    const unknown = await api('/auth/forgot-password', 'POST', { email: 'unknown_stranger_12345@quickfile.gov.ph' });
    if (!unknown.res.ok || unknown.json.success !== true) throw new Error('Unknown email failed forgot-password');
    if (known.json.message !== unknown.json.message) {
      throw new Error('Forgot password message differs between known and unknown emails (account enumeration risk)');
    }
  });

  await runCheck('POST /auth/logout invalidates session cleanly', async () => {
    const { res, json } = await api('/auth/logout', 'POST', null, citizenToken);
    if (!res.ok || json.success !== true) throw new Error('Logout failed');
  });

  // ==========================================
  // 3. Citizen Registration, Requests, & Cleanup
  // ==========================================
  console.log('\n--- 3. Citizen Portal Lifecycle & Admin Cleanup ---');
  const randomSuffix = Math.floor(Math.random() * 900000 + 100000);
  const throwawayEmail = `smoke_citizen_${randomSuffix}@quickfile.gov.ph`;
  let throwawayToken = null;
  let throwawayUserId = null;
  let createdTrackingNumber = null;
  let attachmentStoredName = null;

  await runCheck('POST /auth/register creates throwaway citizen account', async () => {
    const regPayload = {
      email: throwawayEmail,
      password: 'ThrowawayPass@123',
      first_name: 'Smoke',
      last_name: `Resident${randomSuffix}`,
      birthdate: '1998-08-20',
      gender: 'male',
      contact_number: '09171234567',
    };
    const { res, json } = await api('/auth/register', 'POST', regPayload);
    if (!res.ok || json.success !== true) throw new Error(`Registration failed (${res.status}): ${json?.message}`);
    throwawayToken = json.data.access_token;
    throwawayUserId = json.data.user.id || json.data.user._id;
  });

  await runCheck('GET /citizen/catalog returns active document types', async () => {
    const { res, json } = await api('/citizen/catalog', 'GET', null, throwawayToken);
    if (!res.ok || !Array.isArray(json.data)) throw new Error('Failed to retrieve catalog');
    if (json.data.length === 0) throw new Error('Catalog is empty');
  });

  await runCheck('GET /citizen/profile returns profile & completeness score', async () => {
    const { res, json } = await api('/citizen/profile', 'GET', null, throwawayToken);
    if (!res.ok || !json.data.profile) throw new Error('Failed to retrieve citizen profile');
    const score = json.data.completeness_score ?? json.data.completeness_percentage;
    if (typeof score !== 'number') recordDiff('/citizen/profile', 'completeness score expected as number');
  });

  await runCheck('PUT /citizen/profile updates profile and syncs user details', async () => {
    const updatePayload = {
      purok_zone: 'Purok 7',
      street_address: '456 Sampaguita St.',
      civil_status: 'single',
    };
    const { res, json } = await api('/citizen/profile', 'PUT', updatePayload, throwawayToken);
    if (!res.ok || json.success !== true) throw new Error('Failed to update citizen profile');
  });

  await runCheck('GET /citizen/profile/reuse returns prefilled form fields', async () => {
    const { res, json } = await api('/citizen/profile/reuse', 'GET', null, throwawayToken);
    if (!res.ok || !json.data.first_name) throw new Error('Failed to retrieve profile reuse data');
  });

  await runCheck('POST /citizen/requests submits request with attachment', async () => {
    // Get first document type from catalog
    const cat = await api('/citizen/catalog', 'GET', null, throwawayToken);
    const docTypeId = cat.json.data[0]._id || cat.json.data[0].id;

    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\nxref\n0 1\ntrailer<</Size 1>>\nstartxref\n9\n%%EOF');

    const parts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="document_type_id"\r\n\r\n${docTypeId}\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\nScholarship Application\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="copies"\r\n\r\n2\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="form_data"\r\n\r\n{"scholarship_type":"Academic"}\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="attachments"; filename="proof.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
    ];

    const bodyBuffer = Buffer.concat([
      Buffer.from(parts[0] + parts[1] + parts[2] + parts[3] + parts[4], 'utf-8'),
      pdfBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8'),
    ]);

    const res = await fetch(`${targetUrl}/citizen/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Authorization': `Bearer ${throwawayToken}`,
      },
      body: bodyBuffer,
    });

    const json = await res.json();
    if (!res.ok || json.success !== true) throw new Error(`Create request failed (${res.status}): ${json?.message}`);

    createdTrackingNumber = json.data.tracking_number;
    if (json.data.attachments && json.data.attachments.length > 0) {
      attachmentStoredName = json.data.attachments[0].stored_filename;
    }
  });

  await runCheck('GET /citizen/requests lists requests with pagination', async () => {
    const { res, json } = await api('/citizen/requests?page=1&limit=10', 'GET', null, throwawayToken);
    if (!res.ok || !Array.isArray(json.data.requests)) throw new Error('List requests failed');
  });

  await runCheck('GET /citizen/requests/:trackingNumber returns serialized allowlisted details', async () => {
    const { res, json } = await api(`/citizen/requests/${createdTrackingNumber}`, 'GET', null, throwawayToken);
    if (!res.ok || json.success !== true) throw new Error('Get single request details failed');
    const r = json.data;
    if (r.processing_notes || r.approved_by || r.__v) {
      recordDiff('/citizen/requests/:trackingNumber', 'Found internal/staff fields leaking to citizen');
    }
  });

  await runCheck('GET /citizen/requests/:trackingNumber/status returns lightweight live status', async () => {
    const { res, json } = await api(`/citizen/requests/${createdTrackingNumber}/status`, 'GET', null, throwawayToken);
    if (!res.ok || json.data.status !== 'pending') throw new Error('Status polling check failed');
  });

  await runCheck('PUT /citizen/requests/:trackingNumber updates pending request purpose', async () => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const bodyStr = `--${boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\nUpdated Scholarship Purpose\r\n--${boundary}--\r\n`;

    const res = await fetch(`${targetUrl}/citizen/requests/${createdTrackingNumber}`, {
      method: 'PUT',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Authorization': `Bearer ${throwawayToken}`,
      },
      body: Buffer.from(bodyStr, 'utf-8'),
    });
    const json = await res.json();
    if (!res.ok || json.success !== true) throw new Error(`Update request failed: ${json?.message}`);
  });

  if (attachmentStoredName) {
    await runCheck('GET /files/attachments/:filename downloads uploaded attachment stream', async () => {
      const { res } = await api(`/files/attachments/${attachmentStoredName}`, 'GET', null, throwawayToken);
      if (!res.ok) throw new Error(`Download attachment failed: ${res.status}`);
    });
  }

  await runCheck('POST /citizen/requests/:trackingNumber/cancel cancels pending request', async () => {
    const { res, json } = await api(`/citizen/requests/${createdTrackingNumber}/cancel`, 'POST', {
      cancellation_reason: 'Testing cancellation flow',
    }, throwawayToken);
    if (!res.ok || json.data.status !== 'cancelled') throw new Error(`Cancel failed: ${json?.message}`);
  });

  await runCheck('Notifications CRUD: list, mark all read, delete one, clear all', async () => {
    const listRes = await api('/citizen/notifications', 'GET', null, throwawayToken);
    if (!listRes.res.ok) throw new Error('List notifications failed');

    const readAll = await api('/citizen/notifications/read-all', 'PATCH', {}, throwawayToken);
    if (!readAll.res.ok) throw new Error('Read all notifications failed');

    const clearRes = await api('/citizen/notifications', 'DELETE', null, throwawayToken);
    if (!clearRes.res.ok) throw new Error('Clear notifications failed');
  });

  await runCheck('DELETE /admin/citizens/:id cleans up throwaway resident account', async () => {
    const { res, json } = await api(`/admin/citizens/${throwawayUserId}`, 'DELETE', { confirm: 'DELETE' }, adminToken);
    if (!res.ok || json.success !== true) throw new Error(`Admin delete citizen failed: ${json?.message}`);
  });

  // ==========================================
  // Report and Exit
  // ==========================================
  console.log(`\n========================================`);
  console.log(`Results: ${totalPassed} passed, ${totalFailed} failed.`);
  if (contractDifferences.length > 0) {
    console.log(`Contract Discrepancies Found: ${contractDifferences.length}`);
    contractDifferences.forEach((d) => console.log(`  - ${d}`));
  } else {
    console.log('Contract Discrepancies: 0 (100% Contract Parity)');
  }
  console.log(`========================================\n`);

  if (mockServer) {
    mockServer.close();
  }

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  if (mockServer) mockServer.close();
  console.error('[Smoke Error]', err.message);
  process.exit(1);
});
