const express = require('express');
const router = express.Router();
const publicController = require('../controllers/public.controller');
const { publicLimiter } = require('../middlewares/rateLimiter.middleware');

// Public bootstrap config route (no login required)
router.get('/config', publicLimiter, publicController.getPublicConfig);

module.exports = router;

