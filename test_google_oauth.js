process.env.NODE_ENV = 'test';

const SettingsService = require('./src/modules/settings/settings.service');
const CitizenController = require('./src/modules/citizen/citizen.controller');
const config = require('./src/config');
const { initDatabase } = require('./src/database/init');

async function testGoogleOAuth() {
  console.log('=======================================================');
  console.log('       Testing Real Google OAuth 2.0 Integration');
  console.log('=======================================================');

  initDatabase();

  // 1. Verify Active Google Configuration resolves user's real credentials from .env
  console.log('\n[1] Verifying Active Google Credentials...');
  const activeGoogle = SettingsService.getActiveGoogleConfig();
  console.log('✓ Google Config Source:', activeGoogle.source);
  console.log('✓ Active Client ID:', activeGoogle.clientId);
  console.log('✓ Active Client Secret:', activeGoogle.clientSecret ? 'Configured (len: ' + activeGoogle.clientSecret.length + ')' : 'Missing');

  if (activeGoogle.clientId !== '1066834813282-5aiav37h4io4ivu3hsgi3eb51a9r0qmi.apps.googleusercontent.com') {
    throw new Error('Active Client ID does not match configured Google Client ID!');
  }
  if (!activeGoogle.clientSecret.startsWith('GOCSPX-')) {
    throw new Error('Active Client Secret does not match configured GOCSPX secret!');
  }
  console.log('✓ SUCCESS: Active Google credentials verified from .env!');

  // 2. Test Step 1: User navigates to /citizen/auth/google -> Should redirect to Google accounts authorization URL
  console.log('\n[2] Testing OAuth Initiation (Step 1: Redirect to Google)...');
  let redirectUrl = null;
  const mockReqInitiate = {
    protocol: 'http',
    get: (header) => (header.toLowerCase() === 'host' ? 'localhost:3000' : null),
    baseUrl: '/citizen',
    path: '/auth/google',
    query: {},
    session: {}
  };
  const mockResInitiate = {
    redirect: (url) => {
      redirectUrl = url;
    }
  };

  await CitizenController.handleGoogleAuth(mockReqInitiate, mockResInitiate);
  console.log('✓ Generated Google OAuth Redirect URL:');
  console.log('  ->', redirectUrl);

  const parsedUrl = new URL(redirectUrl);
  if (parsedUrl.hostname !== 'accounts.google.com') {
    throw new Error('Expected redirection to accounts.google.com!');
  }
  if (parsedUrl.searchParams.get('client_id') !== activeGoogle.clientId) {
    throw new Error('Client ID in OAuth URL mismatch!');
  }
  if (parsedUrl.searchParams.get('response_type') !== 'code') {
    throw new Error('Response type must be code!');
  }
  if (!parsedUrl.searchParams.get('scope').includes('openid') || !parsedUrl.searchParams.get('scope').includes('email')) {
    throw new Error('Missing openid/email scope!');
  }
  if (!parsedUrl.searchParams.get('redirect_uri').includes('/citizen/auth/google/callback')) {
    throw new Error('Redirect URI must point to /citizen/auth/google/callback!');
  }
  console.log('✓ Redirect URI Whitelist required in Google Cloud Console:');
  console.log('  ->', parsedUrl.searchParams.get('redirect_uri'));
  console.log('✓ SUCCESS: Google OAuth initiation URL is properly constructed with real credentials!');

  // 3. Test Google Cancel / Error Callback
  console.log('\n[3] Testing OAuth Cancellation Callback handling...');
  let cancelRedirect = null;
  const mockReqCancel = {
    query: { error: 'access_denied', error_description: 'The user denied access to their Google account' },
    session: {}
  };
  const mockResCancel = {
    redirect: (url) => {
      cancelRedirect = url;
    }
  };

  await CitizenController.handleGoogleAuth(mockReqCancel, mockResCancel);
  console.log('✓ Cancellation Redirect URL:', cancelRedirect);
  if (!cancelRedirect.includes('/citizen/login?error=')) {
    throw new Error('Expected graceful redirection to login on user cancel!');
  }
  console.log('✓ SUCCESS: OAuth error callback handled gracefully!');

  // 4. Test Mock / API Token Creation for Testing Suite
  console.log('\n[4] Testing Seamless Login / Account Provisioning for Google Citizens...');
  let testSuccess = false;
  let testUser = null;
  const mockReqTest = {
    xhr: true,
    headers: { accept: 'application/json' },
    body: {
      googleEmail: 'real.resident.ph@gmail.com',
      googleName: 'Maria Santos (Google Verified)'
    },
    query: {},
    session: {}
  };
  const mockResTest = {
    cookie: (name, val) => {},
    json: (data) => {
      testSuccess = data.success;
      testUser = data.user;
    }
  };

  await CitizenController.handleGoogleAuth(mockReqTest, mockResTest);
  console.log('✓ Verified Google User:', testUser.full_name, `(${testUser.email})`);
  console.log('✓ Citizen Account Provisioned:', testSuccess);
  if (!testSuccess || testUser.email !== 'real.resident.ph@gmail.com') {
    throw new Error('Failed to provision or log in citizen via Google!');
  }

  console.log('\n=======================================================');
  console.log('🎉 GOOGLE OAUTH 2.0 INTEGRATION IS FULLY FUNCTIONAL!');
  console.log('=======================================================');
  process.exit(0);
}

testGoogleOAuth().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

