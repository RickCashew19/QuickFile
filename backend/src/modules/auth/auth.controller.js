const authService = require('./auth.service');
const { verifyRecaptcha } = require('../../utils/recaptcha');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * Handle citizen registration
 * POST /api/v1/auth/register
 */
const register = asyncHandler(async (req, res) => {
  const { email, password, first_name, last_name, birthdate, gender, recaptcha_token } = req.body;

  if (!email || !password || !first_name || !last_name || !birthdate || !gender) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: email, password, first_name, last_name, birthdate, and gender are required.',
      data: null,
    });
  }

  if (password.length < 6 || password.length > 72) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: Password must be between 6 and 72 characters.',
      data: null,
    });
  }

  // Verify reCAPTCHA if enabled
  await verifyRecaptcha(recaptcha_token, req.ip);

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
 * POST /api/v1/auth/login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password, recaptcha_token } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: Email and password are required.',
      data: null,
    });
  }

  // Verify reCAPTCHA if enabled
  await verifyRecaptcha(recaptcha_token, req.ip);

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
 * Handle Google OAuth login
 * POST /api/v1/auth/google
 */
const googleLogin = asyncHandler(async (req, res) => {
  const idToken = req.body.id_token || req.body.credential;

  if (!idToken) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: Google ID token (id_token) is required.',
      data: null,
    });
  }

  const result = await authService.loginWithGoogle(
    idToken,
    req.ip,
    req.get('User-Agent')
  );

  return res.status(200).json({
    success: true,
    message: 'Google login successful.',
    data: result,
  });
});

/**
 * Handle forgot password request
 * POST /api/v1/auth/forgot-password
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email, recaptcha_token } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: Email is required.',
      data: null,
    });
  }

  // Verify reCAPTCHA if enabled
  await verifyRecaptcha(recaptcha_token, req.ip);

  const result = await authService.requestPasswordReset(
    email,
    req.ip,
    req.get('User-Agent')
  );

  return res.status(200).json({
    success: true,
    message: result.message,
    data: null,
  });
});

/**
 * Handle password reset execution
 * POST /api/v1/auth/reset-password
 */
const resetPassword = asyncHandler(async (req, res) => {
  const token = req.body.token;
  const newPassword = req.body.new_password || req.body.password;

  if (!token || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: Reset token and new password are required.',
      data: null,
    });
  }

  const result = await authService.resetPasswordWithToken(
    token,
    newPassword,
    req.ip,
    req.get('User-Agent')
  );

  return res.status(200).json({
    success: true,
    message: result.message,
    data: null,
  });
});

/**
 * Handle authenticated profile lookup
 * GET /api/v1/auth/me
 */
const getMe = asyncHandler(async (req, res) => {
  const result = await authService.getUserProfile(req.user);

  return res.status(200).json({
    success: true,
    message: 'User profile retrieved successfully.',
    data: result,
  });
});

/**
 * Handle logout
 * POST /api/v1/auth/logout
 */
const logout = asyncHandler(async (req, res) => {
  const result = await authService.logoutUser(
    req.user,
    req.ip,
    req.get('User-Agent')
  );

  return res.status(200).json({
    success: true,
    message: result.message,
    data: null,
  });
});

module.exports = {
  register,
  login,
  googleLogin,
  forgotPassword,
  resetPassword,
  getMe,
  logout,
};
