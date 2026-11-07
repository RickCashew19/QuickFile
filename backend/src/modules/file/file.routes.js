const express = require('express');
const router = express.Router();
const fileController = require('./file.controller');
const { authenticate } = require('../../middleware/auth.middleware');

// Protected attachment access: authenticated users only
router.get('/attachments/:filename', authenticate, fileController.getAttachment);

module.exports = router;
