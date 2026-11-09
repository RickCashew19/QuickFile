const multer = require('multer');
const documentTemplatesService = require('./documentTemplates.service');
const { MAX_FILE_SIZE } = require('./templateValidator.service');
const asyncHandler = require('../../../utils/asyncHandler');

// Multer memory storage configuration for single template file upload (max 2 MB)
const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
}).single('template');

/**
 * Middleware handling multipart upload and multer-specific errors
 */
function handleTemplateUpload(req, res, next) {
  uploadMiddleware(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: `File size exceeds maximum allowed limit of ${MAX_FILE_SIZE / (1024 * 1024)} MB.`,
          data: null,
        });
      }
      return res.status(400).json({
        success: false,
        message: `File upload error: ${err.message}`,
        data: null,
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: err.message,
        data: null,
      });
    }
    next();
  });
}

/**
 * GET /api/v1/admin/template-placeholders
 */
const getPlaceholders = asyncHandler(async (req, res) => {
  const result = documentTemplatesService.getPlaceholdersCatalog();
  return res.status(200).json({
    success: true,
    message: 'Template placeholders retrieved successfully.',
    data: result,
  });
});

/**
 * GET /api/v1/admin/template-starter
 */
const getStarterTemplate = asyncHandler(async (req, res) => {
  const buffer = await documentTemplatesService.getStarterTemplateBuffer();
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="starter-certificate-template.docx"'
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(buffer);
});

/**
 * POST /api/v1/admin/document-types/:id/templates
 */
const upload = asyncHandler(async (req, res) => {
  const result = await documentTemplatesService.uploadTemplate(
    req.params.id,
    req.file,
    req.user,
    req.ip,
    req.get('User-Agent')
  );

  if (!result.stored) {
    return res.status(400).json({
      success: false,
      message: 'Template validation failed. Please correct the errors and re-upload.',
      data: result.validation,
    });
  }

  return res.status(201).json({
    success: true,
    message: 'Document template uploaded and validated successfully.',
    data: result,
  });
});

/**
 * GET /api/v1/admin/document-types/:id/templates
 */
const list = asyncHandler(async (req, res) => {
  const result = await documentTemplatesService.listTemplates(req.params.id);
  return res.status(200).json({
    success: true,
    message: 'Document templates retrieved successfully.',
    data: result,
  });
});

/**
 * POST /api/v1/admin/document-types/:id/templates/:version/activate
 */
const activate = asyncHandler(async (req, res) => {
  const result = await documentTemplatesService.activateTemplate(
    req.params.id,
    req.params.version,
    req.user,
    req.ip,
    req.get('User-Agent')
  );

  return res.status(200).json({
    success: true,
    message: 'Document template version activated successfully.',
    data: result,
  });
});

/**
 * POST /api/v1/admin/document-types/:id/template-mode
 */
const setMode = asyncHandler(async (req, res) => {
  const { mode } = req.body;
  if (!mode || typeof mode !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Body field "mode" is required and must be "builtin" or "custom".',
      data: null,
    });
  }

  const result = await documentTemplatesService.setTemplateMode(
    req.params.id,
    mode,
    req.user,
    req.ip,
    req.get('User-Agent')
  );

  return res.status(200).json({
    success: true,
    message: `Template mode changed to "${mode}".`,
    data: result,
  });
});

/**
 * POST /api/v1/admin/document-types/:id/templates/:version/preview
 */
const preview = asyncHandler(async (req, res) => {
  const { buffer, filename } = await documentTemplatesService.previewTemplate(
    req.params.id,
    req.params.version
  );

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(buffer);
});

/**
 * GET /api/v1/admin/document-types/:id/templates/:version/file
 */
const downloadOriginal = asyncHandler(async (req, res) => {
  const { buffer, original_name } = await documentTemplatesService.getTemplateFile(
    req.params.id,
    req.params.version
  );

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(original_name)}"`
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(buffer);
});

/**
 * POST /api/v1/admin/document-types/:id/templates/:version/retire
 */
const retire = asyncHandler(async (req, res) => {
  const result = await documentTemplatesService.retireTemplate(
    req.params.id,
    req.params.version,
    req.user,
    req.ip,
    req.get('User-Agent')
  );

  return res.status(200).json({
    success: true,
    message: `Document template version ${req.params.version} retired successfully.`,
    data: result,
  });
});

/**
 * DELETE /api/v1/admin/document-types/:id/templates/:version
 */
const remove = asyncHandler(async (req, res) => {
  const result = await documentTemplatesService.deleteTemplate(
    req.params.id,
    req.params.version,
    req.user,
    req.ip,
    req.get('User-Agent')
  );

  return res.status(200).json({
    success: true,
    message: result.message,
    data: null,
  });
});

module.exports = {
  handleTemplateUpload,
  getPlaceholders,
  getStarterTemplate,
  upload,
  list,
  activate,
  setMode,
  preview,
  downloadOriginal,
  retire,
  remove,
};
