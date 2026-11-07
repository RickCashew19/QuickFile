const express = require('express');
const router = express.Router();
const citizenController = require('./citizen.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const { userApiLimiter } = require('../../middleware/rateLimiter.middleware');
const { ROLES } = require('../../config/constants');

// Citizen module routes require authentication and user rate limiter
router.use(authenticate, userApiLimiter);

// Catalog can be viewed by authenticated users (citizens)
router.get('/catalog', citizenController.getCatalog);

// Citizen profile routes (strictly restricted to citizen role)
router.get('/profile', authorize(ROLES.CITIZEN), citizenController.getProfile);
router.put('/profile', authorize(ROLES.CITIZEN), citizenController.updateProfile);
router.get('/profile/reuse', authorize(ROLES.CITIZEN), citizenController.getReuseData);

module.exports = router;
