const express = require('express');
const router = express.Router();
const fileController = require('../controllers/file.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { userApiLimiter } = require('../middlewares/rateLimiter.middleware');

// Protected attachment access: authenticated users only, rate limited per user
router.get('/attachments/:filename', authenticate, userApiLimiter, fileController.getAttachment);

module.exports = router;
