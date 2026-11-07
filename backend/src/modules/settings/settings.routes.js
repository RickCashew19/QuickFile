const express = require('express');
const router = express.Router();
const settingsController = require('./settings.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/role.middleware');
const { suKeyLimiter, userApiLimiter } = require('../../middleware/rateLimiter.middleware');
const { ROLES } = require('../../config/constants');

// Admin-only settings management routes
router.use(authenticate, requireRole([ROLES.ADMIN]), userApiLimiter);

router.get('/', settingsController.getSettings);
router.patch('/', suKeyLimiter, settingsController.updateSettings);

module.exports = router;
