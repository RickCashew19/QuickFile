const publicService = require('./public.service');
const asyncHandler = require('../../utils/asyncHandler');

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

module.exports = {
  getPublicConfig,
};
