const path = require('path');
const dotenv = require('dotenv');
const { maskSecret } = require('../utils/masker');

// Load environment variables from backend root .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Universal config resolver
 * Chooses CUSTOM_* if defined and non-empty, otherwise falls back to DEFAULT_*
 */
function resolveSetting(customKey, defaultKey) {
  const customVal = process.env[customKey];
  const defaultVal = process.env[defaultKey];
  const hasCustom = Boolean(customVal && customVal.trim());
  return {
    value: hasCustom ? customVal.trim() : (defaultVal ? defaultVal.trim() : ''),
    source: hasCustom ? 'custom' : 'default',
    is_custom: hasCustom,
  };
}

/**
 * Enforces critical environment invariants on startup
 */
function validateConfig() {
  const suAdminKey = process.env.SU_ADMIN_KEY;
  if (!suAdminKey || !suAdminKey.trim()) {
    throw new Error(
      '[Config] Fatal Error: SU_ADMIN_KEY is missing in .env. Please define SU_ADMIN_KEY before running the server or seeder.'
    );
  }
}

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // Database
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/quickfile',

  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'quickfile_default_development_jwt_secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // Frontend URL
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Super Admin Key (Strictly from .env; no hardcoded fallback)
  getSuAdminKey: () => (process.env.SU_ADMIN_KEY ? process.env.SU_ADMIN_KEY.trim() : ''),

  // Jurisdiction info (Requirement 5)
  jurisdiction: {
    barangayName: () => process.env.BARANGAY_NAME || 'Barangay San Antonio',
    cityMunicipality: () => process.env.CITY_MUNICIPALITY || 'Pasig City',
    province: () => process.env.PROVINCE || 'Metro Manila',
  },

  // Storage directory for uploads
  uploadDir: path.resolve(__dirname, '../uploads'),

  // Default seed accounts (Strictly from .env)
  seed: {
    adminEmail: process.env.DEFAULT_ADMIN_EMAIL || 'admin@quickfile.gov.ph',
    adminPassword: process.env.DEFAULT_ADMIN_PASSWORD || '',
    staffEmail: process.env.DEFAULT_STAFF_EMAIL || 'staff@quickfile.gov.ph',
    staffPassword: process.env.DEFAULT_STAFF_PASSWORD || '',
    citizenEmail: process.env.DEFAULT_CITIZEN_EMAIL || 'citizen@quickfile.gov.ph',
    citizenPassword: process.env.DEFAULT_CITIZEN_PASSWORD || '',
  },

  // Integration resolvers
  google: {
    resolveClientId: () => resolveSetting('CUSTOM_GOOGLE_CLIENT_ID', 'DEFAULT_GOOGLE_CLIENT_ID'),
    resolveClientSecret: () => resolveSetting('CUSTOM_GOOGLE_CLIENT_SECRET', 'DEFAULT_GOOGLE_CLIENT_SECRET'),
  },

  sms: {
    resolveGatewayUrl: () => resolveSetting('CUSTOM_SMS_GATEWAY_URL', 'DEFAULT_SMS_GATEWAY_URL'),
    resolveApiToken: () => resolveSetting('CUSTOM_SMS_API_TOKEN', 'DEFAULT_SMS_API_TOKEN'),
    resolveSenderId: () => resolveSetting('CUSTOM_SMS_SENDER_ID', ''),
  },

  smtp: {
    resolveHost: () => resolveSetting('CUSTOM_SMTP_HOST', 'DEFAULT_SMTP_HOST'),
    resolvePort: () => {
      const res = resolveSetting('CUSTOM_SMTP_PORT', 'DEFAULT_SMTP_PORT');
      return { value: parseInt(res.value, 10) || 587, source: res.source };
    },
    resolveSecure: () => {
      const res = resolveSetting('CUSTOM_SMTP_SECURE', 'DEFAULT_SMTP_SECURE');
      return { value: res.value === 'true', source: res.source };
    },
    resolveUser: () => resolveSetting('CUSTOM_SMTP_USER', 'DEFAULT_SMTP_USER'),
    resolvePass: () => resolveSetting('CUSTOM_SMTP_PASS', 'DEFAULT_SMTP_PASS'),
    resolveFromName: () => resolveSetting('CUSTOM_SMTP_FROM_NAME', 'DEFAULT_SMTP_FROM_NAME'),
    resolveFromEmail: () => resolveSetting('CUSTOM_SMTP_FROM_EMAIL', 'DEFAULT_SMTP_FROM_EMAIL'),
  },

  recaptcha: {
    resolveSiteKey: () => resolveSetting('CUSTOM_RECAPTCHA_SITE_KEY', 'DEFAULT_RECAPTCHA_SITE_KEY'),
    resolveSecretKey: () => resolveSetting('CUSTOM_RECAPTCHA_SECRET_KEY', 'DEFAULT_RECAPTCHA_SECRET_KEY'),
  },

  restApi: {
    resolveSecretKey: () => resolveSetting('CUSTOM_REST_API_SECRET_KEY', 'DEFAULT_REST_API_SECRET_KEY'),
  },

  /**
   * Safe summary of integrations for frontend settings page
   * Returns masked keys and source indicators ('default' | 'custom')
   * Never leaks raw secrets!
   */
  getSafeIntegrationSummary: () => {
    const googleId = resolveSetting('CUSTOM_GOOGLE_CLIENT_ID', 'DEFAULT_GOOGLE_CLIENT_ID');
    const googleSecret = resolveSetting('CUSTOM_GOOGLE_CLIENT_SECRET', 'DEFAULT_GOOGLE_CLIENT_SECRET');

    const smsUrl = resolveSetting('CUSTOM_SMS_GATEWAY_URL', 'DEFAULT_SMS_GATEWAY_URL');
    const smsToken = resolveSetting('CUSTOM_SMS_API_TOKEN', 'DEFAULT_SMS_API_TOKEN');

    const smtpHost = resolveSetting('CUSTOM_SMTP_HOST', 'DEFAULT_SMTP_HOST');
    const smtpUser = resolveSetting('CUSTOM_SMTP_USER', 'DEFAULT_SMTP_USER');
    const smtpPass = resolveSetting('CUSTOM_SMTP_PASS', 'DEFAULT_SMTP_PASS');

    const rcSite = resolveSetting('CUSTOM_RECAPTCHA_SITE_KEY', 'DEFAULT_RECAPTCHA_SITE_KEY');
    const rcSecret = resolveSetting('CUSTOM_RECAPTCHA_SECRET_KEY', 'DEFAULT_RECAPTCHA_SECRET_KEY');

    const apiSecret = resolveSetting('CUSTOM_REST_API_SECRET_KEY', 'DEFAULT_REST_API_SECRET_KEY');

    return {
      google: {
        source: googleId.source,
        client_id: maskSecret(googleId.value),
        client_secret: maskSecret(googleSecret.value),
      },
      sms: {
        source: smsToken.source,
        gateway_url: smsUrl.value,
        api_token: maskSecret(smsToken.value),
      },
      smtp: {
        source: smtpUser.source,
        host: smtpHost.value,
        user: maskSecret(smtpUser.value),
        pass: maskSecret(smtpPass.value),
      },
      recaptcha: {
        source: rcSite.source,
        site_key: maskSecret(rcSite.value),
        secret_key: maskSecret(rcSecret.value),
      },
      rest_api: {
        source: apiSecret.source,
        secret_key: maskSecret(apiSecret.value),
      },
    };
  },
};

// Attach helper functions to config object for backward-compatible destructuring
config.config = config;
config.validateConfig = validateConfig;
config.resolveSetting = resolveSetting;

module.exports = config;

