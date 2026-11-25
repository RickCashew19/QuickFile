/**
 * Cache-Control suite: API GET responses must not be stored, while Swagger UI
 * assets mounted before the policy keep their own caching behaviour.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const TEST_ENV_PATH = path.resolve(__dirname, 'test_cache_control.env.tmp');
process.env.NODE_ENV = 'test';
process.env.ENV_FILE = TEST_ENV_PATH;
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/quickfile_cache_test';
process.env.JWT_SECRET = 'quickfile_cache_jwt_secret_at_least_32';
process.env.SU_ADMIN_KEY = 'su_key_cache_test_12345';
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
const { API_PREFIX } = require('../src/config/constants');

function get(server, requestPath) {
  return new Promise((resolve, reject) => {
    http
      .get({ hostname: '127.0.0.1', port: server.address().port, path: requestPath }, (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
      })
      .on('error', reject);
  });
}

async function run() {
  console.log('=== CACHE CONTROL SUITE ===\n');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const ok = (label) => console.log('  PASS:', label);

  try {
    let res = await get(server, `${API_PREFIX}/health`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['cache-control'], 'private, no-store');
    ok('health GET is private and no-store');

    res = await get(server, `${API_PREFIX}/unknown-endpoint`);
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.headers['cache-control'], 'private, no-store');
    ok('unmapped GET (404) also carries the no-store default');

    res = await get(server, `${API_PREFIX}/docs/swagger-ui.css`);
    assert.strictEqual(res.status, 200);
    assert.notStrictEqual(res.headers['cache-control'], 'private, no-store');
    ok('Swagger UI assets are exempt from the API policy');

    console.log('\n=== ALL CACHE CONTROL TESTS PASSED ===');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (fs.existsSync(TEST_ENV_PATH)) fs.unlinkSync(TEST_ENV_PATH);
  }
}

run().catch((err) => {
  console.error('TEST SUITE FAILED:', err && err.message);
  process.exitCode = 1;
});
