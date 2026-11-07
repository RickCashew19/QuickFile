const express = require('express');
const router = express.Router();
const citizenController = require('./citizen.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const { ROLES } = require('../../config/constants');

// Catalog can be viewed by authenticated users (citizens)
router.get('/catalog', authenticate, citizenController.getCatalog);

// Citizen profile routes (strictly restricted to citizen role)
router.get('/profile', authenticate, authorize(ROLES.CITIZEN), citizenController.getProfile);
router.put('/profile', authenticate, authorize(ROLES.CITIZEN), citizenController.updateProfile);
router.get('/profile/reuse', authenticate, authorize(ROLES.CITIZEN), citizenController.getReuseData);

module.exports = router;

