const fs = require('fs');
const path = require('path');
const { DocumentRequest, StaffPermission } = require('../models');
const { ROLES } = require('../config/constants');
const { getAttachmentPath } = require('../helpers/fileUpload');

/**
 * Service for securely retrieving and authorizing document attachments
 */
class FileService {
  /**
   * Retrieves and authorizes access to a stored attachment file
   * @param {Object} params
   * @param {string} params.filename
   * @param {Object} params.currentUser
   * @returns {Promise<{ filePath: string, mimeType: string, asciiFallback: string, encodedName: string }>}
   */
  async getAttachmentFile({ filename, currentUser }) {
    // 1. Strict Path Traversal Mitigation
    if (
      !filename ||
      filename.includes('..') ||
      filename.includes('/') ||
      filename.includes('\\') ||
      path.basename(filename) !== filename
    ) {
      const err = new Error('Invalid file parameter. Path traversal is strictly prohibited.');
      err.statusCode = 400;
      throw err;
    }

    // 2. Locate request referencing this stored attachment
    const request = await DocumentRequest.findOne({
      'attachments.stored_filename': filename,
    });

    if (!request) {
      const err = new Error('File not found.');
      err.statusCode = 404;
      throw err;
    }

    // 3. Authorization check
    if (currentUser.role === ROLES.CITIZEN) {
      if (request.citizen_id.toString() !== currentUser._id.toString()) {
        const err = new Error('File not found.');
        err.statusCode = 404;
        throw err;
      }
    } else if (currentUser.role === ROLES.STAFF) {
      const permission = await StaffPermission.findOne({ user_id: currentUser._id });
      if (!permission || !permission.can_review_requests) {
        const err = new Error('Forbidden: You do not have permission to view request attachments.');
        err.statusCode = 403;
        throw err;
      }
    } else if (currentUser.role !== ROLES.ADMIN) {
      const err = new Error('Forbidden: Access denied.');
      err.statusCode = 403;
      throw err;
    }

    // 4. Verify file exists on disk
    const filePath = getAttachmentPath(filename);
    if (!fs.existsSync(filePath)) {
      const err = new Error('Attachment file not found on disk storage.');
      err.statusCode = 404;
      throw err;
    }

    const attachmentMeta = request.attachments.find((att) => att.stored_filename === filename);
    const mimeType = attachmentMeta?.mime_type || 'application/octet-stream';
    const originalName = attachmentMeta?.original_name || filename;

    // 5. Send secure headers (RFC 5987 Unicode filename and ASCII fallback)
    const asciiFallback = originalName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    const encodedName = encodeURIComponent(originalName).replace(
      /['()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
    );

    return {
      filePath,
      mimeType,
      asciiFallback,
      encodedName,
    };
  }
}

module.exports = new FileService();
