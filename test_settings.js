const SettingsService = require('./src/modules/settings/settings.service');
const AdminService = require('./src/modules/admin/admin.service');
const CitizenController = require('./src/modules/citizen/citizen.controller');
const { initDatabase } = require('./src/database/init');

async function testAppSettings() {
  console.log('--- Testing App Settings & Pluggable Integrations ---');
  initDatabase();

  const adminLogin = await AdminService.login('admin@quickfile.gov.ph', 'Admin@123456');
  console.log('✓ Admin authenticated:', adminLogin.admin.fullName);

  // 1. Initial State: Google Auth should be disabled
  console.log('\n[1] Checking initial Google Auth state...');
  SettingsService.updateIntegrationSettings(adminLogin.admin, {
    google_auth_enabled: '0',
    google_client_id: '',
    google_client_secret: ''
  });
  console.log('✓ Google Auth Enabled:', SettingsService.isFeatureEnabled('google_auth_enabled'));

  // Simulate citizen attempting Google sign-in when disabled
  console.log('\n[2] Attempting Google Auth when DISABLED...');
  let mockStatus = 0;
  let mockResponse = null;
  const mockReqDisabled = {
    xhr: true,
    headers: { accept: 'application/json' },
    body: { googleEmail: 'google.test@gmail.com' }
  };
  const mockResDisabled = {
    status: (code) => {
      mockStatus = code;
      return {
        json: (data) => {
          mockResponse = data;
        }
      };
    },
    redirect: (url) => {
      mockResponse = { redirectUrl: url };
    }
  };

  await CitizenController.handleGoogleAuth(mockReqDisabled, mockResDisabled);
  console.log(`✓ Status code: ${mockStatus}`);
  console.log(`✓ Response message: "${mockResponse?.message}"`);
  if (mockStatus === 403 && mockResponse?.message.includes('disabled')) {
    console.log('✓ SUCCESS: Google sign-in was blocked because Google Auth is disabled!');
  } else {
    throw new Error('Failed to block Google sign-in when disabled!');
  }

  // 2. Enable Google Auth via App Settings
  console.log('\n[3] Admin ENABLES Google Auth in App Settings...');
  const updatedSettings = SettingsService.updateIntegrationSettings(adminLogin.admin, {
    google_auth_enabled: '1',
    google_client_id: 'test-google-client-id-12345.apps.googleusercontent.com',
    google_client_secret: 'test-secret'
  });
  console.log('✓ Settings updated! googleAuthEnabled:', updatedSettings.googleAuthEnabled);
  console.log('✓ Client ID configured:', updatedSettings.googleClientId);

  // Simulate citizen attempting Google sign-in when enabled
  console.log('\n[4] Attempting Google Auth when ENABLED...');
  let loginSuccess = false;
  let loggedInUser = null;
  const mockReqEnabled = {
    xhr: true,
    headers: { accept: 'application/json' },
    body: { googleEmail: 'juandelacruz.google@gmail.com', googleName: 'Juan Dela Cruz (Google)' }
  };
  const mockResEnabled = {
    status: (code) => mockResEnabled,
    cookie: (name, val) => {},
    session: {},
    json: (data) => {
      loginSuccess = data.success;
      loggedInUser = data.user;
    },
    redirect: () => {}
  };

  await CitizenController.handleGoogleAuth(mockReqEnabled, mockResEnabled);
  console.log('✓ Google Sign-In Success:', loginSuccess);
  console.log('✓ Authenticated User:', loggedInUser?.full_name, `(${loggedInUser?.email})`);
  if (!loginSuccess) {
    throw new Error('Failed to authenticate via Google when enabled!');
  }

  // 3. Admin DISABLES Google Auth again (manual sign-in only)
  console.log('\n[5] Admin DISABLES Google Auth back (Manual Sign-In Mode)...');
  SettingsService.updateIntegrationSettings(adminLogin.admin, {
    google_auth_enabled: '0'
  });
  console.log('✓ Google Auth Enabled:', SettingsService.isFeatureEnabled('google_auth_enabled'));

  // Verify blocked again
  mockStatus = 0;
  mockResponse = null;
  await CitizenController.handleGoogleAuth(mockReqDisabled, mockResDisabled);
  console.log(`✓ Blocked again with status ${mockStatus}: "${mockResponse?.message}"`);

  // 4. Test REST API Gateway Enable / Disable via App Settings (OTH-ASI)
  console.log('\n[OTH-ASI] Testing REST API Gateway Enable & Disable (App Settings & Integration Management)...');
  const app = require('./app');
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // Disable API
    console.log('-> Admin DISABLES REST API in App Settings...');
    const apiDisabledSettings = SettingsService.updateIntegrationSettings(adminLogin.admin, {
      ...SettingsService.getIntegrationSettings().raw,
      api_enabled: '0'
    });
    console.log('✓ API Enabled state:', apiDisabledSettings.apiEnabled);
    console.log('✓ SettingsService.isApiEnabled():', SettingsService.isApiEnabled());

    // Send request to /api/verify while DISABLED
    const disabledApiResponse = await fetch(`${baseUrl}/api/verify`);
    console.log(`✓ GET /api/verify response status: ${disabledApiResponse.status}`);
    const disabledJson = await disabledApiResponse.json();
    console.log(`✓ Response error payload:`, disabledJson);
    if (disabledApiResponse.status === 503 && disabledJson.error === 'API_DISABLED') {
      console.log('✓ SUCCESS: REST API endpoint properly returned 503 Service Unavailable when API was disabled!');
    } else {
      throw new Error(`Expected 503 API_DISABLED, received: ${disabledApiResponse.status}`);
    }

    // Normal web UI should still be accessible
    const webUiResponse = await fetch(`${baseUrl}/verify`);
    console.log(`✓ Internal Web UI (GET /verify) status: ${webUiResponse.status} (Unimpaired by API disabled state)`);
    if (webUiResponse.status !== 200) {
      throw new Error('Web UI should remain accessible even when /api is disabled!');
    }

    // Enable API
    console.log('\n-> Admin ENABLES REST API in App Settings...');
    const apiEnabledSettings = SettingsService.updateIntegrationSettings(adminLogin.admin, {
      ...SettingsService.getIntegrationSettings().raw,
      api_enabled: '1',
      api_secret_key: 'test_key_12345'
    });
    console.log('✓ API Enabled state:', apiEnabledSettings.apiEnabled);
    console.log('✓ Configured API Secret:', apiEnabledSettings.apiSecretKey);

    // Send request to /api/verify while ENABLED
    const enabledApiResponse = await fetch(`${baseUrl}/api/verify`);
    console.log(`✓ GET /api/verify response status: ${enabledApiResponse.status}`);
    if (enabledApiResponse.status === 200) {
      console.log('✓ SUCCESS: REST API endpoint returned 200 OK when API was enabled!');
    } else {
      throw new Error(`Expected 200 OK, received: ${enabledApiResponse.status}`);
    }

    // Test Quick Toggle Action
    console.log('\n-> Testing Quick Toggle API Controller Action (/admin/settings/toggle-api)...');
    const SettingsController = require('./src/modules/settings/settings.controller');
    let toggleResData = null;
    const mockReqToggle = {
      user: adminLogin.admin,
      xhr: true,
      headers: { accept: 'application/json' }
    };
    const mockResToggle = {
      json: (data) => { toggleResData = data; },
      redirect: () => {}
    };

    // Toggle 1: Enabled -> Disabled
    SettingsController.toggleApi(mockReqToggle, mockResToggle);
    console.log('✓ Toggle #1 result:', toggleResData?.message, `(apiEnabled: ${toggleResData?.apiEnabled})`);
    if (toggleResData?.apiEnabled !== false) {
      throw new Error('Failed to toggle API from enabled to disabled!');
    }

    // Toggle 2: Disabled -> Enabled
    SettingsController.toggleApi(mockReqToggle, mockResToggle);
    console.log('✓ Toggle #2 result:', toggleResData?.message, `(apiEnabled: ${toggleResData?.apiEnabled})`);
    if (toggleResData?.apiEnabled !== true) {
      throw new Error('Failed to toggle API from disabled back to enabled!');
    }

    console.log('✓ SUCCESS: Quick API toggle action fully verified!');
  } finally {
    server.close();
  }

  console.log('\n=======================================================');
  console.log('🎉 APP SETTINGS & PLUGGABLE INTEGRATIONS VERIFIED!');
  console.log('=======================================================');
}

testAppSettings().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

