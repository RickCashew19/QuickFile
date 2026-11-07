const express = require('express');
const router = express.Router();
const documentTypesController = require('./documentTypes.controller');
const { authenticate, authorize } = require('../../../middleware/auth.middleware');
const { ROLES } = require('../../../config/constants');

// All admin document type routes require authentication and ADMIN role
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/', documentTypesController.getAll);
router.post('/', documentTypesController.create);
router.get('/:id', documentTypesController.getById);
router.put('/:id', documentTypesController.update);
router.delete('/:id', documentTypesController.remove);

module.exports = router;
