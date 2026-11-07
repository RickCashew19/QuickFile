const fs = require('fs');
const path = require('path');
const { config } = require('../../config');
const { ALLOWED_CUSTOM_ENV_KEYS } = require('../../config/constants');
const { AppSetting, AuditLog } = require('../../models');
const { verifySuperAdminKey } = require('../../utils/superAdminKeyVerifier');

/**
 * Resolves current .env file path (supports test override)
 */
function getEnvPath() {
  return process.env.TEST_ENV_PATH || path.resolve(__dirname, '../../../.env');
}

/**
 * Format and sanitize an environment variable value
 * Section D.1: Rejects line breaks/nulls, wraps values with spaces, #, or quotes in escaped quotes
 */
function formatEnvValue(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const str = String(value);

  // Reject line breaks and null characters
  if (/[\r\n\0]/.test(str)) {
    const err = new Error('Validation error: Setting values cannot contain line breaks or null characters.');
    err.statusCode = 400;
    throw err;
  }

  // Quote and escape if containing spaces, hashes, or quotes
  if (/[ #'"\\]/.test(str)) {
    const escaped = str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }

  return str;
}

/**
 * Retrieve current settings with masked integration secrets
 */
async function getSettings() {
  const integrationSummary = config.getSafeIntegrationSummary();
  const appSettings = await AppSetting.find({}).lean();

  return {
    integrations: integrationSummary,
    app_settings: appSettings,
  };
}

/**
 * Updates allowlisted CUSTOM_* variables in .env and runtime memory
 * Section D.1: Rejects malicious characters, atomic file writes, reset capability
 */
async function updateCustomSettings({ suAdminKey, updates = {}, resetKeys = [], actorUser, ipAddress, userAgent }) {
  if (!suAdminKey) {
    const err = new Error('Super Admin Key is required to save integration settings.');
    err.statusCode = 400;
    throw err;
  }

  // 1. Verify Super Admin Key (timing-safe + lockout protection)
  await verifySuperAdminKey({
    providedKey: suAdminKey,
    actorId: actorUser._id,
    actorName: actorUser.full_name,
    ipAddress,
    userAgent,
  });

  const validUpdates = {};

  // Process updates
  for (const [key, value] of Object.entries(updates)) {
    if (ALLOWED_CUSTOM_ENV_KEYS.includes(key)) {
      validUpdates[key] = formatEnvValue(value);
    }
  }

  // Process resetKeys (resetting custom key back to empty string / default)
  if (Array.isArray(resetKeys)) {
    for (const key of resetKeys) {
      if (ALLOWED_CUSTOM_ENV_KEYS.includes(key)) {
        validUpdates[key] = '';
      }
    }
  }

  const modifiedKeys = Object.keys(validUpdates);
  if (modifiedKeys.length === 0) {
    const err = new Error('No valid allowlisted settings provided for update or reset.');
    err.statusCode = 400;
    throw err;
  }

  // 2. Read existing .env file
  const envPath = getEnvPath();
  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  let lines = envContent.split(/\r?\n/);
  for (const [key, formattedVal] of Object.entries(validUpdates)) {
    let replaced = false;
    lines = lines.map((line) => {
      if (line.startsWith(`${key}=`)) {
        replaced = true;
        return `${key}=${formattedVal}`;
      }
      return line;
    });

    if (!replaced) {
      lines.push(`${key}=${formattedVal}`);
    }

    // Update in-memory process.env immediately (unwrap quotes for memory)
    const rawVal = formattedVal.startsWith('"') && formattedVal.endsWith('"')
      ? formattedVal.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      : formattedVal;

    process.env[key] = rawVal;
  }

  // 3. Write atomically via temporary file
  const tempPath = `${envPath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tempPath, lines.join('\n'), 'utf8');
  fs.renameSync(tempPath, envPath);

  // 4. Audit settings modification (never log secrets!)
  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'SETTINGS_UPDATE_CUSTOM_KEYS',
    module: 'SETTINGS',
    target_type: 'AppConfig',
    details: { modified_keys: modifiedKeys },
    ip_address: ipAddress,
    user_agent: userAgent,
  });

  return {
    modified_keys: modifiedKeys,
    integrations: config.getSafeIntegrationSummary(),
  };
}

module.exports = {
  getSettings,
  updateCustomSettings,
  formatEnvValue,
};
