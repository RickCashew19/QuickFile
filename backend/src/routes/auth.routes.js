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

// Forgot Password: 5 per hour per IP AND 3 per hour per email (counts every request)
router.post(
  '/forgot-password',
  forgotPasswordIpLimiter,
  forgotPasswordEmailLimiter,
  authController.forgotPassword
);

// Reset Password: 10 per hour per IP (counts every request)
router.post('/reset-password', resetPasswordLimiter, authController.resetPassword);

// Refresh: rotate the httpOnly refresh cookie and issue a fresh access token.
// Authenticated by the refresh cookie only - no Bearer/access token required.
router.post('/refresh', refreshLimiter, authController.refresh);

// Authenticated auth routes
router.get('/me', authenticate, authController.getMe);
router.post('/logout', authenticate, authController.logout);

module.exports = router;
