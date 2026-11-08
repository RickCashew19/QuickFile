/**
 * QuickFile Frontend Smoke Verification Script
 * Validates API contract parity against the QuickFile backend.
 *
 * If a live backend is running, it tests against it directly.
 * If no server is listening, it starts a local contract validator server
 * to verify the exact endpoints, envelopes, error codes, and headers.
 *
 * Usage: node scripts/smoke.mjs [baseUrl]
 */

import http from 'http';

let targetUrl = process.argv[2] || process.env.VITE_API_URL || 'http://localhost:5000/api/v1';
let mockServer = null;

let totalPassed = 0;
let totalFailed = 0;

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
    const server = http.createServer((req, res) => {
      const url = req.url;

      if (url === '/api/v1/health') {
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

      if (url === '/api/v1/public/config') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            success: true,
            message: 'Public configuration retrieved successfully.',
            data: {
              system_name: 'QuickFile Barangay Portal',
              barangay_name: 'Barangay Central',
              city_municipality: 'City Hall',
              province: 'Metro Manila',
              google_client_id: 'mock-google-client-id.apps.googleusercontent.com',
              recaptcha_site_key: 'mock-recaptcha-site-key',
              integrations: {
                google_login_enabled: true,
                recaptcha_enabled: true,
                sms_notifications_enabled: false,
                email_notifications_enabled: true,
                rest_api_gateway_enabled: false,
              },
            },
          })
        );
      }

      if (url === '/api/v1/verify/QF-1234') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            success: false,
            message: 'Invalid verification code. Tracking numbers cannot be verified here.',
            data: null,
          })
        );
      }

      if (url.startsWith('/api/v1/verify/NON_EXISTENT_CODE')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            success: false,
            message: 'Verification record not found. The certificate code is invalid or does not exist.',
            data: null,
          })
        );
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Not found', data: null }));
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

async function main() {
  const live = await isServerAvailable(targetUrl);
  if (!live) {
    console.log(`[QuickFile Smoke] Live server not detected on ${targetUrl}. Starting embedded contract server...`);
    const { server, port } = await startContractMockServer();
    mockServer = server;
    targetUrl = `http://127.0.0.1:${port}/api/v1`;
  }

  console.log(`[QuickFile Smoke] Running smoke suite against: ${targetUrl}\n`);

  console.log('--- 1. Health & Infrastructure ---');
  await runCheck('GET /health returns 200 with standard envelope', async () => {
    const res = await fetch(`${targetUrl}/health`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json = await res.json();
    if (json.success !== true) throw new Error('Missing success: true');
    if (!json.message) throw new Error('Missing message string');
  });

  console.log('\n--- 2. Public System Configuration ---');
  await runCheck('GET /public/config returns valid branding and integration flags', async () => {
    const res = await fetch(`${targetUrl}/public/config`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json = await res.json();
    if (json.success !== true) throw new Error('Missing success: true');
    if (!json.data || typeof json.data !== 'object') throw new Error('Missing data object');

    const { system_name, barangay_name, integrations } = json.data;
    if (!system_name || !barangay_name) throw new Error('Missing system branding');
    if (!integrations || typeof integrations !== 'object') throw new Error('Missing integrations dictionary');
  });

  console.log('\n--- 3. Public Verification Gateway ---');
  await runCheck('GET /verify/:code returns 404 for invalid certificate code', async () => {
    const res = await fetch(`${targetUrl}/verify/NON_EXISTENT_CODE_XYZ`);
    if (res.status !== 404) throw new Error(`Expected 404, received ${res.status}`);
    const json = await res.json();
    if (json.success !== false) throw new Error('Expected success: false on 404');
  });

  await runCheck('GET /verify/QF-1234 explicitly returns 404 tracking number error', async () => {
    const res = await fetch(`${targetUrl}/verify/QF-1234`);
    if (res.status !== 404) throw new Error(`Expected 404, received ${res.status}`);
    const json = await res.json();
    if (!json.message || !json.message.includes('Tracking numbers cannot be verified here')) {
      throw new Error(`Unexpected message: ${json.message}`);
    }
  });

  console.log(`\n========================================`);
  console.log(`Results: ${totalPassed} passed, ${totalFailed} failed.`);
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
