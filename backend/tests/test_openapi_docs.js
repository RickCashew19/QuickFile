/**
 * OpenAPI documentation suite.
 *
 * The machine-readable spec and Swagger UI must be served without needing a
 * database, must describe every documented operation, and must not weaken the
 * global CSP outside the docs path.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const TEST_ENV_PATH = path.resolve(__dirname, 'test_openapi.env.tmp');

process.env.NODE_ENV = 'test';
process.env.ENV_FILE = TEST_ENV_PATH;
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/quickfile_openapi_test';
process.env.JWT_SECRET = 'quickfile_openapi_jwt_secret_at_least_32';
process.env.SU_ADMIN_KEY = 'su_key_openapi_test_12345';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.PUBLIC_APP_URL = 'http://localhost:5173';

fs.writeFileSync(
  TEST_ENV_PATH,
  [
    'NODE_ENV=test',
    `MONGO_URI=${process.env.MONGO_URI}`,
    `JWT_SECRET=${process.env.JWT_SECRET}`,
    `SU_ADMIN_KEY=${process.env.SU_ADMIN_KEY}`,
    'FRONTEND_URL=http://localhost:5173',
  ].join('\n'),
  'utf8'
);

const app = require('../app');
const { API_PREFIX } = require('../src/config/constants');

function rawRequest(server, requestPath) {
  return new Promise((resolve, reject) => {
    http
      .get({ hostname: '127.0.0.1', port: server.address().port, path: requestPath }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: data })
        );
      })
      .on('error', reject);
  });
}

async function run() {
  console.log('=== OPENAPI DOCUMENTATION SUITE ===\n');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const ok = (label) => console.log('  PASS:', label);

  try {
    let res = await rawRequest(server, `${API_PREFIX}/openapi.json`);
    assert.strictEqual(res.status, 200);
    const spec = JSON.parse(res.body);
    assert.strictEqual(spec.openapi, '3.0.3');
    assert.strictEqual(spec.info.title, 'QuickFile REST API');
    assert(Object.keys(spec.paths).length >= 85, `only ${Object.keys(spec.paths).length} paths`);
    assert(Object.keys(spec.components.securitySchemes).length === 4);
    ok(`spec is served as JSON with ${Object.keys(spec.paths).length} paths`);

    let operations = 0;
    for (const [urlPath, methods] of Object.entries(spec.paths)) {
      assert(urlPath.startsWith(`${API_PREFIX}/`), `bad path prefix: ${urlPath}`);
      for (const [method, operation] of Object.entries(methods)) {
        operations += 1;
        assert(operation.summary && operation.tags?.length, `missing metadata: ${method} ${urlPath}`);
        assert(operation.responses['200'] || operation.responses['201'], `no success response: ${method} ${urlPath}`);
        for (const parameter of operation.parameters || []) {
          assert(['path', 'query', 'header', 'cookie'].includes(parameter.in));
          if (parameter.in === 'path') {
            assert(
              urlPath.includes(`{${parameter.name}}`),
              `path parameter not in URL: ${parameter.name} on ${urlPath}`
            );
          }
        }
      }
    }
    assert(operations >= 100, `only ${operations} operations`);
    ok(`all ${operations} operations have summaries, responses and valid parameters`);

    assert.deepStrictEqual(
      spec.paths[`${API_PREFIX}/verify/{code}`].get.security,
      [],
      'public verification must override global auth'
    );
    assert.deepStrictEqual(
      spec.paths[`${API_PREFIX}/gateway/status`].get.security,
      [{ apiKeyAuth: [] }],
      'gateway must use the API key scheme'
    );
    ok('public and gateway endpoints declare the correct security overrides');

    res = await rawRequest(server, `${API_PREFIX}/docs/`);
    assert.strictEqual(res.status, 200);
    assert(res.headers['content-type'].includes('text/html'));
    assert(res.body.includes('swagger-ui') && res.body.includes('QuickFile REST API'));
    assert(res.headers['content-security-policy'].includes("'unsafe-inline'"));
    ok('Swagger UI renders with a docs-only CSP allowing inline boot script');

    res = await rawRequest(server, `${API_PREFIX}/docs/swagger-ui.css`);
    assert.strictEqual(res.status, 200);
    ok('Swagger UI static assets are served locally');

    res = await rawRequest(server, `${API_PREFIX}/health`);
    assert.strictEqual(res.status, 200);
    ok('health endpoint still works after docs are mounted');

    console.log('\n=== ALL OPENAPI TESTS PASSED ===');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (fs.existsSync(TEST_ENV_PATH)) fs.unlinkSync(TEST_ENV_PATH);
  }
}

run().catch((err) => {
  console.error('TEST SUITE FAILED:', err && err.message);
  process.exitCode = 1;
});
