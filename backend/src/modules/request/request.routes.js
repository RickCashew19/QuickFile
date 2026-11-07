const express = require('express');
const router = express.Router();
const requestController = require('./request.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const { ROLES } = require('../../config/constants');
const { upload } = require('../../utils/fileUpload');
const { pollingLimiter } = require('../../middleware/rateLimiter.middleware');
const { sanitizeNoSql } = require('../../middleware/sanitizeNoSql.middleware');

// All citizen request routes require authentication and citizen role
router.use(authenticate, authorize(ROLES.CITIZEN));

// 1. Submit request (multipart/form-data with up to 3 attachments, followed by post-multer sanitizeNoSql)
router.post('/', upload.array('attachments', 3), sanitizeNoSql, requestController.createRequest);

// 2. List citizen requests
router.get('/', requestController.listRequests);

// 3. Status polling endpoint (dedicated rate limit for 8s polling)
router.get('/:trackingNumber/status', pollingLimiter, requestController.getRequestStatus);

// 4. Retrieve full single request details
router.get('/:trackingNumber', requestController.getRequest);

// 5. Update request (only while pending)
router.put('/:trackingNumber', upload.array('attachments', 3), sanitizeNoSql, requestController.updateRequest);

// 6. Cancel request (only while pending)
router.post('/:trackingNumber/cancel', requestController.cancelRequest);

module.exports = router;
