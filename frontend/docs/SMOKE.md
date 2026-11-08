# QuickFile Smoke Testing & Parity Guide (Windows PowerShell)

This guide documents the exact, safe procedure for executing the backend-to-frontend smoke verification suite (`frontend/scripts/smoke.mjs`).

> **CRITICAL SAFETY INVARIANT**:
> The smoke script performs real state transitions, creates test records, and tests Super Admin Key failure limits.
> To prevent corrupting local development or production databases, `smoke.mjs` first probes `GET /api/v1/health` and **immediately aborts** unless `environment === "test"`.

---

## 1. Backend `ENV_FILE` Native Support Verification

The QuickFile backend natively supports custom environment configuration files via the `ENV_FILE` variable:
- [`backend/src/config/index.js#L6`](file:///f:/School%20Works/QuickFile/backend/src/config/index.js#L6):
  ```javascript
  const getEnvFilePath = () => {
    return process.env.ENV_FILE ? path.resolve(process.env.ENV_FILE) : path.resolve(__dirname, '../../.env');
  };
  ```
- [`backend/src/utils/envWriter.js#L10`](file:///f:/School%20Works/QuickFile/backend/src/utils/envWriter.js#L10):
  ```javascript
  const resolveEnvFilePath = () => {
    return process.env.ENV_FILE ? path.resolve(process.env.ENV_FILE) : path.resolve(__dirname, '../../.env');
  };
  ```

Setting `$env:ENV_FILE = "test_smoke.env"` ensures the test server runs with completely isolated database and settings, and that `PATCH /admin/settings` writes to `test_smoke.env` without ever touching `backend/.env`.

---

## 2. Step-by-Step Setup Instructions (Windows PowerShell)

Open two Windows PowerShell terminals in `f:\School Works\QuickFile`.

### Step 1: Create the Isolated Test Environment File

Create `backend/test_smoke.env` (never commit real secrets):

```powershell
@"
NODE_ENV=test
PORT=5001
MONGO_URI=mongodb://localhost:27017/quickfile_smoke_test
JWT_SECRET=super_secret_test_jwt_key_at_least_32_characters_long
SU_ADMIN_KEY=super_admin_test_key_16_chars_min
BARANGAY_NAME=Barangay San Antonio
CITY_MUNICIPALITY=Pasig City
PROVINCE=Metro Manila
DEFAULT_ADMIN_PASSWORD=Admin@123456
DEFAULT_STAFF_PASSWORD=Staff@123456
DEFAULT_CITIZEN_PASSWORD=Citizen@123456
"@ | Set-Content -Path "backend\test_smoke.env" -Encoding UTF8
```

### Step 2: Seed the Isolated Test Database (Terminal 1)

```powershell
cd backend
$env:ENV_FILE = "test_smoke.env"
npm run seed
```

Expected output:
```text
[Seeder] Starting database seeding process...
[Seeder] Initialized Super Admin lockout state.
[Seeder] Seeded default admin account: admin@quickfile.ph
[Seeder] Seeded default staff account: staff@quickfile.ph
[Seeder] Seeded default citizen account: resident@quickfile.ph
[Seeder] Database seeding completed successfully.
```

### Step 3: Start the Dedicated Test Server on Port 5001 (Terminal 1)

```powershell
$env:ENV_FILE = "test_smoke.env"
node server.js
```

Verify in your browser or curl that `GET http://localhost:5001/api/v1/health` reports:
```json
{
  "success": true,
  "message": "QuickFile REST API v1 is healthy and operational.",
  "environment": "test",
  "data": null
}
```

### Step 4: Run the Smoke Verification Script (Terminal 2)

In Terminal 2, navigate to `/frontend` and execute:

```powershell
cd frontend

$env:SMOKE_API_URL = "http://localhost:5001/api/v1"
$env:SMOKE_ADMIN_EMAIL = "admin@quickfile.ph"
$env:SMOKE_ADMIN_PASSWORD = "Admin@123456"
$env:SMOKE_STAFF_EMAIL = "staff@quickfile.ph"
$env:SMOKE_STAFF_PASSWORD = "Staff@123456"
$env:SMOKE_CITIZEN_EMAIL = "resident@quickfile.ph"
$env:SMOKE_CITIZEN_PASSWORD = "Citizen@123456"
$env:SMOKE_SU_ADMIN_KEY = "super_admin_test_key_16_chars_min"

node scripts/smoke.mjs
```

### Step 5: Teardown & Cleanup

1. In Terminal 1, stop the test server (`Ctrl + C`).
2. Delete the temporary environment file and database:
   ```powershell
   Remove-Item "backend\test_smoke.env" -Force -ErrorAction SilentlyContinue
   ```
3. (Optional) In MongoDB shell or Compass, drop `quickfile_smoke_test`.

---

## 3. Negative Checks Executed in Smoke Suite

The smoke script exercises critical security invariants:
1. **Health Environment Gate**: Refuses execution on any backend where `environment !== "test"`.
2. **Zero-Permission Staff Gating (403 Forbidden)**: Provisions a throwaway staff member with all 7 permission flags set to `false`, asserts `403 Forbidden` across all guarded staff endpoints (`/staff/requests`, `/staff/records`, `/staff/residents`, `/staff/reports`, `/staff/verify`, and all transition endpoints), then purges the account using typed `DELETE`.
3. **Step-Up Super Admin Key Preservation (401)**: Submits an invalid Super Admin Key to `PATCH /admin/settings`, confirms `401 Unauthorized`, and verifies that the admin session is NOT destroyed by asserting `GET /api/v1/auth/me` with the exact same JWT still returns `200 OK`.
