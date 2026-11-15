const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { userApiLimiter } = require('../middlewares/rateLimiter.middleware');

// All notification routes require authentication and user rate limiter
router.use(authenticate, userApiLimiter);

// Note: Fixed routes (/read-all) must be declared before parameterized routes (/:id/read)
router.get('/', notificationController.listNotifications);
router.patch('/read-all', notificationController.markAllAsRead);
router.patch('/:id/read', notificationController.markOneAsRead);
router.delete('/:id', notificationController.deleteOne);
router.delete('/', notificationController.deleteAll);

module.exports = router;
