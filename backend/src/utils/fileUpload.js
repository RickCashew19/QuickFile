const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { detectFileType } = require('./fileValidator');

// Storage directory outside public folder
const ATTACHMENTS_DIR = path.resolve(__dirname, '../../uploads/attachments');

// Ensure attachments directory exists
if (!fs.existsSync(ATTACHMENTS_DIR)) {
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
}

// Multer memory storage: allows magic bytes inspection before persisting to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB per file
    files: 3, // Maximum 3 files
  },
});

/**
 * Validates magic bytes and saves file with random name outside public folder
 */
function saveValidatedFile(file) {
  if (!file || !file.buffer) {
    const error = new Error('No file buffer provided.');
    error.statusCode = 400;
    throw error;
  }

  // Real file type validation from binary header
  const detected = detectFileType(file.buffer);
  if (!detected) {
    const error = new Error(
      `File "${file.originalname}" has invalid or spoofed content. Only authentic JPG, PNG, WEBP, and PDF files are allowed.`
    );
    error.statusCode = 400;
    throw error;
  }

  // Generate non-guessable random filename
  const randomName = `${crypto.randomBytes(16).toString('hex')}.${detected.ext}`;
  const targetPath = path.join(ATTACHMENTS_DIR, randomName);

  fs.writeFileSync(targetPath, file.buffer);

  return {
    original_name: file.originalname,
    stored_filename: randomName,
    mime_type: detected.mime,
    file_size: file.buffer.length,
    path: randomName,
    uploaded_at: new Date(),
  };
}

/**
 * Safely removes a stored file from the attachments folder
 */
function deleteUploadedFile(storedFilename) {
  if (!storedFilename || typeof storedFilename !== 'string') return;

  // Prevent path traversal
  const safeFilename = path.basename(storedFilename);
  const filePath = path.join(ATTACHMENTS_DIR, safeFilename);

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.warn(`[FileUpload] Failed to delete file ${safeFilename}:`, err.message);
    }
  }
}

/**
 * Returns absolute path for a stored attachment
 */
function getAttachmentPath(storedFilename) {
  if (!storedFilename || typeof storedFilename !== 'string') return null;
  const safeFilename = path.basename(storedFilename);
  return path.join(ATTACHMENTS_DIR, safeFilename);
}

module.exports = {
  upload,
  saveValidatedFile,
  deleteUploadedFile,
  getAttachmentPath,
  ATTACHMENTS_DIR,
};
