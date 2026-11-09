const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Dedicated storage directory outside public folder
const TEMPLATES_DIR = path.resolve(__dirname, '../../uploads/templates');

if (!fs.existsSync(TEMPLATES_DIR)) {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
}

/**
 * Calculates SHA-256 hash of a buffer
 */
function calculateSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Saves a validated template buffer with a random non-guessable name
 */
function saveTemplateFile(buffer, originalname) {
  const sha256 = calculateSha256(buffer);
  const randomName = `${crypto.randomBytes(16).toString('hex')}.docx`;
  const targetPath = path.join(TEMPLATES_DIR, randomName);

  fs.writeFileSync(targetPath, buffer);

  return {
    stored_filename: randomName,
    file_size: buffer.length,
    sha256,
  };
}

/**
 * Resolves absolute path for a stored template file with path-traversal prevention
 */
function getTemplateFilePath(storedFilename) {
  if (!storedFilename || typeof storedFilename !== 'string') return null;
  const safeName = path.basename(storedFilename);
  return path.join(TEMPLATES_DIR, safeName);
}

/**
 * Reads a stored template file buffer from disk
 */
function readTemplateFile(storedFilename) {
  const filePath = getTemplateFilePath(storedFilename);
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath);
}

/**
 * Safely verifies SHA-256 integrity of stored file against recorded hash
 */
function verifyTemplateFileIntegrity(storedFilename, expectedSha256) {
  const buffer = readTemplateFile(storedFilename);
  if (!buffer) return { exists: false, matches: false };
  const actualHash = calculateSha256(buffer);
  return {
    exists: true,
    matches: actualHash === expectedSha256,
    buffer,
  };
}

/**
 * Safely removes a stored template file from disk
 */
function deleteTemplateFile(storedFilename) {
  const filePath = getTemplateFilePath(storedFilename);
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.warn(`[TemplateStorage] Warning: Failed to delete template file ${storedFilename}:`, err.message);
    }
  }
}

module.exports = {
  TEMPLATES_DIR,
  calculateSha256,
  saveTemplateFile,
  getTemplateFilePath,
  readTemplateFile,
  verifyTemplateFileIntegrity,
  deleteTemplateFile,
};
