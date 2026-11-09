const express = require('express');
const router = express.Router();
const documentTypesController = require('./documentTypes.controller');
const documentTemplatesController = require('./documentTemplates.controller');
const { authenticate, authorize } = require('../../../middleware/auth.middleware');
const { userApiLimiter, templateUploadLimiter } = require('../../../middleware/rateLimiter.middleware');
const { validateObjectIdParam } = require('../../../middleware/validateObjectId.middleware');
const { ROLES } = require('../../../config/constants');

// Validator for integer template version route parameter
function validateVersionParam(paramName = 'version') {
  return (req, res, next) => {
    const val = parseInt(req.params[paramName], 10);
    if (isNaN(val) || val < 1 || String(val) !== String(req.params[paramName]).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid version parameter. Must be a positive integer.',
        data: null,
      });
    }
    next();
  };
}

// All admin document type & template routes require authentication, ADMIN role, and user rate limiter
router.use(authenticate, authorize(ROLES.ADMIN), userApiLimiter);

// ---------------------------------------------------------------------------
// Placeholder catalog & Starter template routes
// ---------------------------------------------------------------------------
router.get('/template-placeholders', documentTemplatesController.getPlaceholders);
router.get('/template-starter', documentTemplatesController.getStarterTemplate);

// ---------------------------------------------------------------------------
// Standard DocumentType CRUD routes
// ---------------------------------------------------------------------------
router.get('/', documentTypesController.getAll);
router.post('/', documentTypesController.create);
router.get('/:id', validateObjectIdParam('id'), documentTypesController.getById);
router.put('/:id', validateObjectIdParam('id'), documentTypesController.update);
router.delete('/:id', validateObjectIdParam('id'), documentTypesController.remove);

// ---------------------------------------------------------------------------
// DOCX Template Management routes
// ---------------------------------------------------------------------------
// Upload template (10 per hour per user limiter, max 2MB)
router.post(
  '/:id/templates',
  validateObjectIdParam('id'),
  templateUploadLimiter,
  documentTemplatesController.handleTemplateUpload,
  documentTemplatesController.upload
);

// List template versions for a document type
router.get(
  '/:id/templates',
  validateObjectIdParam('id'),
  documentTemplatesController.list
);

// Switch template mode ('builtin' | 'custom')
router.post(
  '/:id/template-mode',
  validateObjectIdParam('id'),
  documentTemplatesController.setMode
);

// Activate a specific template version
router.post(
  '/:id/templates/:version/activate',
  validateObjectIdParam('id'),
  validateVersionParam('version'),
  documentTemplatesController.activate
);

// Preview a specific template version with example catalog data
router.post(
  '/:id/templates/:version/preview',
  validateObjectIdParam('id'),
  validateVersionParam('version'),
  documentTemplatesController.preview
);

// Download original uploaded template file
router.get(
  '/:id/templates/:version/file',
  validateObjectIdParam('id'),
  validateVersionParam('version'),
  documentTemplatesController.downloadOriginal
);

// Retire a template version (active versions cannot be retired)
router.post(
  '/:id/templates/:version/retire',
  validateObjectIdParam('id'),
  validateVersionParam('version'),
  documentTemplatesController.retire
);

// Delete a template version (blocked if used by an IssuedDocument)
router.delete(
  '/:id/templates/:version',
  validateObjectIdParam('id'),
  validateVersionParam('version'),
  documentTemplatesController.remove
);

module.exports = router;
