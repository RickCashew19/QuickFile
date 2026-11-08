const authService = require('./auth.service');
const { verifyRecaptcha } = require('../../utils/recaptcha');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * Handle citizen registration
 * POST /api/v1/auth/register
 */
const register = asyncHandler(async (req, res) => {
  const { email, password, first_name, last_name, birthdate, gender, recaptcha_token } = req.body;

  if (
    !email || typeof email !== 'string' ||
    !password || typeof password !== 'string' ||
    !first_name || typeof first_name !== 'string' ||
    !last_name || typeof last_name !== 'string' ||
    !birthdate ||
    !gender || typeof gender !== 'string'
  ) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: email, password, first_name, last_name, birthdate, and gender are required valid strings.',
      data: null,
    });
  }

  if (isNaN(new Date(birthdate).getTime())) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: birthdate must be a valid date.',
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

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Validation error: Email and password must be valid strings.',
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

  if (!idToken || typeof idToken !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Validation error: Google ID token (id_token) must be a non-empty string.',
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

  if (!email || typeof email !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Validation error: Email must be a valid string.',
      data: null,
    });
  }

  // Verify reCAPTCHA if enabled
  await verifyRecaptcha(recaptcha_token, req.ip);

  // Extract client origin if available from payload, Origin header, or Referer header
  const originCandidate =
    req.body?.client_app_url ||
    req.get('Origin') ||
    req.get('Referer');

  let clientOrigin = null;
  if (originCandidate && typeof originCandidate === 'string') {
    try {
      const parsed = new URL(originCandidate);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        clientOrigin = parsed.origin;
      }
    } catch {
      clientOrigin = null;
    }
  }

  const result = await authService.requestPasswordReset(
    email,
    req.ip,
    req.get('User-Agent'),
    clientOrigin
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

  if (!token || !newPassword || typeof token !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Validation error: Reset token and new password must be valid strings.',
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
