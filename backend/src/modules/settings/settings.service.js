const { config } = require('../../config');
const { AppSetting, AuditLog } = require('../../models');
const { verifySuperAdminKey } = require('../../utils/superAdminKeyVerifier');
const { formatEnvValue, writeCustomEnvVars } = require('../../utils/envWriter');

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
 * Strict round-trip validation with dotenv.parse before and after writing.
 * process.env is updated ONLY after the file write succeeds.
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

  // 2. Perform safe write to .env
  const { modifiedKeys } = writeCustomEnvVars(updates, resetKeys);

  // 3. Audit settings modification (never log secrets!)
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
