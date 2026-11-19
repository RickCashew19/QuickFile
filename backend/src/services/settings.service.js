const { config } = require('../config');
const { AppSetting, AuditLog } = require('../models');
const { verifySuperAdminKey } = require('../helpers/superAdminKeyVerifier');
const { formatEnvValue, writeCustomEnvVars } = require('../helpers/envWriter');
const { normalizePhilippinePhone } = require('../helpers/phoneUtil');
const { validateProviderKey } = require('./apiKeyValidator.service');
const { initiateApiKey2FA, verifyApiKey2FA } = require('./twoFactor.service');
const { ALLOWED_CUSTOM_ENV_KEYS } = require('../config/constants');

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
 * Resets allowlisted CUSTOM_* variables in .env back to defaults (reset_keys only).
 *
 * SECURITY: writing/updating API key VALUES is intentionally NOT allowed here.
 * All key writes must go through POST /admin/settings/initiate-key-update, which
 * verifies the credentials with their live provider and requires 2FA confirmation
 * before activation. This endpoint is the legacy reset path used by the frontend.
 */
async function updateCustomSettings({ suAdminKey, updates = {}, resetKeys = [], actorUser, ipAddress, userAgent }) {
  if (!suAdminKey) {
    const err = new Error('Super Admin Key is required to save integration settings.');
    err.statusCode = 400;
    throw err;
  }

  // 1. Verify Super Admin Key (timing-safe + lockout protection) -- before the
  //    reset-only restriction so lockout behaviour is preserved for wrong keys.
  await verifySuperAdminKey({
    providedKey: suAdminKey,
    actorId: actorUser._id,
    actorName: actorUser.full_name,
    ipAddress,
    userAgent,
  });

  // 2. Reject key writes through this legacy endpoint (audit finding #2).
  //    A reset has no new credential to verify, so reset_keys remain allowed.
  if (updates && Object.keys(updates).length > 0) {
    const err = new Error(
      'API key writes are not allowed here. Use POST /admin/settings/initiate-key-update to verify the key with its provider and confirm via 2FA.'
    );
    err.statusCode = 400;
    throw err;
  }

  // 3. Perform safe reset write to .env
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
async function updateToggles({ suAdminKey, updates, actorUser, ipAddress, userAgent }) {
  if (typeof suAdminKey !== 'string' || !suAdminKey.trim()) {
    const err = new Error('Super Admin PIN is required to change integration status.');
    err.statusCode = 400;
    throw err;
  }

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

  // Require a fresh Super Admin PIN for every integration status change.
  await verifySuperAdminKey({
    providedKey: suAdminKey.trim(),
    actorId: actorUser._id,
    actorName: actorUser.full_name,
    ipAddress,
    userAgent,
  });

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

/**
 * Verifies the Super Admin PIN for accessing and unlocking API Key Management.
 * Sensitive operations re-verify the PIN themselves; no client-side grant token
 * is issued (a token stored in JS would weaken the step-up check).
 */
async function verifySuperAdminPin({ pin, user, ipAddress = '', userAgent = '' }) {
  if (!pin || typeof pin !== 'string' || !pin.trim()) {
    const err = new Error('Super Admin PIN is required.');
    err.statusCode = 400;
    throw err;
  }

  // Verify PIN using timing-safe comparison and lockout management
  await verifySuperAdminKey({
    providedKey: pin.trim(),
    actorId: user._id,
    actorName: user.full_name,
    ipAddress,
    userAgent,
  });

  await AuditLog.create({
    user_id: user._id,
    actor_name: user.full_name,
    action: 'SU_PIN_ACCESS_GRANTED',
    module: 'SETTINGS',
    target_type: 'AppSetting',
    details: { section: 'API_KEY_MANAGEMENT' },
    ip_address: ipAddress,
    user_agent: userAgent,
  });

  return {
    verified: true,
  };
}

/**
 * Validates candidate API keys against provider requirements before acceptance
 */
async function validateApiKeyCandidate({ provider, credentials }) {
  if (!provider) {
    const err = new Error('Provider name is required for key validation.');
    err.statusCode = 400;
    throw err;
  }

  return validateProviderKey(provider, credentials || {});
}

/**
 * Verifies submitted custom API credentials against their live providers BEFORE they are
 * accepted into the 2FA flow (and again at confirmation). Fails closed with a
 * provider-specific message; never logs or echoes the raw credential.
 */
async function validatePendingProviderKeys(pendingUpdates = {}) {
  if (!pendingUpdates || Object.keys(pendingUpdates).length === 0) return;

  const checks = [
    { applies: pendingUpdates.CUSTOM_REST_API_SECRET_KEY, provider: 'rest_api', label: 'REST API Key' },
    {
      applies: pendingUpdates.CUSTOM_GOOGLE_CLIENT_ID || pendingUpdates.CUSTOM_GOOGLE_CLIENT_SECRET,
      provider: 'google',
      label: 'Google OAuth API',
    },
    {
      applies: pendingUpdates.CUSTOM_SMS_API_TOKEN || pendingUpdates.CUSTOM_SMS_GATEWAY_URL,
      provider: 'sms',
      label: 'PhilSMS Gateway API',
    },
    {
      applies: pendingUpdates.CUSTOM_SMTP_USER || pendingUpdates.CUSTOM_SMTP_PASS,
      provider: 'smtp',
      label: 'SMTP Mail Server',
    },
    {
      applies: pendingUpdates.CUSTOM_RECAPTCHA_SECRET_KEY || pendingUpdates.CUSTOM_RECAPTCHA_SITE_KEY,
      provider: 'recaptcha',
      label: 'Google reCAPTCHA API',
    },
  ];

  for (const check of checks) {
    if (!check.applies) continue;
    const result = await validateProviderKey(check.provider, pendingUpdates);
    if (!result.valid) {
      const err = new Error(`${check.label} is not working: ${result.message}`);
      err.statusCode = 400;
      err.provider = check.provider;
      throw err;
    }
  }
}

/**
 * Initiates registration of new custom API keys with mandatory 2FA email verification.
 * Verifies Super Admin PIN and the submitted credentials with their providers BEFORE
 * dispatching the 2FA code. A broken/unverifiable key never reaches the confirmation step.
 */
async function initiateApiKeyRegistration({ suAdminKey, settings = {}, resetKeys = [], user, ipAddress, userAgent }) {
  if (!suAdminKey) {
    const err = new Error('Super Admin PIN is required to register or modify API keys.');
    err.statusCode = 400;
    throw err;
  }

  // 1. Verify Super Admin Key
  await verifySuperAdminKey({
    providedKey: suAdminKey,
    actorId: user._id,
    actorName: user.full_name,
    ipAddress,
    userAgent,
  });

  // 2. Validate allowlisted custom keys
  const keys = Object.keys(settings || {});
  for (const k of keys) {
    if (!ALLOWED_CUSTOM_ENV_KEYS.includes(k)) {
      const err = new Error(`Invalid custom configuration key: "${k}".`);
      err.statusCode = 400;
      throw err;
    }
  }

  // 3. Verify credentials with their live providers BEFORE any 2FA email is dispatched.
  //    This is the primary gate: a broken/unverifiable key is rejected here, immediately.
  try {
    await validatePendingProviderKeys(settings);
  } catch (err) {
    await AuditLog.create({
      user_id: user._id,
      actor_name: user.full_name,
      action: 'API_KEY_PROVIDER_VALIDATION_FAILED',
      module: 'SETTINGS',
      target_type: 'AppConfig',
      details: {
        provider: err.provider || 'unknown',
        reason: err.message,
        keys_modified: Object.keys(settings || {}),
      },
      ip_address: ipAddress,
      user_agent: userAgent,
    });
    throw err;
  }

  // 4. Initiate 2FA code generation and email dispatch
  return initiateApiKey2FA({
    user,
    pendingUpdates: settings,
    pendingResetKeys: resetKeys,
    ipAddress,
    userAgent,
  });
}

/**
 * Confirms 2FA verification code and verifies whether custom API keys are working
 * with their respective providers before writing and activating in .env.
 * If not working, rejects activation and throws error ("if not then its not").
 */
async function confirmApiKeyRegistration({ verificationId, code, user, ipAddress, userAgent }) {
  // 1. Verify 2FA code with attempt limits and expiry
  const { pending_updates, pending_reset_keys } = await verifyApiKey2FA({
    verificationId,
    code,
    user,
    ipAddress,
    userAgent,
  });

  // 2. Re-verify credentials with their providers before activation (second gate).
  await validatePendingProviderKeys(pending_updates);

  // 3. Perform atomic write to .env ONLY after 2FA is verified AND API is verified working!
  const { modifiedKeys } = writeCustomEnvVars(pending_updates, pending_reset_keys);

  // 4. Audit log successful 2FA activation
  await AuditLog.create({
    user_id: user._id,
    actor_name: user.full_name,
    action: 'SETTINGS_UPDATE_CUSTOM_KEYS_2FA',
    module: 'SETTINGS',
    target_type: 'AppConfig',
    details: {
      modified_keys: modifiedKeys,
      verification_id: verificationId,
    },
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
  updateToggles,
  updateGeneralSettings,
  verifySuperAdminPin,
  validateApiKeyCandidate,
  initiateApiKeyRegistration,
  confirmApiKeyRegistration,
  formatEnvValue,
};
