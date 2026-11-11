const citizenService = require('./citizen.service');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * Get current citizen profile + completeness score
 * GET /api/v1/citizen/profile
 */
const getProfile = asyncHandler(async (req, res) => {
  const result = await citizenService.getCitizenProfile(req.user._id);

  return res.status(200).json({
    success: true,
    message: 'Citizen profile retrieved successfully.',
    data: result,
  });
});

/**
 * Update current citizen profile and sync User name & phone
 * PUT /api/v1/citizen/profile
 */
const updateProfile = asyncHandler(async (req, res) => {
  // Fix 4: Validate field types if present
  if (req.body.birthdate && isNaN(new Date(req.body.birthdate).getTime())) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: birthdate must be a valid date.',
      data: null,
    });
  }

  const stringFields = [
    'first_name',
    'middle_name',
    'last_name',
    'suffix',
    'gender',
    'civil_status',
    'contact_number',
    'purok_zone',
    'street_address',
    'barangay',
    'city',
    'province',
    'occupation',
    'voter_status',
    'emergency_contact_name',
    'emergency_contact_number',
    'valid_id_type',
    'valid_id_number',
    'proof_of_residency_type',
  ];

  for (const field of stringFields) {
    if (req.body[field] !== undefined && req.body[field] !== null && typeof req.body[field] !== 'string') {
      return res.status(400).json({
        success: false,
        message: `Validation error: ${field} must be a string.`,
        data: null,
      });
    }
  }

  const result = await citizenService.updateCitizenProfile(
    req.user._id,
    req.body,
    req.ip,
    req.get('User-Agent')
  );

  return res.status(200).json({
    success: true,
    message: 'Citizen profile updated successfully.',
    data: result,
  });
});

/**
 * Get reusable profile data for prefilling forms
 * GET /api/v1/citizen/profile/reuse
 */
const getReuseData = asyncHandler(async (req, res) => {
  const result = await citizenService.getProfileReuseData(req.user._id);

  return res.status(200).json({
    success: true,
    message: 'Profile reuse data retrieved successfully.',
    data: result,
  });
});

/**
 * Get active document types for catalog
 * GET /api/v1/citizen/catalog
 */
const getCatalog = asyncHandler(async (req, res) => {
  const result = await citizenService.getActiveCatalog();

  return res.status(200).json({
    success: true,
    message: 'Active document catalog retrieved successfully.',
    data: result,
  });
});

module.exports = {
  getProfile,
  updateProfile,
  getReuseData,
  getCatalog,
};

