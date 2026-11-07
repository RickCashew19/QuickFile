const settingsService = require('./settings.service');
const asyncHandler = require('../../utils/asyncHandler');

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

  if (!su_admin_key || typeof su_admin_key !== 'string') {
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
  const result = await settingsService.updateToggles({
    updates: req.body,
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

module.exports = {
  getSettings,
  updateSettings,
  updateToggles,
  updateGeneralSettings,
};
