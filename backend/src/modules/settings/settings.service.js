const { config } = require('../../config');
const { AppSetting, AuditLog } = require('../../models');
const { verifySuperAdminKey } = require('../../utils/superAdminKeyVerifier');
const { formatEnvValue, writeCustomEnvVars } = require('../../utils/envWriter');
const { normalizePhilippinePhone } = require('../../utils/phoneUtil');

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

const ALLOWED_TOGGLE_KEYS = Object.freeze([
  'enable_google_login',
  'enable_recaptcha',
  'enable_sms_notifications',
  'enable_email_notifications',
  'enable_rest_api_gateway',
]);

const ALLOWED_GENERAL_KEYS = Object.freeze([
  'system_name',
  'contact_email',
  'contact_phone',
  'office_name',
  'barangay_captain',
  'barangay_secretary',
]);

/**
 * Validates and updates system toggles.
 * Rejects enabling any service whose underlying secret key is missing.
 */
async function updateToggles({ updates, actorUser, ipAddress, userAgent }) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    const err = new Error('Validation error: Body must be an object of toggle key-value pairs.');
    err.statusCode = 400;
    throw err;
  }

  const keys = Object.keys(updates);
  if (keys.length === 0) {
    const err = new Error('Validation error: At least one toggle key must be provided.');
    err.statusCode = 400;
    throw err;
  }

  // 1. Strict validation of keys and types
  for (const key of keys) {
    if (!ALLOWED_TOGGLE_KEYS.includes(key)) {
      const err = new Error(`Invalid toggle key: "${key}". Allowed keys: ${ALLOWED_TOGGLE_KEYS.join(', ')}.`);
      err.statusCode = 400;
      throw err;
    }
    if (typeof updates[key] !== 'boolean') {
      const err = new Error(`Setting value for "${key}" must be a strict boolean.`);
      err.statusCode = 400;
      throw err;
    }
  }

  // 2. Reject enabling when underlying credentials are missing
  if (updates.enable_google_login === true && !config.google.resolveClientId().value) {
    const err = new Error('Cannot enable Google login: GOOGLE_CLIENT_ID is not configured.');
    err.statusCode = 400;
    throw err;
  }
  if (
    updates.enable_recaptcha === true &&
    (!config.recaptcha.resolveSiteKey().value || !config.recaptcha.resolveSecretKey().value)
  ) {
    const err = new Error('Cannot enable reCAPTCHA: RECAPTCHA credentials are not configured.');
    err.statusCode = 400;
    throw err;
  }
  if (updates.enable_sms_notifications === true && !config.sms.resolveApiToken().value) {
    const err = new Error('Cannot enable SMS notifications: SMS_API_TOKEN is not configured.');
    err.statusCode = 400;
    throw err;
  }
  if (
    updates.enable_email_notifications === true &&
    (!config.smtp.resolveUser().value || !config.smtp.resolveHost().value || !config.smtp.resolvePass().value)
  ) {
    const err = new Error('Cannot enable email notifications: SMTP credentials are not configured.');
    err.statusCode = 400;
    throw err;
  }
  if (updates.enable_rest_api_gateway === true && !config.restApi.resolveSecretKey().value) {
    const err = new Error('Cannot enable REST API Gateway: REST_API_SECRET_KEY is not configured.');
    err.statusCode = 400;
    throw err;
  }

  // 3. Persist updates to AppSetting collection
  for (const key of keys) {
    await AppSetting.updateOne(
      { key },
      { $set: { value: updates[key], updated_by: actorUser._id } },
      { upsert: true }
    );
  }

  // 4. Audit log entry
  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'SETTINGS_UPDATE_TOGGLES',
    module: 'SETTINGS',
    target_type: 'AppSetting',
    details: { toggles: updates },
    ip_address: ipAddress,
    user_agent: userAgent,
  });

  const updatedRecords = await AppSetting.find({ key: { $in: ALLOWED_TOGGLE_KEYS } }).lean();
  const result = {};
  for (const rec of updatedRecords) {
    result[rec.key] = rec.value;
  }
  return result;
}

/**
 * Validates and updates general barangay settings and signatories.
 */
async function updateGeneralSettings({ updates, actorUser, ipAddress, userAgent }) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    const err = new Error('Validation error: Body must be an object of general setting key-value pairs.');
    err.statusCode = 400;
    throw err;
  }

  const keys = Object.keys(updates);
  if (keys.length === 0) {
    const err = new Error('Validation error: At least one setting key must be provided.');
    err.statusCode = 400;
    throw err;
  }

  // 1. Strict allowlist and format validation
  for (const key of keys) {
    if (!ALLOWED_GENERAL_KEYS.includes(key)) {
      const err = new Error(`Invalid setting key: "${key}". Allowed keys: ${ALLOWED_GENERAL_KEYS.join(', ')}.`);
      err.statusCode = 400;
      throw err;
    }

    const rawVal = updates[key];
    if (typeof rawVal !== 'string') {
      const err = new Error(`Setting value for "${key}" must be a string.`);
      err.statusCode = 400;
      throw err;
    }

    let trimmed = rawVal.trim();
    if (trimmed.length > 100) {
      const err = new Error(`Setting value for "${key}" cannot exceed 100 characters.`);
      err.statusCode = 400;
      throw err;
    }

    if (key === 'contact_email' && trimmed) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmed)) {
        const err = new Error('Invalid contact email format.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (key === 'contact_phone' && trimmed) {
      const norm = normalizePhilippinePhone(trimmed);
      if (!norm.isValid) {
        const err = new Error('Invalid contact phone format. Must be a valid Philippine mobile number (e.g., 09171234567 or +639171234567).');
        err.statusCode = 400;
        throw err;
      }
      trimmed = norm.local;
    }

    updates[key] = trimmed;
  }

  // 2. Persist updates
  for (const key of keys) {
    await AppSetting.updateOne(
      { key },
      { $set: { value: updates[key], updated_by: actorUser._id } },
      { upsert: true }
    );
  }

  // 3. Audit log entry
  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'SETTINGS_UPDATE_GENERAL',
    module: 'SETTINGS',
    target_type: 'AppSetting',
    details: { modified_fields: keys },
    ip_address: ipAddress,
    user_agent: userAgent,
  });

  const updatedRecords = await AppSetting.find({ key: { $in: ALLOWED_GENERAL_KEYS } }).lean();
  const result = {};
  for (const rec of updatedRecords) {
    result[rec.key] = rec.value;
  }
  return result;
}

module.exports = {
  getSettings,
  updateCustomSettings,
  updateToggles,
  updateGeneralSettings,
  formatEnvValue,
};
