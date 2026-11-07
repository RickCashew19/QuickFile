const { DocumentType, DocumentRequest, AuditLog } = require('../../../models');

/**
 * List all document types (including inactive)
 */
async function getAllDocumentTypes() {
  return DocumentType.find({}).sort({ created_at: -1 }).lean();
}

/**
 * Get document type by ID
 */
async function getDocumentTypeById(id) {
  const docType = await DocumentType.findById(id);
  if (!docType) {
    const error = new Error('Document type not found.');
    error.statusCode = 404;
    throw error;
  }
  return docType;
}

/**
 * Create a new document type
 */
async function createDocumentType(data, actorUser, ipAddress, userAgent) {
  const { name, code, description, fee, processing_days, requirements, is_active, form_template } = data;

  if (!name || !code) {
    const error = new Error('Validation error: Document name and code are required.');
    error.statusCode = 400;
    throw error;
  }

  const normalizedCode = code.toUpperCase().trim();
  const existing = await DocumentType.findOne({ code: normalizedCode });
  if (existing) {
    const error = new Error(`Document type with code "${normalizedCode}" already exists.`);
    error.statusCode = 409;
    throw error;
  }

  const newDocType = await DocumentType.create({
    name: name.trim(),
    code: normalizedCode,
    description: (description || '').trim(),
    fee: fee !== undefined ? Number(fee) : 0,
    processing_days: processing_days !== undefined ? Number(processing_days) : 1,
    requirements: Array.isArray(requirements) ? requirements : [],
    is_active: is_active !== undefined ? Boolean(is_active) : true,
    form_template: form_template || {},
  });

  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'DOCUMENT_TYPE_CREATE',
    module: 'ADMIN',
    target_id: newDocType._id.toString(),
    target_type: 'DocumentType',
    details: { name: newDocType.name, code: newDocType.code, fee: newDocType.fee },
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  return newDocType;
}

/**
 * Update an existing document type
 */
async function updateDocumentType(id, data, actorUser, ipAddress, userAgent) {
  const docType = await DocumentType.findById(id);
  if (!docType) {
    const error = new Error('Document type not found.');
    error.statusCode = 404;
    throw error;
  }

  const updatableFields = ['name', 'code', 'description', 'fee', 'processing_days', 'requirements', 'is_active', 'form_template'];

  if (data.code && data.code.toUpperCase().trim() !== docType.code) {
    const duplicate = await DocumentType.findOne({ code: data.code.toUpperCase().trim() });
    if (duplicate) {
      const error = new Error(`Document type with code "${data.code}" already exists.`);
      error.statusCode = 409;
      throw error;
    }
    docType.code = data.code.toUpperCase().trim();
  }

  for (const field of updatableFields) {
    if (field !== 'code' && data[field] !== undefined) {
      if (field === 'name' || field === 'description') {
        docType[field] = data[field].trim();
      } else if (field === 'fee' || field === 'processing_days') {
        docType[field] = Number(data[field]);
      } else if (field === 'is_active') {
        docType[field] = Boolean(data[field]);
      } else {
        docType[field] = data[field];
      }
    }
  }

  await docType.save();

  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'DOCUMENT_TYPE_UPDATE',
    module: 'ADMIN',
    target_id: docType._id.toString(),
    target_type: 'DocumentType',
    details: { name: docType.name, code: docType.code, updated_fields: Object.keys(data) },
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  return docType;
}

/**
 * Delete a document type
 * Strictly blocked if referenced by any DocumentRequest; suggests deactivation instead
 */
async function deleteDocumentType(id, actorUser, ipAddress, userAgent) {
  const docType = await DocumentType.findById(id);
  if (!docType) {
    const error = new Error('Document type not found.');
    error.statusCode = 404;
    throw error;
  }

  // Check if any document requests reference this document type
  const requestCount = await DocumentRequest.countDocuments({ document_type_id: id });
  if (requestCount > 0) {
    const error = new Error(
      `Cannot delete document type "${docType.name}" because ${requestCount} existing document request(s) reference it. Please deactivate it instead.`
    );
    error.statusCode = 400;
    throw error;
  }

  await DocumentType.findByIdAndDelete(id);

  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'DOCUMENT_TYPE_DELETE',
    module: 'ADMIN',
    target_id: id.toString(),
    target_type: 'DocumentType',
    details: { name: docType.name, code: docType.code },
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  return {
    message: `Document type "${docType.name}" deleted successfully.`,
  };
}

module.exports = {
  getAllDocumentTypes,
  getDocumentTypeById,
  createDocumentType,
  updateDocumentType,
  deleteDocumentType,
};
