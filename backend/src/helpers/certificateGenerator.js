const crypto = require('crypto');
const qrcode = require('qrcode');
const { IssuedDocument } = require('../models');

/**
 * Generates a unique certificate number in the format:
 * BRGY-{DOC_CODE}-{YEAR}-{6 random digits}
 * Retries on collision up to 5 times.
 */
async function generateUniqueCertificateNumber(docCode, year = new Date().getFullYear()) {
  const cleanCode = String(docCode || 'DOC').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    attempts += 1;
    const random6 = Math.floor(100000 + Math.random() * 900000).toString();
    const candidate = `BRGY-${cleanCode}-${year}-${random6}`;

    const existing = await IssuedDocument.findOne({ certificate_number: candidate });
    if (!existing) {
      return candidate;
    }
  }

  // Fallback with crypto random bytes if collisions occur
  const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  return `BRGY-${cleanCode}-${year}-${randomSuffix}`;
}

/**
 * Generates a cryptographic verification code
 * At least 20 characters, URL-safe, completely independent of tracking number
 */
function generateVerificationCode() {
  return crypto.randomBytes(16).toString('hex').toUpperCase();
}

/**
 * Generates QR Code Data URL for verification link
 */
async function generateQrCodeDataUrl(url) {
  return await qrcode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    margin: 2,
    width: 300,
  });
}

module.exports = {
  generateUniqueCertificateNumber,
  generateVerificationCode,
  generateQrCodeDataUrl,
};
