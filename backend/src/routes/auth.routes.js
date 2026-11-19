const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const {
  authLimiter,
  loginEmailLimiter,
  registerLimiter,
  forgotPasswordIpLimiter,
  forgotPasswordEmailLimiter,
  resendOtpLimiter,
  resetPasswordLimiter,
  refreshLimiter,
} = require('../middlewares/rateLimiter.middleware');

// Public auth routes
// Register: 5 per hour per IP (counts every request)
router.post('/register', registerLimiter, authController.register);

// Login: 15 failed per 15 min per IP + 15 failed per 15 min per email|ip
router.post('/login', authLimiter, loginEmailLimiter, authController.login);

// Google OAuth: 15 failed per 15 min per IP
router.post('/google', authLimiter, authController.googleLogin);

// STEP 1: request a 6-digit OTP (5/hour per IP + 3/hour per email).
router.post(
  '/forgot-password',
  forgotPasswordIpLimiter,
  forgotPasswordEmailLimiter,
  authController.forgotPassword
);

// Resend OTP: 60s cooldown (service) + 5/hour per email (middleware).
router.post(
  '/resend-reset-otp',
  resendOtpLimiter,
  authController.resendResetOtp
);

// STEP 2: verify the OTP and receive a short-lived single-use reset token.
router.post('/verify-reset-otp', resetPasswordLimiter, authController.verifyResetOtp);
// Backwards-compatible alias for older clients using the "PIN" naming.
router.post('/verify-reset-pin', resetPasswordLimiter, authController.verifyResetOtp);

// STEP 3: set a new password using the single-use token (OTP never accepted here).
router.post('/reset-password', resetPasswordLimiter, authController.resetPassword);

// Refresh: rotate the httpOnly refresh cookie and issue a fresh access token.
// Authenticated by the refresh cookie only - no Bearer/access token required.
router.post('/refresh', refreshLimiter, authController.refresh);

// Authenticated auth routes
router.get('/me', authenticate, authController.getMe);
router.post('/logout', authenticate, authController.logout);

module.exports = router;
