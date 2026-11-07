const mongoose = require('mongoose');

const issuedDocumentSchema = new mongoose.Schema(
  {
    request_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DocumentRequest',
      required: true,
      unique: true,
      index: true,
    },
    document_number: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    verification_code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    qr_code_image: {
      type: String, // Base64 data URI or relative path
      required: true,
    },
    issued_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    issued_at: {
      type: Date,
      default: Date.now,
    },
    expiry_date: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['valid', 'revoked', 'expired'],
      default: 'valid',
      index: true,
    },
    revoked_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    revocation_reason: {
      type: String,
      default: '',
    },
    revoked_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

module.exports = mongoose.model('IssuedDocument', issuedDocumentSchema);
