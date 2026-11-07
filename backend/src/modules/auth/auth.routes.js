const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { authLimiter } = require('../../middleware/rateLimiter.middleware');

// Public auth endpoints guarded by rate limiter
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);

// Protected auth endpoints requiring valid Bearer JWT
router.get('/me', authenticate, authController.getMe);

module.exports = router;
