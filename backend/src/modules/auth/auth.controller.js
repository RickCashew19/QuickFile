const authService = require('./auth.service');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * Handle citizen registration
 * POST /api/auth/register
 */
const register = asyncHandler(async (req, res) => {
  const { email, password, first_name, last_name, birthdate, gender } = req.body;

  if (!email || !password || !first_name || !last_name || !birthdate || !gender) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: email, password, first_name, last_name, birthdate, and gender are required.',
      data: null,
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: Password must be at least 8 characters.',
      data: null,
    });
  }

  const result = await authService.registerCitizen(
    req.body,
    req.ip,
    req.get('User-Agent')
  );

  return res.status(201).json({
    success: true,
    message: 'Citizen account registered successfully.',
    data: result,
  });
});

/**
 * Handle user login
 * POST /api/auth/login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: Email and password are required.',
      data: null,
    });
  }

  const result = await authService.loginUser(
    email,
    password,
    req.ip,
    req.get('User-Agent')
  );

  return res.status(200).json({
    success: true,
    message: 'User logged in successfully.',
    data: result,
  });
});

/**
 * Handle authenticated profile lookup
 * GET /api/auth/me
 */
const getMe = asyncHandler(async (req, res) => {
  const result = await authService.getUserProfile(req.user);

  return res.status(200).json({
    success: true,
    message: 'User profile retrieved successfully.',
    data: result,
  });
});

module.exports = {
  register,
  login,
  getMe,
};
