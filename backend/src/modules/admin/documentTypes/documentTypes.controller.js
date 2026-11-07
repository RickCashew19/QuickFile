const documentTypesService = require('./documentTypes.service');
const asyncHandler = require('../../../utils/asyncHandler');

/**
 * List all document types
 * GET /api/v1/admin/document-types
 */
const getAll = asyncHandler(async (req, res) => {
  const result = await documentTypesService.getAllDocumentTypes();

  return res.status(200).json({
    success: true,
    message: 'Document types retrieved successfully.',
    data: result,
  });
});

/**
 * Get single document type by ID
 * GET /api/v1/admin/document-types/:id
 */
const getById = asyncHandler(async (req, res) => {
  const result = await documentTypesService.getDocumentTypeById(req.params.id);

  return res.status(200).json({
    success: true,
    message: 'Document type retrieved successfully.',
    data: result,
  });
});

/**
 * Create a new document type
 * POST /api/v1/admin/document-types
 */
const create = asyncHandler(async (req, res) => {
  const { name, code } = req.body;
  if (!name || !code || typeof name !== 'string' || typeof code !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Validation error: Document name and code must be non-empty strings.',
      data: null,
    });
  }

  const result = await documentTypesService.createDocumentType(
    req.body,
    req.user,
    req.ip,
    req.get('User-Agent')
  );

  return res.status(201).json({
    success: true,
    message: 'Document type created successfully.',
    data: result,
  });
});

/**
 * Update document type
 * PUT /api/v1/admin/document-types/:id
 */
const update = asyncHandler(async (req, res) => {
  const result = await documentTypesService.updateDocumentType(
    req.params.id,
    req.body,
    req.user,
    req.ip,
    req.get('User-Agent')
  );

  return res.status(200).json({
    success: true,
    message: 'Document type updated successfully.',
    data: result,
  });
});

/**
 * Delete document type (blocked if referenced by DocumentRequest)
 * DELETE /api/v1/admin/document-types/:id
 */
const remove = asyncHandler(async (req, res) => {
  const result = await documentTypesService.deleteDocumentType(
    req.params.id,
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
  getAll,
  getById,
  create,
  update,
  remove,
};

