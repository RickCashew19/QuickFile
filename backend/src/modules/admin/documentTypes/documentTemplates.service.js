const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const QRCode = require('qrcode');
const { config } = require('../../../config');
const { DocumentType, DocumentTemplate, IssuedDocument, AuditLog } = require('../../../models');
const {
  PLACEHOLDER_CATALOG,
  buildExampleRenderData,
} = require('../../../utils/templatePlaceholders');
const {
  saveTemplateFile,
  verifyTemplateFileIntegrity,
  deleteTemplateFile,
} = require('../../../utils/templateStorage');
const { validateDocxTemplate, PNG_SIGNATURE } = require('./templateValidator.service');
const { buildStarterDocxBuffer } = require('./templateStarter.service');

const MAX_OUTPUT_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Strips internal paths and stored filenames from DocumentTemplate for safe client responses
 */
function sanitizeTemplate(template) {
  if (!template) return null;
  const doc = template.toObject ? template.toObject() : template;
  return {
    id: doc._id ? doc._id.toString() : doc.id,
    document_type_id: doc.document_type_id ? doc.document_type_id.toString() : null,
    version: doc.version,
    original_name: doc.original_name,
    file_size: doc.file_size,
    sha256: doc.sha256,
    placeholders_found: doc.placeholders_found || [],
    qr_media_path: doc.qr_media_path || null,
    has_qr_placeholder: Boolean(doc.has_qr_placeholder),
    uploaded_by_name: doc.uploaded_by_name,
    is_active: Boolean(doc.is_active),
    retired_at: doc.retired_at || null,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  };
}

/**
 * Renders a DOCX template buffer with renderData.
 * Fails closed: if template has a QR placeholder, QR swap MUST complete;
 * if media part is missing or not PNG, logs server-side and throws a generic 500 error.
 * Never outputs a document that still contains the placeholder picture.
 * Relies on pre-inflation caps (10 MB entry, 20 MB total, 100:1 ratio, 300 entries, plain parser)
 * and enforces a 10 MB maximum output buffer limit.
 */
async function renderDocx(templateBuffer, renderData, options = {}) {
  const { qrData = null, hasQrPlaceholder = false, qrMediaPath = null } = options;
  const zip = new PizZip(templateBuffer);

  // If template has a QR image placeholder, fail closed
  if (hasQrPlaceholder) {
    if (!qrMediaPath || !qrData) {
      console.error(
        `[DocumentTemplates] QR fail-closed: template has QR placeholder but qrMediaPath or qrData is missing.`
      );
      const err = new Error('An unexpected server error occurred while rendering the document.');
      err.statusCode = 500;
      throw err;
    }

    const mediaFile = zip.file(qrMediaPath);
    if (!mediaFile) {
      console.error(
        `[DocumentTemplates] QR fail-closed: placeholder media file "${qrMediaPath}" vanished from template.`
      );
      const err = new Error('An unexpected server error occurred while rendering the document.');
      err.statusCode = 500;
      throw err;
    }

    const mediaBytes = mediaFile.asNodeBuffer();
    const isPng = mediaBytes.length >= 8 && mediaBytes.subarray(0, 8).equals(PNG_SIGNATURE);
    if (!isPng) {
      console.error(
        `[DocumentTemplates] QR fail-closed: placeholder media "${qrMediaPath}" is not a valid PNG.`
      );
      const err = new Error('An unexpected server error occurred while rendering the document.');
      err.statusCode = 500;
      throw err;
    }

    const qrPng = await QRCode.toBuffer(qrData, {
      type: 'png',
      width: 300,
      margin: 1,
      errorCorrectionLevel: 'M',
    });

    zip.file(qrMediaPath, qrPng);
  }

  const doc = new Docxtemplater(zip, {
    paragraphLoop: false,
    linebreaks: true,
    errorLogging: false,
    nullGetter: () => '',
  });

  doc.render(renderData);

  const outputBuffer = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });

  if (outputBuffer.length > MAX_OUTPUT_SIZE) {
    const err = new Error(`Rendered document size exceeds maximum cap of 10 MB.`);
    err.statusCode = 500;
    throw err;
  }

  return outputBuffer;
}

/**
 * Return allowlist placeholder catalog
 */
function getPlaceholdersCatalog() {
  return {
    total: PLACEHOLDER_CATALOG.length,
    placeholders: PLACEHOLDER_CATALOG.map((p) => ({
      key: p.key,
      label: p.label,
      group: p.group,
      example: p.example,
    })),
  };
}

/**
 * Generate starter DOCX buffer
 */
async function getStarterTemplateBuffer() {
  return buildStarterDocxBuffer();
}

/**
 * Upload and validate a new template version for a document type
 */
async function uploadTemplate(documentTypeId, file, actorUser, ipAddress, userAgent) {
  if (!file || !file.buffer) {
    const error = new Error('No template file uploaded. Field "template" is required.');
    error.statusCode = 400;
    throw error;
  }

  const docType = await DocumentType.findById(documentTypeId);
  if (!docType) {
    const error = new Error('Document type not found.');
    error.statusCode = 404;
    throw error;
  }

  // Pure validation check
  const validation = validateDocxTemplate(file.buffer);
  if (!validation.valid) {
    return {
      stored: false,
      validation,
      template: null,
    };
  }

  // Calculate next version
  const lastTemplate = await DocumentTemplate.findOne({ document_type_id: docType._id })
    .sort({ version: -1 })
    .lean();
  const nextVersion = (lastTemplate ? lastTemplate.version : 0) + 1;

  // Store file safely
  const saved = saveTemplateFile(file.buffer, file.originalname);

  // Persist template record with race handling & rollback file on DB error
  let template;
  try {
    template = await DocumentTemplate.create({
      document_type_id: docType._id,
      version: nextVersion,
      original_name: file.originalname,
      stored_filename: saved.stored_filename,
      file_size: saved.file_size,
      sha256: saved.sha256,
      placeholders_found: validation.placeholders_found,
      qr_media_path: validation.qr_media_path,
      has_qr_placeholder: validation.has_qr_placeholder,
      uploaded_by: actorUser._id,
      uploaded_by_name: actorUser.full_name,
      is_active: false,
    });
  } catch (dbErr) {
    if (dbErr.code === 11000) {
      try {
        const retryLast = await DocumentTemplate.findOne({ document_type_id: docType._id })
          .sort({ version: -1 })
          .lean();
        const retryVersion = (retryLast ? retryLast.version : 0) + 1;
        template = await DocumentTemplate.create({
          document_type_id: docType._id,
          version: retryVersion,
          original_name: file.originalname,
          stored_filename: saved.stored_filename,
          file_size: saved.file_size,
          sha256: saved.sha256,
          placeholders_found: validation.placeholders_found,
          qr_media_path: validation.qr_media_path,
          has_qr_placeholder: validation.has_qr_placeholder,
          uploaded_by: actorUser._id,
          uploaded_by_name: actorUser.full_name,
          is_active: false,
        });
      } catch (retryErr) {
        deleteTemplateFile(saved.stored_filename);
        const conflictErr = new Error('Version conflict occurred during template upload. Please try again.');
        conflictErr.statusCode = 409;
        throw conflictErr;
      }
    } else {
      deleteTemplateFile(saved.stored_filename);
      throw dbErr;
    }
  }

  // Audit log (hash & version only, never file contents or path)
  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'DOCUMENT_TEMPLATE_UPLOAD',
    module: 'ADMIN',
    target_id: template._id.toString(),
    target_type: 'DocumentTemplate',
    details: {
      document_type_id: docType._id.toString(),
      version: template.version,
      sha256: template.sha256,
      file_size: template.file_size,
      original_name: template.original_name,
    },
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  return {
    stored: true,
    validation,
    template: sanitizeTemplate(template),
  };
}

/**
 * List all template versions for a document type
 */
async function listTemplates(documentTypeId) {
  const docType = await DocumentType.findById(documentTypeId);
  if (!docType) {
    const error = new Error('Document type not found.');
    error.statusCode = 404;
    throw error;
  }

  const templates = await DocumentTemplate.find({ document_type_id: docType._id })
    .sort({ version: -1 })
    .lean();

  return templates.map(sanitizeTemplate);
}

/**
 * Activate a template version for a document type
 */
async function activateTemplate(documentTypeId, versionNum, actorUser, ipAddress, userAgent) {
  const docType = await DocumentType.findById(documentTypeId);
  if (!docType) {
    const error = new Error('Document type not found.');
    error.statusCode = 404;
    throw error;
  }

  const template = await DocumentTemplate.findOne({
    document_type_id: docType._id,
    version: Number(versionNum),
  });

  if (!template) {
    const error = new Error(`Template version ${versionNum} not found for this document type.`);
    error.statusCode = 404;
    throw error;
  }

  if (template.retired_at) {
    const error = new Error('Cannot activate a retired template version.');
    error.statusCode = 409;
    throw error;
  }

  // Verify file integrity
  const integrity = verifyTemplateFileIntegrity(template.stored_filename, template.sha256);
  if (!integrity.exists || !integrity.matches) {
    console.error(
      `[DocumentTemplates] File integrity check failed for template ${template._id} (exists=${integrity.exists}, matches=${integrity.matches})`
    );
    const error = new Error('An unexpected server error occurred while reading the template file.');
    error.statusCode = 500;
    throw error;
  }

  // Enforce valid template
  const validation = validateDocxTemplate(integrity.buffer);
  if (!validation.valid) {
    const error = new Error('Template is no longer valid and cannot be activated.');
    error.statusCode = 400;
    throw error;
  }

  // Deactivate all other versions
  await DocumentTemplate.updateMany(
    { document_type_id: docType._id },
    { $set: { is_active: false } }
  );

  // Activate selected template
  template.is_active = true;
  await template.save();

  // Set document type to custom mode and link active template
  docType.template_mode = 'custom';
  docType.active_template_id = template._id;
  await docType.save();

  // Audit log
  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'DOCUMENT_TEMPLATE_ACTIVATE',
    module: 'ADMIN',
    target_id: template._id.toString(),
    target_type: 'DocumentTemplate',
    details: {
      document_type_id: docType._id.toString(),
      version: template.version,
      sha256: template.sha256,
    },
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  return {
    template_mode: docType.template_mode,
    active_template_id: docType.active_template_id,
    active_template: sanitizeTemplate(template),
  };
}

/**
 * Switch template mode ('builtin' | 'custom')
 */
async function setTemplateMode(documentTypeId, mode, actorUser, ipAddress, userAgent) {
  if (mode !== 'builtin' && mode !== 'custom') {
    const error = new Error('Invalid mode. template_mode must be either "builtin" or "custom".');
    error.statusCode = 400;
    throw error;
  }

  const docType = await DocumentType.findById(documentTypeId);
  if (!docType) {
    const error = new Error('Document type not found.');
    error.statusCode = 404;
    throw error;
  }

  if (mode === 'custom') {
    if (!docType.active_template_id) {
      const error = new Error(
        'Cannot switch to custom mode: No active template is set for this document type. Please upload and activate a template first.'
      );
      error.statusCode = 400;
      throw error;
    }

    const activeTemplate = await DocumentTemplate.findById(docType.active_template_id);
    if (!activeTemplate || activeTemplate.retired_at) {
      const error = new Error(
        'Cannot switch to custom mode: The active template is missing or has been retired.'
      );
      error.statusCode = 400;
      throw error;
    }
  }

  const previousMode = docType.template_mode;
  docType.template_mode = mode;
  await docType.save();

  // Audit log
  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'DOCUMENT_TYPE_TEMPLATE_MODE_CHANGE',
    module: 'ADMIN',
    target_id: docType._id.toString(),
    target_type: 'DocumentType',
    details: {
      document_type_id: docType._id.toString(),
      previous_mode: previousMode,
      new_mode: mode,
    },
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  return {
    document_type_id: docType._id,
    template_mode: docType.template_mode,
    active_template_id: docType.active_template_id,
  };
}

/**
 * Preview template rendering with catalog example values
 */
async function previewTemplate(documentTypeId, versionNum) {
  const docType = await DocumentType.findById(documentTypeId);
  if (!docType) {
    const error = new Error('Document type not found.');
    error.statusCode = 404;
    throw error;
  }

  const template = await DocumentTemplate.findOne({
    document_type_id: docType._id,
    version: Number(versionNum),
  });

  if (!template) {
    const error = new Error(`Template version ${versionNum} not found.`);
    error.statusCode = 404;
    throw error;
  }

  const integrity = verifyTemplateFileIntegrity(template.stored_filename, template.sha256);
  if (!integrity.exists || !integrity.matches) {
    console.error(
      `[DocumentTemplates] Preview integrity error: file missing or checksum mismatch for template ${template._id}`
    );
    const error = new Error('An unexpected server error occurred while retrieving the document template.');
    error.statusCode = 500;
    throw error;
  }

  const exampleRenderData = buildExampleRenderData();
  const previewQrData = `${config.publicAppUrl}/verify/EXAMPLE-VERIFICATION-CODE`;

  const renderedBuffer = await renderDocx(integrity.buffer, exampleRenderData, {
    qrData: previewQrData,
    hasQrPlaceholder: template.has_qr_placeholder,
    qrMediaPath: template.qr_media_path,
  });

  return {
    buffer: renderedBuffer,
    version: template.version,
  };
}

/**
 * Download original uploaded template file
 */
async function getTemplateFile(documentTypeId, versionNum) {
  const docType = await DocumentType.findById(documentTypeId);
  if (!docType) {
    const error = new Error('Document type not found.');
    error.statusCode = 404;
    throw error;
  }

  const template = await DocumentTemplate.findOne({
    document_type_id: docType._id,
    version: Number(versionNum),
  });

  if (!template) {
    const error = new Error(`Template version ${versionNum} not found.`);
    error.statusCode = 404;
    throw error;
  }

  const integrity = verifyTemplateFileIntegrity(template.stored_filename, template.sha256);
  if (!integrity.exists || !integrity.matches) {
    console.error(
      `[DocumentTemplates] File retrieval integrity error for template ${template._id}`
    );
    const error = new Error('An unexpected server error occurred while retrieving the document template.');
    error.statusCode = 500;
    throw error;
  }

  return {
    buffer: integrity.buffer,
    original_name: template.original_name,
  };
}

/**
 * Retire a template version (409 if active; file stays on disk)
 */
async function retireTemplate(documentTypeId, versionNum, actorUser, ipAddress, userAgent) {
  const docType = await DocumentType.findById(documentTypeId);
  if (!docType) {
    const error = new Error('Document type not found.');
    error.statusCode = 404;
    throw error;
  }

  const template = await DocumentTemplate.findOne({
    document_type_id: docType._id,
    version: Number(versionNum),
  });

  if (!template) {
    const error = new Error(`Template version ${versionNum} not found.`);
    error.statusCode = 404;
    throw error;
  }

  const isActiveInDocType =
    docType.active_template_id &&
    docType.active_template_id.toString() === template._id.toString();

  if (template.is_active || isActiveInDocType) {
    const error = new Error(
      'Cannot retire the active template. Please activate another template or switch mode to builtin before retiring.'
    );
    error.statusCode = 409;
    throw error;
  }

  if (template.retired_at) {
    const error = new Error('Template version is already retired.');
    error.statusCode = 400;
    throw error;
  }

  template.is_active = false;
  template.retired_at = new Date();
  await template.save();

  // Audit log
  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'DOCUMENT_TEMPLATE_RETIRE',
    module: 'ADMIN',
    target_id: template._id.toString(),
    target_type: 'DocumentTemplate',
    details: {
      document_type_id: docType._id.toString(),
      version: template.version,
      sha256: template.sha256,
    },
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  return {
    version: template.version,
    retired_at: template.retired_at,
  };
}

/**
 * Delete a template version (blocked if ever used by an IssuedDocument)
 */
async function deleteTemplate(documentTypeId, versionNum, actorUser, ipAddress, userAgent) {
  const docType = await DocumentType.findById(documentTypeId);
  if (!docType) {
    const error = new Error('Document type not found.');
    error.statusCode = 404;
    throw error;
  }

  const template = await DocumentTemplate.findOne({
    document_type_id: docType._id,
    version: Number(versionNum),
  });

  if (!template) {
    const error = new Error(`Template version ${versionNum} not found.`);
    error.statusCode = 404;
    throw error;
  }

  const isActiveInDocType =
    docType.active_template_id &&
    docType.active_template_id.toString() === template._id.toString();

  if (template.is_active || isActiveInDocType) {
    const error = new Error('Cannot delete the active template.');
    error.statusCode = 409;
    throw error;
  }

  // Check if ever used by any IssuedDocument
  const isUsed = await IssuedDocument.exists({ template_id: template._id });
  if (isUsed) {
    const error = new Error(
      'Cannot delete template version: It has been used to issue certificates and must be preserved for audit and reprinting. You may retire it instead.'
    );
    error.statusCode = 409;
    throw error;
  }

  // Delete file from disk
  deleteTemplateFile(template.stored_filename);

  // Delete record from DB
  await DocumentTemplate.findByIdAndDelete(template._id);

  // Audit log
  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'DOCUMENT_TEMPLATE_DELETE',
    module: 'ADMIN',
    target_id: template._id.toString(),
    target_type: 'DocumentTemplate',
    details: {
      document_type_id: docType._id.toString(),
      version: template.version,
      sha256: template.sha256,
    },
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  return {
    message: `Template version ${versionNum} deleted successfully.`,
  };
}

module.exports = {
  getPlaceholdersCatalog,
  getStarterTemplateBuffer,
  uploadTemplate,
  listTemplates,
  activateTemplate,
  setTemplateMode,
  previewTemplate,
  getTemplateFile,
  retireTemplate,
  deleteTemplate,
  renderDocx,
};
