const mongoose = require('mongoose');
const { VALIDITY_STATUSES } = require('../config/constants');

// Requirement 3: Restored snapshot fields (document_name, issued_to_name, qr_data)
const issuedDocumentSchema = new mongoose.Schema(
  {
    request_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DocumentRequest',
      required: true,
      unique: true,
      index: true,
    },
    certificate_number: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    // Snapshot fields so verification works even if parent request or user is deleted
    document_name: {
      type: String,
      required: true,
      trim: true,
    },
    issued_to_name: {
      type: String,
      required: true,
      trim: true,
    },
    verification_code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    qr_data: {
      type: String,
      required: true,
    },
    qr_code_image: {
      type: String,
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
    validity_status: {
      type: String,
      enum: Object.values(VALIDITY_STATUSES),
      default: VALIDITY_STATUSES.VALID,
      index: true,
    },
    expires_at: {
      type: Date,
      default: null,
    },
    revoked_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    revoked_at: {
      type: Date,
      default: null,
    },
    revoked_reason: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

module.exports = mongoose.model('IssuedDocument', issuedDocumentSchema);
