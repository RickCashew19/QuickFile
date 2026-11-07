const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { config } = require('../config');

// Ensure upload directory exists
if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

// Storage engine configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, config.uploadDir);
  },
  filename: function (req, file, cb) {
    const randomHex = crypto.randomBytes(6).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    const safeField = file.fieldname.replace(/[^a-zA-Z0-9_-]/g, '');
    cb(null, `${safeField}-${Date.now()}-${randomHex}${ext}`);
  },
});

// File filter to permit only images and PDF documents
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/pdf',
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file format '${file.mimetype}'. Only JPG, PNG, WEBP, and PDF documents are allowed.`
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter,
});

module.exports = upload;

