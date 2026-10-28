const express = require('express');
const router = express.Router();
const SettingsController = require('./settings.controller');
const { authenticateUser } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/role.middleware');

// Protected: Only Barangay Administrator can manage App Settings
router.use(authenticateUser, requireRole(['admin']));

router.get('/', SettingsController.renderSettings);
router.post('/', SettingsController.handleUpdateSettings);
router.post('/toggle-api', SettingsController.toggleApi);
router.post('/test-email', SettingsController.handleTestEmail);
router.post('/test-smtp-connection', SettingsController.handleTestSmtpConnection);
router.post('/check-sms-balance', SettingsController.handleCheckSmsBalance);
router.post('/test-sms', SettingsController.handleTestSms);
router.get('/api', SettingsController.apiGetSettings);

module.exports = router;
