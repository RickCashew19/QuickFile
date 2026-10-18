const express = require('express');
const router = express.Router();
const VerificationController = require('./verification.controller');

router.get('/', VerificationController.renderVerificationPage);
router.get('/:code', VerificationController.renderVerificationPage);

module.exports = router;
