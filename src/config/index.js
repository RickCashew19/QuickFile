const path = require('path');
const fs = require('fs');

// Ensure .env is always loaded from the project root regardless of where command is run
const projectRoot = path.resolve(__dirname, '../../');
const envPath = path.join(projectRoot, '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

function resolveDbPath(rawDbPath) {
  const defaultDbPath = path.join(__dirname, '../database/quickfile.db');

  if (!rawDbPath || typeof rawDbPath !== 'string' || rawDbPath.trim() === '') {
    return defaultDbPath;
  }

  const trimmed = rawDbPath.trim();

  // If path is relative, resolve relative to project root directory
  if (!path.isAbsolute(trimmed)) {
    return path.resolve(projectRoot, trimmed);
  }

  // If path is absolute, check if its directory exists on this computer
  const dir = path.dirname(trimmed);
  if (fs.existsSync(dir)) {
    return trimmed;
  }

  // Fallback for paths copied from another machine (e.g. F:\... or different user)
  console.warn(`[QuickFile Config] Configured DB_PATH directory "${dir}" does not exist on this machine.`);
  console.warn(`[QuickFile Config] Automatically falling back to local portable database: "${defaultDbPath}"`);
  return defaultDbPath;
}

const dbPath = resolveDbPath(process.env.DB_PATH);

// 1. Developer Default Presets (from .env or standard defaults)
const defaultSmtp = {
  host: process.env.DEFAULT_SMTP_HOST || process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.DEFAULT_SMTP_PORT || process.env.SMTP_PORT || '465', 10),
  secure: (process.env.DEFAULT_SMTP_SECURE || process.env.SMTP_SECURE) === 'true' || (process.env.DEFAULT_SMTP_PORT || process.env.SMTP_PORT) === '465',
  user: process.env.DEFAULT_SMTP_USER || process.env.SMTP_USER || '',
  pass: (process.env.DEFAULT_SMTP_PASS || process.env.SMTP_PASS || '').replace(/\s+/g, ''),
  from: process.env.DEFAULT_SMTP_FROM || process.env.SMTP_FROM || `"QuickFile Barangay Central (Default)" <${process.env.DEFAULT_SMTP_USER || 'quickfile.notification@gmail.com'}>`
};

const defaultGoogle = {
  clientId: process.env.DEFAULT_GOOGLE_CLIENT_ID || 'quickfile-dev-default.apps.googleusercontent.com',
  clientSecret: process.env.DEFAULT_GOOGLE_CLIENT_SECRET || 'quickfile_default_dev_secret_2026'
};

const defaultSms = {
  provider: process.env.DEFAULT_SMS_PROVIDER || 'PhilSMS',
  apiEndpoint: process.env.DEFAULT_SMS_API_ENDPOINT || 'https://dashboard.philsms.com/api/v3/',
  apiKey: process.env.DEFAULT_SMS_API_KEY || 'philsms_default_dev_key_2026',
  senderId: process.env.DEFAULT_SMS_SENDER_ID || 'PhilSMS'
};

const defaultApi = {
  secretKey: process.env.DEFAULT_API_SECRET_KEY || 'qf_developer_default_secret_key_2026'
};

// 2. Client Custom Overrides (can also be overridden in DB app_settings via Web UI)
const customSmtp = {
  host: process.env.CUSTOM_SMTP_HOST || '',
  port: process.env.CUSTOM_SMTP_PORT ? parseInt(process.env.CUSTOM_SMTP_PORT, 10) : 465,
  secure: process.env.CUSTOM_SMTP_SECURE === 'true' || process.env.CUSTOM_SMTP_PORT === '465',
  user: process.env.CUSTOM_SMTP_USER || '',
  pass: (process.env.CUSTOM_SMTP_PASS || '').replace(/\s+/g, ''),
  from: process.env.CUSTOM_SMTP_FROM || ''
};

const customGoogle = {
  clientId: process.env.CUSTOM_GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.CUSTOM_GOOGLE_CLIENT_SECRET || ''
};

const customSms = {
  provider: process.env.CUSTOM_SMS_PROVIDER || '',
  apiEndpoint: process.env.CUSTOM_SMS_API_ENDPOINT || '',
  apiKey: process.env.CUSTOM_SMS_API_KEY || '',
  senderId: process.env.CUSTOM_SMS_SENDER_ID || ''
};

const customApi = {
  secretKey: process.env.CUSTOM_API_SECRET_KEY || ''
};

module.exports = {
  projectRoot,
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'quickfile_default_secret_key',
  sessionSecret: process.env.SESSION_SECRET || 'quickfile_default_session_secret',
  dbPath,
  defaultSmtp,
  defaultGoogle,
  defaultSms,
  defaultApi,
  customSmtp,
  customGoogle,
  customSms,
  customApi,
  smtp: defaultSmtp
};
