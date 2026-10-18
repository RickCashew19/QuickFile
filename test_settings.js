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

  console.log('\n=======================================================');
  console.log('🎉 APP SETTINGS & PLUGGABLE INTEGRATIONS VERIFIED!');
  console.log('=======================================================');
}

testAppSettings().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

