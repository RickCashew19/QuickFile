const express = require('express');
const router = express.Router();
const { publicVerify } = require('./verify.controller');
const { publicLimiter } = require('../../middleware/rateLimiter.middleware');

// Public verification endpoint (Rate limited per IP, no authentication needed)
router.get('/:code', publicLimiter, publicVerify);

module.exports = router;

