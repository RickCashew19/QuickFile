const fileService = require('../services/file.service');
const asyncHandler = require('../helpers/asyncHandler');

/**
 * Serves a protected attachment file
 * GET /api/v1/files/attachments/:filename
 * Strictly checks path traversal, enforces role/owner authorization,
 * sends RFC 5987 Content-Disposition and Cache-Control: private, no-store
 */
const getAttachment = asyncHandler(async (req, res) => {
  const { filename } = req.params;
  const currentUser = req.user;

  const { filePath, mimeType, asciiFallback, encodedName } = await fileService.getAttachmentFile({
    filename,
    currentUser,
  });

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', mimeType);
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`
  );

  return res.sendFile(filePath);
});

module.exports = {
  getAttachment,
};
