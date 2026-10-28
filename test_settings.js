process.env.NODE_ENV = 'test';

const SettingsService = require('./src/modules/settings/settings.service');
const AdminService = require('./src/modules/admin/admin.service');
const CitizenController = require('./src/modules/citizen/citizen.controller');
const SettingsController = require('./src/modules/settings/settings.controller');
const Mailer = require('./src/utils/mailer');
const config = require('./src/config');
const { initDatabase } = require('./src/database/init');

async function testAppSettings() {
  console.log('--- Testing App Settings & Dual-Tier API Management ---');
  initDatabase();

  const adminLogin = await AdminService.login('admin@quickfile.gov.ph', 'Admin@123456');
  console.log('✓ Admin authenticated:', adminLogin.admin.fullName);

  // 1. Initial State: Google Auth should be disabled
  console.log('\n[1] Checking initial Google Auth state...');
  SettingsService.updateIntegrationSettings(adminLogin.admin, {
    google_auth_enabled: '0',
    google_config_source: 'default',
    custom_google_client_id: '',
    custom_google_client_secret: ''
  });
  console.log('✓ Google Auth Enabled:', SettingsService.isFeatureEnabled('google_auth_enabled'));

  // Simulate citizen attempting Google sign-in when disabled
  console.log('\n[2] Attempting Google Auth when DISABLED...');
  let mockStatus = 0;
  let mockResponse = null;
  const mockReqDisabled = {
    xhr: true,
    headers: { accept: 'application/json' },
    body: { googleEmail: 'google.test@gmail.com' },
    query: {}
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

  // 2. Dual-Tier SMTP Architecture Testing (Developer Default vs Client Custom)
  console.log('\n[3] Testing Dual-Tier SMTP API Configuration...');
  // A. Developer Default Mode
  SettingsService.updateIntegrationSettings(adminLogin.admin, {
    smtp_config_source: 'default'
  });
  let activeSmtp = SettingsService.getActiveSmtpConfig();
  console.log('✓ Active SMTP Source:', activeSmtp.source);
  console.log('✓ Active SMTP Host:', activeSmtp.host);
  console.log('✓ Active SMTP User:', activeSmtp.user);
  if (activeSmtp.source !== 'default' || activeSmtp.user !== config.defaultSmtp.user) {
    throw new Error('Expected active SMTP to use Developer Default presets!');
  }

  // B. Switch to Client Custom API Mode
  console.log('\n[4] Switching SMTP to Client Custom API...');
  SettingsService.updateIntegrationSettings(adminLogin.admin, {
    smtp_config_source: 'custom',
    custom_smtp_host: 'mail.barangaycentral.gov.ph',
    custom_smtp_port: '587',
    custom_smtp_secure: '0',
    custom_smtp_user: 'admin@barangaycentral.gov.ph',
    custom_smtp_pass: 'SecretBarangayPass2026',
    custom_smtp_from: '"Barangay Central Official" <admin@barangaycentral.gov.ph>'
  });
  activeSmtp = SettingsService.getActiveSmtpConfig();
  console.log('✓ Active SMTP Source:', activeSmtp.source);
  console.log('✓ Active SMTP Host:', activeSmtp.host);
  console.log('✓ Active SMTP User:', activeSmtp.user);
  if (activeSmtp.source !== 'custom' || activeSmtp.host !== 'mail.barangaycentral.gov.ph' || activeSmtp.user !== 'admin@barangaycentral.gov.ph') {
    throw new Error('Expected active SMTP to switch to Client Custom API credentials!');
  }

  // C. Test Transporter instantiation with custom configuration
  const transporter = Mailer.getTransporter();
  console.log('✓ Mailer dynamically created transporter for host:', transporter.options.host);
  if (transporter.options.host !== 'mail.barangaycentral.gov.ph') {
    throw new Error('Transporter did not receive dynamic custom host!');
  }

  // D. Test Fallback when custom fields are empty
  SettingsService.updateIntegrationSettings(adminLogin.admin, {
    smtp_config_source: 'custom',
    custom_smtp_host: '',
    custom_smtp_user: ''
  });
  const fallbackSmtp = SettingsService.getActiveSmtpConfig();
  console.log('✓ Graceful Fallback Source when empty:', fallbackSmtp.source, `(Fallback triggered: ${fallbackSmtp.isFallback})`);
  if (!fallbackSmtp.isFallback) {
    throw new Error('Expected graceful fallback to developer default when custom fields are empty!');
  }

  // E. Revert to Developer Default
  SettingsService.updateIntegrationSettings(adminLogin.admin, {
    smtp_config_source: 'default'
  });
  activeSmtp = SettingsService.getActiveSmtpConfig();
  console.log('✓ Reverted to SMTP Source:', activeSmtp.source, `(${activeSmtp.user})`);

  // 3. Dual-Tier Google OAuth Testing
  console.log('\n[5] Testing Dual-Tier Google OAuth API...');
  SettingsService.updateIntegrationSettings(adminLogin.admin, {
    google_auth_enabled: '1',
    google_config_source: 'custom',
    custom_google_client_id: 'client-custom-google-id-998877.apps.googleusercontent.com',
    custom_google_client_secret: 'client_custom_secret_123'
  });
  const activeGoogle = SettingsService.getActiveGoogleConfig();
  console.log('✓ Active Google Source:', activeGoogle.source);
  console.log('✓ Active Google Client ID:', activeGoogle.clientId);
  if (activeGoogle.source !== 'custom' || activeGoogle.clientId !== 'client-custom-google-id-998877.apps.googleusercontent.com') {
    throw new Error('Expected active Google to use Client Custom credentials!');
  }

  // Simulate citizen attempting Google sign-in when enabled with custom API
  let loginSuccess = false;
  let loggedInUser = null;
  const mockReqEnabled = {
    xhr: true,
    headers: { accept: 'application/json' },
    body: { googleEmail: 'juandelacruz.google@gmail.com', googleName: 'Juan Dela Cruz (Google)' },
    query: {}
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

  // Revert Google OAuth back to developer default
  SettingsService.updateIntegrationSettings(adminLogin.admin, {
    google_auth_enabled: '1',
    google_config_source: 'default',
    custom_google_client_id: '',
    custom_google_client_secret: ''
  });
  console.log('✓ Restored Google Auth to Developer Default preset');

  // 4. Test REST API Gateway Dual-Tier Architecture & Key Resolution
  console.log('\n[6] Testing REST API Gateway & Key Resolution...');
  // A. Check Default API Key
  SettingsService.updateIntegrationSettings(adminLogin.admin, {
    api_config_source: 'default'
  });
  let activeApi = SettingsService.getActiveApiConfig();
  console.log('✓ Active API Key Source:', activeApi.source);
  console.log('✓ Active API Secret:', activeApi.secretKey);
  if (activeApi.source !== 'default' || !activeApi.secretKey) {
    throw new Error('Expected default API secret key!');
  }

  // B. Check Custom API Key
  SettingsService.updateIntegrationSettings(adminLogin.admin, {
    api_config_source: 'custom',
    custom_api_secret_key: 'qf_live_custom_barangay_secret_999'
  });
  activeApi = SettingsService.getActiveApiConfig();
  console.log('✓ Active API Key Source:', activeApi.source);
  console.log('✓ Active API Secret:', activeApi.secretKey);
  if (activeApi.source !== 'custom' || activeApi.secretKey !== 'qf_live_custom_barangay_secret_999') {
    throw new Error('Expected custom API secret key!');
  }

  // 5. Test REST API Gateway Enable & Disable Guard (OTH-ASI)
  console.log('\n[7] Testing REST API Gateway Guard & Controller Toggle...');
  // Disable API
  SettingsService.updateIntegrationSettings(adminLogin.admin, {
    ...SettingsService.getIntegrationSettings().raw,
    api_enabled: '0'
  });
  console.log('✓ API Enabled state:', SettingsService.isApiEnabled());
  if (SettingsService.isApiEnabled() !== false) {
    throw new Error('API should be disabled!');
  }

  // Test Quick Toggle Action: 0 -> 1
  let toggleResData = null;
  const mockReqToggle = {
    user: adminLogin.admin,
    xhr: true,
    headers: { accept: 'application/json' },
    query: {}
  };
  const mockResToggle = {
    json: (data) => { toggleResData = data; },
    redirect: () => {}
  };

  SettingsController.toggleApi(mockReqToggle, mockResToggle);
  console.log('✓ Toggle #1 result:', toggleResData?.message, `(apiEnabled: ${toggleResData?.apiEnabled})`);
  if (toggleResData?.apiEnabled !== true) {
    throw new Error('Failed to toggle API from disabled to enabled!');
  }

  // Test Quick Toggle Action: 1 -> 0
  SettingsController.toggleApi(mockReqToggle, mockResToggle);
  console.log('✓ Toggle #2 result:', toggleResData?.message, `(apiEnabled: ${toggleResData?.apiEnabled})`);
  if (toggleResData?.apiEnabled !== false) {
    throw new Error('Failed to toggle API from enabled back to disabled!');
  }

  // Re-enable API
  SettingsController.toggleApi(mockReqToggle, mockResToggle);
  console.log('✓ Final API Enabled state:', SettingsService.isApiEnabled());

  // 6. Test Dual-Tier SMS Gateway
  console.log('\n[8] Testing Dual-Tier SMS Gateway...');
  SettingsService.updateIntegrationSettings(adminLogin.admin, {
    sms_config_source: 'custom',
    custom_sms_provider: 'Twilio',
    custom_sms_api_key: 'twilio_auth_custom_key_123',
    custom_sms_sender_id: 'BRGY_SAN_ISIDRO'
  });
  const activeSms = SettingsService.getActiveSmsConfig();
  console.log('✓ Active SMS Source:', activeSms.source);
  console.log('✓ Active SMS Provider:', activeSms.provider);
  console.log('✓ Active SMS Sender ID:', activeSms.senderId);
  if (activeSms.source !== 'custom' || activeSms.provider !== 'Twilio' || activeSms.senderId !== 'BRGY_SAN_ISIDRO') {
    throw new Error('Expected active SMS to use Client Custom credentials!');
  }

  console.log('\n=======================================================');
  console.log('🎉 ALL APP SETTINGS & DUAL-TIER API TESTS PASSED 100%!');
  console.log('=======================================================');
  process.exit(0);
}

testAppSettings().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
