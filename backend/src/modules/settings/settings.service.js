const fs = require('fs');
const path = require('path');
const { config } = require('../../config');
const { ALLOWED_CUSTOM_ENV_KEYS } = require('../../config/constants');
const { AppSetting, AuditLog } = require('../../models');
const { verifySuperAdminKey } = require('../../utils/superAdminKeyVerifier');

const ENV_PATH = path.resolve(__dirname, '../../../.env');

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
 * Strictly requires Super Admin Key verification
 */
async function updateCustomSettings({ suAdminKey, updates = {}, actorUser, ipAddress, userAgent }) {
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

  // 2. Filter updates: only allowlisted CUSTOM_* keys are permitted
  const validUpdates = {};
  for (const [key, value] of Object.entries(updates)) {
    if (ALLOWED_CUSTOM_ENV_KEYS.includes(key)) {
      validUpdates[key] = typeof value === 'string' ? value.trim() : String(value || '');
    }
  }

  const modifiedKeys = Object.keys(validUpdates);
  if (modifiedKeys.length === 0) {
    const err = new Error('No valid allowlisted settings provided for update.');
    err.statusCode = 400;
    throw err;
  }

  // 3. Update backend/.env file safely
  let envContent = '';
  if (fs.existsSync(ENV_PATH)) {
    envContent = fs.readFileSync(ENV_PATH, 'utf8');
  }

  let lines = envContent.split(/\r?\n/);
  for (const [key, value] of Object.entries(validUpdates)) {
    let replaced = false;
    lines = lines.map((line) => {
      if (line.startsWith(`${key}=`)) {
        replaced = true;
        return `${key}=${value}`;
      }
      return line;
    });

    if (!replaced) {
      lines.push(`${key}=${value}`);
    }

    // Update in-memory process.env immediately
    process.env[key] = value;
  }

  fs.writeFileSync(ENV_PATH, lines.join('\n'), 'utf8');

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
};
