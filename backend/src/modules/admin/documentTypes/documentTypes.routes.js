const express = require('express');
const router = express.Router();
const documentTypesController = require('./documentTypes.controller');
const { authenticate, authorize } = require('../../../middleware/auth.middleware');
const { userApiLimiter } = require('../../../middleware/rateLimiter.middleware');
const { ROLES } = require('../../../config/constants');

// All admin document type routes require authentication, ADMIN role, and user rate limiter
router.use(authenticate, authorize(ROLES.ADMIN), userApiLimiter);

router.get('/', documentTypesController.getAll);
router.post('/', documentTypesController.create);
router.get('/:id', documentTypesController.getById);
router.put('/:id', documentTypesController.update);
router.delete('/:id', documentTypesController.remove);

module.exports = router;
