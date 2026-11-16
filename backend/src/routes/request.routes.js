const express = require('express');
const router = express.Router();
const requestController = require('../controllers/request.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { ROLES } = require('../config/constants');
const { upload } = require('../helpers/fileUpload');
const { pollingLimiter, userApiLimiter } = require('../middlewares/rateLimiter.middleware');
const { sanitizeNoSql } = require('../middlewares/sanitizeNoSql.middleware');

// All citizen request routes require authentication and citizen role
router.use(authenticate, authorize(ROLES.CITIZEN));

// 1. High-frequency status polling endpoint (uses ONLY pollingLimiter, registered BEFORE userApiLimiter)
router.get('/:trackingNumber/status', pollingLimiter, requestController.getRequestStatus);

// All other citizen request routes use userApiLimiter (300 per 15 min per user)
router.use(userApiLimiter);

// 2. Submit request (multipart/form-data with up to 3 attachments, followed by post-multer sanitizeNoSql)
router.post('/', upload.array('attachments', 3), sanitizeNoSql, requestController.createRequest);

// 3. List citizen requests
router.get('/', requestController.listRequests);

// 4. Retrieve full single request details
router.get('/:trackingNumber', requestController.getRequest);

// 5. Update request (only while pending)
router.put('/:trackingNumber', upload.array('attachments', 3), sanitizeNoSql, requestController.updateRequest);

// 6. Cancel request (only while pending)
router.post('/:trackingNumber/cancel', requestController.cancelRequest);

module.exports = router;
