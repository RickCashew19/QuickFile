const settingsService = require('../services/settings.service');
const asyncHandler = require('../helpers/asyncHandler');

/**
 * Get system settings and masked integrations
 * GET /api/v1/admin/settings
 */
const getSettings = asyncHandler(async (req, res) => {
  const data = await settingsService.getSettings();

  return res.status(200).json({
    success: true,
    message: 'Settings retrieved successfully.',
    data,
  });
});

/**
 * Update custom integration settings guarded by Super Admin Key
 * PATCH /api/v1/admin/settings
 */
const updateSettings = asyncHandler(async (req, res) => {
  const { su_admin_key, settings, reset_keys } = req.body;

  if (typeof su_admin_key !== 'string' || !su_admin_key.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: su_admin_key must be a non-empty string.',
      data: null,
    });
  }

  if (settings && (typeof settings !== 'object' || Array.isArray(settings))) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: settings must be an object of key-value pairs.',
      data: null,
    });
  }

  const result = await settingsService.updateCustomSettings({
    suAdminKey: su_admin_key,
    updates: settings || {},
    resetKeys: reset_keys || [],
    actorUser: req.user,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });

  return res.status(200).json({
    success: true,
    message: 'Integration settings updated successfully.',
    data: result,
  });
});

/**
 * Update system toggles
 * PATCH /api/v1/admin/settings/toggles
 */
const updateToggles = asyncHandler(async (req, res) => {
  const { su_admin_key, ...updates } = req.body || {};
  if (!su_admin_key || typeof su_admin_key !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Validation error: su_admin_key must be a non-empty string.',
      data: null,
    });
  }

  const result = await settingsService.updateToggles({
    suAdminKey: su_admin_key,
    updates,
    actorUser: req.user,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });

  return res.status(200).json({
    success: true,
    message: 'Feature toggles updated successfully.',
    data: result,
  });
});

/**
 * Update general barangay information and signatories
 * PATCH /api/v1/admin/settings/general
 */
const updateGeneralSettings = asyncHandler(async (req, res) => {
  const result = await settingsService.updateGeneralSettings({
    updates: req.body,
    actorUser: req.user,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });

  return res.status(200).json({
    success: true,
    message: 'General settings updated successfully.',
    data: result,
  });
});

/**
 * Verify Super Admin PIN for unlocking API Key Management section
 * POST /api/v1/admin/settings/verify-pin
 */
const verifyPin = asyncHandler(async (req, res) => {
  const pin = req.body.pin || req.body.su_admin_key;
  if (!pin || typeof pin !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Validation error: Super Admin PIN is required.',
      data: null,
    });
  }

  const result = await settingsService.verifySuperAdminPin({
    pin,
    user: req.user,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });

  return res.status(200).json({
    success: true,
    message: 'Super Admin PIN verified successfully.',
    data: result,
  });
});

/**
 * Validate an API key against provider requirements
 * POST /api/v1/admin/settings/validate-key
 */
const validateApiKey = asyncHandler(async (req, res) => {
  const { provider, credentials } = req.body;
  if (!provider || typeof provider !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Validation error: provider string is required.',
      data: null,
    });
  }

  const result = await settingsService.validateApiKeyCandidate({
    provider,
    credentials: credentials || {},
  });

  return res.status(200).json({
    success: result.valid,
    message: result.message,
    data: result,
  });
});

/**
 * Initiate custom API key registration with 2FA email code
 * POST /api/v1/admin/settings/initiate-key-update
 */
const initiateKeyUpdate = asyncHandler(async (req, res) => {
  const { su_admin_key, settings, reset_keys } = req.body;
  const pin = su_admin_key || req.body.pin;

  if (!pin || typeof pin !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Validation error: Super Admin PIN (su_admin_key) is required.',
      data: null,
    });
  }

  const result = await settingsService.initiateApiKeyRegistration({
    suAdminKey: pin,
    settings: settings || {},
    resetKeys: reset_keys || [],
    user: req.user,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });

  return res.status(200).json({
    success: true,
    message: 'Two-factor verification code dispatched to administrator email.',
    data: result,
  });
});

/**
 * Confirm 2FA code and activate API keys in .env
 * POST /api/v1/admin/settings/confirm-key-update
 */
const confirmKeyUpdate = asyncHandler(async (req, res) => {
  const { verification_id, code } = req.body;

  if (!verification_id || !code) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: verification_id and 6-digit code are required.',
      data: null,
    });
  }

  const result = await settingsService.confirmApiKeyRegistration({
    verificationId: verification_id,
    code,
    user: req.user,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });

  return res.status(200).json({
    success: true,
    message: 'API key successfully verified via 2FA and activated.',
    data: result,
  });
});

module.exports = {
  getSettings,
  updateSettings,
  updateToggles,
  updateGeneralSettings,
  verifyPin,
  validateApiKey,
  initiateKeyUpdate,
  confirmKeyUpdate,
};
