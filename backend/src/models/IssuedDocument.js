const mongoose = require('mongoose');
const { VALIDITY_STATUSES } = require('../config/constants');

// Requirement 6: Certificate number, validity_status, expires_at, revoked_at, revoked_reason
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
    verification_code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
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
