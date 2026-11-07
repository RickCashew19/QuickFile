const express = require('express');
const router = express.Router();
const fileController = require('./file.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { userApiLimiter } = require('../../middleware/rateLimiter.middleware');

// Protected attachment access: authenticated users only, rate limited per user
router.get('/attachments/:filename', authenticate, userApiLimiter, fileController.getAttachment);

module.exports = router;
