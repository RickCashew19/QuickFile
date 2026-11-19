const authService = require('../services/auth.service');
const { rotateSession } = require('../services/refreshSession.service');
const { verifyRecaptcha } = require('../helpers/recaptcha');
const { isValidEmail } = require('../helpers/emailValidator');
const asyncHandler = require('../helpers/asyncHandler');
const {
  setAuthCookie,
  setRefreshCookie,
  clearAuthCookie,
  getRefreshTokenFromCookie,
} = require('../helpers/authCookie');

/**
 * Sends the short-lived access token and the opaque refresh token to the client.
 * The refresh token is written ONLY to an httpOnly cookie - never into the JSON
 * response body, so page JavaScript cannot read it.
 */
function issueSessionCookies(res, tokens) {
  setAuthCookie(res, tokens.access_token);
  setRefreshCookie(res, tokens.refresh_token);
}

/**
 * Strips internal-only token fields before sending a session result to clients.
 */
function publicSession(result) {
  const { refresh_token, ...rest } = result;
  return rest;
}

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

  if (!isValidEmail(email)) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: A valid email address is required.',
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

  if (password.length < 8 || password.length > 72) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: Password must be between 8 and 72 characters.',
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

  issueSessionCookies(res, result);

  return res.status(201).json({
    success: true,
    message: 'Citizen account registered successfully.',
    data: publicSession(result),
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

  issueSessionCookies(res, result);

  return res.status(200).json({
    success: true,
    message: 'User logged in successfully.',
    data: publicSession(result),
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

  issueSessionCookies(res, result);

  return res.status(200).json({
    success: true,
    message: 'Google login successful.',
    data: publicSession(result),
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

  // Do not trust a client-supplied origin; reset notifications are derived from
  // server configuration only, so there is nothing to bind to a request origin.
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
 * STEP 2: Verify the 6-digit PIN first and receive a short-lived single-use reset token.
 * POST /api/v1/auth/verify-reset-pin
 */
const verifyResetPin = asyncHandler(async (req, res) => {
  const { email, pin } = req.body;
  const code = pin || req.body.token;

  if (!email || typeof email !== 'string' || !code || typeof code !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Validation error: Email and 6-digit PIN must be valid strings.',
      data: null,
    });
  }

  const result = await authService.verifyResetPin(
    { email, pin: code },
    req.ip,
    req.get('User-Agent')
  );

  return res.status(200).json({
    success: true,
    message: 'PIN verified. You may now set a new password.',
    data: result,
  });
});

/**
 * STEP 3: Set a new password using the single-use token from verify-reset-pin.
 * The PIN is intentionally never accepted at this step.
 * POST /api/v1/auth/reset-password
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const resetToken = req.body.reset_token || req.body.resetToken;
  const newPassword = req.body.new_password || req.body.password;

  if (!resetToken || !newPassword || typeof resetToken !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Validation error: A verification token and new password must be valid strings. Verify your 6-digit PIN first.',
      data: null,
    });
  }

  const result = await authService.resetPasswordWithToken(
    { email, reset_token: resetToken, new_password: newPassword },
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
 * Rotate the refresh cookie and issue a fresh short-lived access token.
 * POST /api/v1/auth/refresh
 * Authentication is via the httpOnly refresh cookie only (no Bearer token).
 */
const refresh = asyncHandler(async (req, res) => {
  const rawRefreshToken = getRefreshTokenFromCookie(req);
  const { refreshToken, user } = await rotateSession(
    rawRefreshToken,
    req.ip,
    req.get('User-Agent')
  );

  // Build the same shape as GET /auth/me so clients can hydrate on boot.
  const session = await authService.getUserProfile(user);
  const accessToken = authService.generateToken(user);

  setAuthCookie(res, accessToken);
  setRefreshCookie(res, refreshToken);

  return res.status(200).json({
    success: true,
    message: 'Session refreshed successfully.',
    data: {
      access_token: accessToken,
      token_type: 'Bearer',
      ...session,
    },
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
    req.get('User-Agent'),
    getRefreshTokenFromCookie(req)
  );

  clearAuthCookie(res);

  return res.status(200).json({
    success: true,
    message: result.message,
    data: null,
  });
});

module.exports = {
  register,
  login,
  refresh,
  googleLogin,
  forgotPassword,
  verifyResetPin,
  resetPassword,
  getMe,
  logout,
};
