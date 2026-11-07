const express = require('express');
const router = express.Router();
const notificationController = require('./notification.controller');
const { authenticate } = require('../../middleware/auth.middleware');

// All notification routes require authentication
router.use(authenticate);

// Note: Fixed routes (/read-all) must be declared before parameterized routes (/:id/read)
router.get('/', notificationController.listNotifications);
router.patch('/read-all', notificationController.markAllAsRead);
router.patch('/:id/read', notificationController.markOneAsRead);
router.delete('/:id', notificationController.deleteOne);
router.delete('/', notificationController.deleteAll);

module.exports = router;
