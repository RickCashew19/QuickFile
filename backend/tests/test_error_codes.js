/**
 * Standardized error-code suite.
 *
 * Every error envelope must include a stable machine-readable `code`, while
 * successful responses must not gain one. Also checks that known error classes
 * map to specific codes and that explicit domain codes survive.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const TEST_ENV_PATH = path.resolve(__dirname, 'test_error_codes.env.tmp');
process.env.NODE_ENV = 'test';
process.env.ENV_FILE = TEST_ENV_PATH;
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/quickfile_error_codes_test';
process.env.JWT_SECRET = 'quickfile_error_codes_jwt_secret_32';
process.env.SU_ADMIN_KEY = 'su_key_error_codes_test_12345';
process.env.FRONTEND_URL = 'http://localhost:5173';

fs.writeFileSync(
  TEST_ENV_PATH,
  [
    'NODE_ENV=test',
    `MONGO_URI=${process.env.MONGO_URI}`,
    `JWT_SECRET=${process.env.JWT_SECRET}`,
    `SU_ADMIN_KEY=${process.env.SU_ADMIN_KEY}`,
  ].join('\n'),
  'utf8'
);

const app = require('../app');
const { errorHandler } = require('../src/middlewares/errorHandler.middleware');
const { API_PREFIX } = require('../src/config/constants');

function request(server, requestPath, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const headers = { ...(options.headers || {}) };
    let payload = null;
    if (body !== null) {
      payload = Buffer.from(JSON.stringify(body));
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = payload.length;
    }
    const req = http.request(
      { hostname: '127.0.0.1', port: server.address().port, path: requestPath, method: options.method || 'GET', headers },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed = data;
          try { parsed = JSON.parse(data); } catch {}
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Run the central error handler with a minimal fake response object. */
function handleError(error) {
  let status = null;
  let body = null;
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; status = code; return this; },
    json(payload) { body = payload; return this; },
    setHeader() {},
    getHeader() { return undefined; },
  };
  errorHandler(error, { method: 'GET', originalUrl: '/api/v1/test' }, res, () => {});
  return { status, body };
}

async function run() {
  console.log('=== ERROR CODE STANDARDIZATION SUITE ===\n');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const ok = (label) => console.log('  PASS:', label);

  try {
    let res = await request(server, `${API_PREFIX}/unknown-endpoint`);
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.code, 'NOT_FOUND');
    ok('404 from notFound handler carries NOT_FOUND');

    res = await request(server, `${API_PREFIX}/auth/me`);
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, 'UNAUTHORIZED');
    ok('401 from auth middleware carries UNAUTHORIZED');

    res = await request(server, `${API_PREFIX}/auth/me`, {
      headers: { Authorization: 'Bearer not-a-real-token' },
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, 'TOKEN_INVALID');
    ok('explicit TOKEN_INVALID code is preserved');

    res = await request(server, `${API_PREFIX}/auth/register`, { method: 'POST' }, {});
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'BAD_REQUEST');
    ok('handler-written 400 responses also get a code');

    res = await request(server, `${API_PREFIX}/health`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.code, undefined);
    ok('success responses do not gain a code');

    let result = handleError(Object.assign(new Error('bad input'), { name: 'ValidationError', errors: { f: { message: 'required' } } }));
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.body.code, 'VALIDATION_ERROR');
    ok('Mongoose validation errors map to VALIDATION_ERROR');

    result = handleError(Object.assign(new Error('duplicate'), { code: 11000, keyPattern: { email: 1 }, keyValue: { email: 'x' } }));
    assert.strictEqual(result.status, 409);
    assert.strictEqual(result.body.code, 'DUPLICATE_KEY');
    ok('numeric E11000 is translated to DUPLICATE_KEY');

    result = handleError(Object.assign(new Error('incomplete profile'), { statusCode: 409, code: 'MISSING_PROFILE_FIELDS' }));
    assert.strictEqual(result.body.code, 'MISSING_PROFILE_FIELDS');
    ok('domain-specific codes survive the central handler');

    result = handleError(new Error('unexpected failure'));
    assert.strictEqual(result.status, 500);
    assert.strictEqual(result.body.code, 'INTERNAL_ERROR');
    ok('unclassified failures map to INTERNAL_ERROR');

    console.log('\n=== ALL ERROR CODE TESTS PASSED ===');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (fs.existsSync(TEST_ENV_PATH)) fs.unlinkSync(TEST_ENV_PATH);
  }
}

run().catch((err) => {
  console.error('TEST SUITE FAILED:', err && err.message);
  process.exitCode = 1;
});
