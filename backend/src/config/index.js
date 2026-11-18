const path = require('path');
const dotenv = require('dotenv');
const { maskSecret } = require('../helpers/masker');

function getEnvFilePath() {
  return process.env.ENV_FILE ? path.resolve(process.env.ENV_FILE) : path.resolve(__dirname, '../../.env');
}

// Load environment variables from ENV_FILE if set, otherwise backend/.env
dotenv.config({ path: getEnvFilePath() });

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
 * Halts immediately if critical security or jurisdiction variables are missing
 */
function validateConfig() {
  const mongoUriVal = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUriVal || !mongoUriVal.trim()) {
    throw new Error('[Config] Fatal Error: MONGODB_URI or MONGO_URI (MongoDB Connection URI) is missing in .env.');
  }

  const requiredVars = [
    { key: 'SU_ADMIN_KEY', label: 'Super Admin Key' },
    { key: 'JWT_SECRET', label: 'JWT Secret' },
    { key: 'BARANGAY_NAME', label: 'Barangay Name' },
    { key: 'CITY_MUNICIPALITY', label: 'City/Municipality' },
    { key: 'PROVINCE', label: 'Province' },
  ];

  for (const { key, label } of requiredVars) {
    const val = process.env[key];
    if (!val || !val.trim()) {
      throw new Error(`[Config] Fatal Error: ${key} (${label}) is missing in .env.`);
    }
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const jwtSecret = process.env.JWT_SECRET ? process.env.JWT_SECRET.trim() : '';

  if (isProduction) {
    if (jwtSecret.length < 32) {
      throw new Error('[Config] Fatal Error: In production, JWT_SECRET must be at least 32 characters long.');
    }

    for (const { key, label } of requiredVars) {
      const val = process.env[key] ? process.env[key].trim() : '';
      if (val.toLowerCase().startsWith('change_me')) {
        throw new Error(`[Config] Fatal Error: In production, ${key} (${label}) cannot use placeholder value starting with "change_me".`);
      }
    }

    const rawTrustProxy = process.env.TRUST_PROXY ? process.env.TRUST_PROXY.trim().toLowerCase() : '';
    if (rawTrustProxy === 'true') {
      throw new Error('[Config] Fatal Error: In production, TRUST_PROXY cannot be "true". A specific hop count (e.g. 1) or "false" is required.');
    }
    if (
      rawTrustProxy &&
      rawTrustProxy !== 'false' &&
      (!/^\d+$/.test(rawTrustProxy) || parseInt(rawTrustProxy, 10) < 1)
    ) {
      throw new Error('[Config] Fatal Error: In production, TRUST_PROXY must be "false" or a positive integer hop count (e.g. 1).');
    }

    const publicUrl = process.env.PUBLIC_APP_URL ? process.env.PUBLIC_APP_URL.trim() : '';
    if (!publicUrl || publicUrl.includes('localhost') || publicUrl.includes('127.0.0.1')) {
      throw new Error('[Config] Fatal Error: In production, PUBLIC_APP_URL is required and cannot be a localhost address.');
    }
  }

  // Refresh absolute cap must exceed the idle window, otherwise sessions could
  // never be slid forward (or would behave inconsistently).
  const idleDays = parsePositiveDays(process.env.REFRESH_TOKEN_IDLE_DAYS, 7);
  const absoluteDays = parsePositiveDays(process.env.REFRESH_TOKEN_ABSOLUTE_DAYS, 30);
  if (absoluteDays <= idleDays) {
    throw new Error('[Config] Fatal Error: REFRESH_TOKEN_ABSOLUTE_DAYS must be greater than REFRESH_TOKEN_IDLE_DAYS.');
  }
}

/**
 * Parses TRUST_PROXY into boolean or integer hop count
 */
function parseTrustProxy(val) {
  if (!val) return false;
  const trimmed = String(val).trim().toLowerCase();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  const num = parseInt(trimmed, 10);
  if (!isNaN(num)) return num;
  return false;
}

function parseCertificateValidityDays() {
  const raw = process.env.CERTIFICATE_VALIDITY_DAYS;
  if (raw === undefined || raw === null || raw === '') return 180;
  const parsed = parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 180;
}

/**
 * Converts a JWT expiresIn string (e.g. "15m", "7d", "3600") to milliseconds
 * so the browser cookie lifetime always matches the token lifetime.
 */
function parseJwtDurationMs(raw, fallbackMs) {
  const match = /^(\d+)\s*(s|m|h|d)?$/i.exec(String(raw || '').trim());
  if (!match) return fallbackMs;
  const value = parseInt(match[1], 10);
  if (!Number.isFinite(value) || value <= 0) return fallbackMs;
  const multiplier = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[(match[2] || 's').toLowerCase()];
  return value * multiplier;
}

/**
 * Parses a positive whole number of days from the environment with a default.
 */
function parsePositiveDays(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  // 0 means no expiry (expires_at = null); invalid/unset values fall back to 180.
  certificateValidityDays: parseCertificateValidityDays(),
  appTimezoneOffsetMinutes: parseInt(process.env.APP_TIMEZONE_OFFSET_MINUTES, 10) || 480,
  exportDocMaxRows: parseInt(process.env.EXPORT_DOC_MAX_ROWS, 10) || 500,
  exportMaxRows: parseInt(process.env.EXPORT_MAX_ROWS, 10) || 5000,

  // Database (strictly from .env; supports MONGODB_URI or MONGO_URI; no hardcoded fallback)
  mongoUri: process.env.MONGODB_URI ? process.env.MONGODB_URI.trim() : (process.env.MONGO_URI ? process.env.MONGO_URI.trim() : ''),

  // JWT configuration (no fallback secret)
  jwt: {
    getSecret: () => process.env.JWT_SECRET || '',
    // Short-lived access token. Default lowered from 7d to 15m for the
    // access/refresh token model (RFC 9700 / OWASP ASVS).
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    expiresInMs: parseJwtDurationMs(process.env.JWT_EXPIRES_IN || '15m', 15 * 60 * 1000),
  },

  // Refresh session lifetime: sliding idle window + hard absolute cap.
  session: {
    refreshIdleDays: parsePositiveDays(process.env.REFRESH_TOKEN_IDLE_DAYS, 7),
    refreshAbsoluteDays: parsePositiveDays(process.env.REFRESH_TOKEN_ABSOLUTE_DAYS, 30),
  },

  // Frontend URL (Solely for CORS allowlist)
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Public Application URL (Single URL for QR codes & password reset links)
  publicAppUrl: process.env.PUBLIC_APP_URL
    ? process.env.PUBLIC_APP_URL.trim()
    : (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173'),

  // Super Admin Key (Strictly from .env; no hardcoded fallback)
  getSuAdminKey: () => (process.env.SU_ADMIN_KEY ? process.env.SU_ADMIN_KEY.trim() : ''),

  // Jurisdiction info (Strictly from .env; no hardcoded fallback)
  jurisdiction: {
    barangayName: () => process.env.BARANGAY_NAME || '',
    cityMunicipality: () => process.env.CITY_MUNICIPALITY || '',
    province: () => process.env.PROVINCE || '',
  },

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
    resolveSenderId: () => resolveSetting('CUSTOM_SMS_SENDER_ID', 'DEFAULT_SMS_SENDER_ID'),
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

module.exports = {
  config,
  validateConfig,
  resolveSetting,
  getEnvFilePath,
};
