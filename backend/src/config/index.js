const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from backend root .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

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

  // Frontend URL (for CORS and password reset email links)
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Super Admin PIN (Strictly from .env; no hardcoded fallback)
  superAdminPin: process.env.SUPER_ADMIN_PIN || '',

  // Storage directory for uploads
  uploadDir: path.resolve(__dirname, '../uploads'),

  // Default seed accounts
  seed: {
    adminEmail: process.env.DEFAULT_ADMIN_EMAIL || 'admin@quickfile.gov.ph',
    adminPassword: process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123456',
    staffEmail: process.env.DEFAULT_STAFF_EMAIL || 'staff@quickfile.gov.ph',
    staffPassword: process.env.DEFAULT_STAFF_PASSWORD || 'Staff@123456',
    citizenEmail: process.env.DEFAULT_CITIZEN_EMAIL || 'citizen@quickfile.gov.ph',
    citizenPassword: process.env.DEFAULT_CITIZEN_PASSWORD || 'Citizen@123456',
  },

  // Integration resolution helpers
  google: {
    getClientId: () => process.env.CUSTOM_GOOGLE_CLIENT_ID || process.env.DEFAULT_GOOGLE_CLIENT_ID || '',
    getClientSecret: () => process.env.CUSTOM_GOOGLE_CLIENT_SECRET || process.env.DEFAULT_GOOGLE_CLIENT_SECRET || '',
  },

  sms: {
    getGatewayUrl: () => process.env.CUSTOM_SMS_GATEWAY_URL || process.env.DEFAULT_SMS_GATEWAY_URL || 'https://dashboard.philsms.com/api/v3/',
    getApiToken: () => process.env.CUSTOM_SMS_API_TOKEN || process.env.DEFAULT_SMS_API_TOKEN || '',
    getSenderId: () => process.env.CUSTOM_SMS_SENDER_ID || '',
  },

  smtp: {
    getHost: () => process.env.CUSTOM_SMTP_HOST || process.env.DEFAULT_SMTP_HOST || 'smtp.gmail.com',
    getPort: () => parseInt(process.env.CUSTOM_SMTP_PORT || process.env.DEFAULT_SMTP_PORT, 10) || 587,
    getSecure: () => (process.env.CUSTOM_SMTP_SECURE || process.env.DEFAULT_SMTP_SECURE) === 'true',
    getUser: () => process.env.CUSTOM_SMTP_USER || process.env.DEFAULT_SMTP_USER || '',
    getPass: () => process.env.CUSTOM_SMTP_PASS || process.env.DEFAULT_SMTP_PASS || '',
    getFromName: () => process.env.CUSTOM_SMTP_FROM_NAME || process.env.DEFAULT_SMTP_FROM_NAME || 'QuickFile',
    getFromEmail: () => process.env.CUSTOM_SMTP_FROM_EMAIL || process.env.DEFAULT_SMTP_FROM_EMAIL || '',
  },

  recaptcha: {
    getSiteKey: () => process.env.CUSTOM_RECAPTCHA_SITE_KEY || process.env.DEFAULT_RECAPTCHA_SITE_KEY || '',
    getSecretKey: () => process.env.CUSTOM_RECAPTCHA_SECRET_KEY || process.env.DEFAULT_RECAPTCHA_SECRET_KEY || '',
  },

  restApi: {
    getSecretKey: () => process.env.CUSTOM_REST_API_SECRET_KEY || process.env.DEFAULT_REST_API_SECRET_KEY || 'quickfile_default_external_api_key_2026',
  },
};

module.exports = config;
