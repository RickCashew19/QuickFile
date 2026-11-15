const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settings.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const { suKeyLimiter, userApiLimiter } = require('../middlewares/rateLimiter.middleware');
const { ROLES } = require('../config/constants');

// Admin-only settings management routes
router.use(authenticate, requireRole([ROLES.ADMIN]), userApiLimiter);

router.get('/', settingsController.getSettings);
router.patch('/', suKeyLimiter, settingsController.updateSettings);
router.patch('/toggles', settingsController.updateToggles);
router.patch('/general', settingsController.updateGeneralSettings);

module.exports = router;
