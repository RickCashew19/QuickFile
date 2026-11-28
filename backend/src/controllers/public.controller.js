const publicService = require('../services/public.service');
const asyncHandler = require('../helpers/asyncHandler');

/**
 * Public configuration endpoint for frontend bootstrap
 * GET /api/v1/public/config
 */
const getPublicConfig = asyncHandler(async (req, res) => {
  const data = await publicService.getPublicConfig();

  return res.status(200).json({
    success: true,
    message: 'Public configuration retrieved successfully.',
    data,
  });
});

/**
 * Public active document types for landing-page service cards
 * GET /api/v1/public/document-types
 */
const getPublicDocumentTypes = asyncHandler(async (req, res) => {
  const data = await publicService.getPublicDocumentTypes();

  return res.status(200).json({
    success: true,
    message: 'Active document types retrieved successfully.',
    data,
  });
});

module.exports = {
  getPublicConfig,
  getPublicDocumentTypes,
};

