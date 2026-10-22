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

module.exports = {
  projectRoot,
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'quickfile_default_secret_key',
  sessionSecret: process.env.SESSION_SECRET || 'quickfile_default_session_secret',
  dbPath,
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
    user: process.env.SMTP_USER || '',
    pass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
    from: process.env.SMTP_FROM || `"QuickFile Barangay Central" <${process.env.SMTP_USER || 'quickfile.notification@gmail.com'}>`
  },
  supabase: {
    url: process.env.SUPABASE_URL || 'https://bnuwahmsxxqqfuwwhzqk.supabase.co',
    key: process.env.SUPABASE_KEY || ''
  }
};
