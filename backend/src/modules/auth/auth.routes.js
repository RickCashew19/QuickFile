const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const {
  authLimiter,
  loginEmailLimiter,
  registerLimiter,
  forgotPasswordIpLimiter,
  forgotPasswordEmailLimiter,
  resetPasswordLimiter,
} = require('../../middleware/rateLimiter.middleware');

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

// Authenticated auth routes
router.get('/me', authenticate, authController.getMe);
router.post('/logout', authenticate, authController.logout);

module.exports = router;
