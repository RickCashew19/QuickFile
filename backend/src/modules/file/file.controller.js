const fs = require('fs');
const path = require('path');
const { DocumentRequest, StaffPermission } = require('../../models');
const { ROLES } = require('../../config/constants');
const { getAttachmentPath } = require('../../utils/fileUpload');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * Serves a protected attachment file
 * GET /api/v1/files/attachments/:filename
 * Strictly checks path traversal and enforces role / owner authorization
 */
const getAttachment = asyncHandler(async (req, res) => {
  const { filename } = req.params;

  // 1. Strict Path Traversal Mitigation
  if (
    !filename ||
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\') ||
    path.basename(filename) !== filename
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid file parameter. Path traversal is strictly prohibited.',
      data: null,
    });
  }

  // 2. Locate request referencing this stored attachment
  const request = await DocumentRequest.findOne({
    'attachments.stored_filename': filename,
  });

  if (!request) {
    return res.status(404).json({
      success: false,
      message: 'File not found.',
      data: null,
    });
  }

  // 3. Authorization check
  const currentUser = req.user;

  if (currentUser.role === ROLES.CITIZEN) {
    // A citizen attempting to access another citizen's file gets 404
    if (request.citizen_id.toString() !== currentUser._id.toString()) {
      return res.status(404).json({
        success: false,
        message: 'File not found.',
        data: null,
      });
    }
  } else if (currentUser.role === ROLES.STAFF) {
    // Staff must have can_review_requests permission
    const permission = await StaffPermission.findOne({ user_id: currentUser._id });
    if (!permission || !permission.can_review_requests) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You do not have permission to view request attachments.',
        data: null,
      });
    }
  } else if (currentUser.role !== ROLES.ADMIN) {
    // Unknown or unauthorized role
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Access denied.',
      data: null,
    });
  }

  // 4. Verify file exists on disk
  const filePath = getAttachmentPath(filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      message: 'Attachment file not found on disk storage.',
      data: null,
    });
  }

  const attachmentMeta = request.attachments.find((att) => att.stored_filename === filename);
  const mimeType = attachmentMeta?.mime_type || 'application/octet-stream';
  const originalName = attachmentMeta?.original_name || filename;
  const safeOriginalName = originalName.replace(/["\r\n\0]/g, '_');

  // 5. Send secure headers and stream file
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${safeOriginalName}"`);

  return res.sendFile(filePath);
});

module.exports = {
  getAttachment,
};
