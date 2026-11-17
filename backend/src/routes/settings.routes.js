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

// API Key Management Security Revisions: PIN Verification, Provider Validation & 2FA
router.post('/verify-pin', suKeyLimiter, settingsController.verifyPin);
router.post('/validate-key', settingsController.validateApiKey);
router.post('/initiate-key-update', suKeyLimiter, settingsController.initiateKeyUpdate);
router.post('/confirm-key-update', suKeyLimiter, settingsController.confirmKeyUpdate);

module.exports = router;
