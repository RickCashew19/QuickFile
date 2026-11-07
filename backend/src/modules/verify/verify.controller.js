const verifyService = require('./verify.service');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * Public document verification endpoint
 * GET /api/v1/verify/:code
 * Publicly accessible, rate limited, strictly excludes citizen PII
 */
const publicVerify = asyncHandler(async (req, res) => {
  const result = await verifyService.verifyPublicCode(req.params.code);
  return res.status(200).json({
    success: true,
    message: 'Document verification completed successfully.',
    data: result,
  });
});

/**
 * Staff document verification endpoint
 * GET /api/v1/staff/verify/:code
 * Requires can_verify_qr permission, returns full record and logs scan
 */
const staffVerify = asyncHandler(async (req, res) => {
  const result = await verifyService.verifyStaffCode(
    req.params.code,
    req.user,
    req.ip,
    req.get('User-Agent')
  );
  return res.status(200).json({
    success: true,
    message: 'Staff document verification verified and logged.',
    data: result,
  });
});

module.exports = {
  verifyController: {
    publicVerify,
    staffVerify,
  },
  publicVerify,
  staffVerify,
};

