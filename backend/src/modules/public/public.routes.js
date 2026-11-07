const express = require('express');
const router = express.Router();
const publicController = require('./public.controller');
const { publicLimiter } = require('../../middleware/rateLimiter.middleware');

// Public bootstrap config route (no login required)
router.get('/config', publicLimiter, publicController.getPublicConfig);

module.exports = router;

