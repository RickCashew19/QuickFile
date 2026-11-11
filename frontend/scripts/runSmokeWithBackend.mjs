import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const TEST_ENV_FILE = path.join(BACKEND_DIR, 'test_smoke.env');

// Cryptographically generated runtime secrets (no committed literals)
const jwtSecret = crypto.randomBytes(32).toString('hex');
const suAdminKey = crypto.randomBytes(16).toString('hex');
const adminPassword = `Admin@${crypto.randomBytes(8).toString('hex')}`;
const staffPassword = `Staff@${crypto.randomBytes(8).toString('hex')}`;
const citizenPassword = `Citizen@${crypto.randomBytes(8).toString('hex')}`;

const adminEmail = 'admin@quickfile.gov.ph';
const staffEmail = 'staff@quickfile.gov.ph';
const citizenEmail = 'resident@quickfile.gov.ph';

const envContent = `NODE_ENV=test
PORT=5001
MONGO_URI=mongodb://127.0.0.1:27017/quickfile_smoke_test
JWT_SECRET=${jwtSecret}
SU_ADMIN_KEY=${suAdminKey}
BARANGAY_NAME=Barangay San Antonio
CITY_MUNICIPALITY=Pasig City
PROVINCE=Metro Manila
DEFAULT_ADMIN_EMAIL=${adminEmail}
DEFAULT_ADMIN_PASSWORD=${adminPassword}
DEFAULT_STAFF_EMAIL=${staffEmail}
DEFAULT_STAFF_PASSWORD=${staffPassword}
DEFAULT_CITIZEN_EMAIL=${citizenEmail}
DEFAULT_CITIZEN_PASSWORD=${citizenPassword}
PUBLIC_APP_URL=http://localhost:5173
FRONTEND_URL=http://localhost:5173
`;

fs.writeFileSync(TEST_ENV_FILE, envContent, 'utf8');
console.log('[SmokeRunner] Created backend/test_smoke.env with dynamic credentials');

let serverProcess = null;

try {
  // 0. Drop existing test database to ensure fresh state
  console.log('[SmokeRunner] Resetting test database quickfile_smoke_test...');
  try {
    execSync('node -e "const m = require(\'mongoose\'); m.connect(\'mongodb://127.0.0.1:27017/quickfile_smoke_test\').then(() => m.connection.db.dropDatabase()).then(() => m.disconnect()).then(() => process.exit(0));"', {
      cwd: BACKEND_DIR,
      stdio: 'inherit',
    });
  } catch (err) {
    console.warn('[SmokeRunner] DB drop note:', err.message);
  }

  // 1. Seed database using real backend seeder
  console.log('[SmokeRunner] Seeding test database with .gov.ph accounts...');
  execSync('node src/utils/seeder.js', {
    cwd: BACKEND_DIR,
    env: { ...process.env, ENV_FILE: 'test_smoke.env' },
    stdio: 'inherit',
  });

  // 2. Start dedicated backend server on port 5001
  console.log('[SmokeRunner] Starting backend test server on port 5001 (entry: server.js)...');
  let backendStderr = '';
  serverProcess = spawn('node', ['server.js'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, ENV_FILE: 'test_smoke.env' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stderr.on('data', (d) => {
    backendStderr += d.toString();
    process.stderr.write(d);
  });
  serverProcess.stdout.on('data', (d) => {
    // suppress verbose output
  });

  // 3. Wait for /api/v1/health to report environment: 'test'
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await fetch('http://localhost:5001/api/v1/health');
      if (res.ok) {
        const body = await res.json();
        if (body.environment === 'test') {
          console.log('[SmokeRunner] Test backend is healthy and in "test" environment.');
          ready = true;
          break;
        } else {
          console.error(`[SmokeRunner] Backend reported unexpected environment: "${body.environment}". Expected "test".`);
        }
      }
    } catch {
      // waiting for server port to open
    }
  }

  if (!ready) {
    if (serverProcess) serverProcess.kill('SIGTERM');
    console.error('[SmokeRunner ERROR] Test backend failed to start or did not report environment: "test".');
    console.error('[SmokeRunner ERROR] Captured Backend Stderr:\n', backendStderr || '(no stderr output)');
    process.exit(1);
  }

  // 4. Run smoke.mjs with dynamic runtime environment
  console.log('[SmokeRunner] Running frontend smoke verification suite...');
  let smokeExitCode = 0;
  try {
    execSync('node scripts/smoke.mjs', {
      cwd: FRONTEND_DIR,
      env: {
        ...process.env,
        SMOKE_API_URL: 'http://localhost:5001/api/v1',
        SMOKE_ADMIN_EMAIL: adminEmail,
        SMOKE_ADMIN_PASSWORD: adminPassword,
        SMOKE_STAFF_EMAIL: staffEmail,
        SMOKE_STAFF_PASSWORD: staffPassword,
        SMOKE_CITIZEN_EMAIL: citizenEmail,
        SMOKE_CITIZEN_PASSWORD: citizenPassword,
        SMOKE_SU_ADMIN_KEY: suAdminKey,
      },
      stdio: 'inherit',
    });
  } catch (err) {
    smokeExitCode = err.status || 1;
  }

  // 5. Stop server
  console.log('[SmokeRunner] Stopping test server...');
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }

  if (smokeExitCode !== 0) {
    process.exit(smokeExitCode);
  }
} finally {
  if (serverProcess) {
    try {
      serverProcess.kill('SIGTERM');
    } catch {}
  }
  try {
    if (fs.existsSync(TEST_ENV_FILE)) {
      fs.unlinkSync(TEST_ENV_FILE);
      console.log('[SmokeRunner] Cleaned up backend/test_smoke.env');
    }
  } catch (err) {
    console.warn('[SmokeRunner] Failed to remove test_smoke.env:', err.message);
  }
}
