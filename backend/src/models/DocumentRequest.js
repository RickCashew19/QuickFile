const mongoose = require('mongoose');
const { REQUEST_STATUSES, PAYMENT_STATUSES } = require('../config/constants');

const attachmentSchema = new mongoose.Schema(
  {
    original_name: { type: String, required: true },
    stored_filename: { type: String, required: true },
    mime_type: { type: String, required: true },
    file_size: { type: Number, required: true },
    path: { type: String, required: true },
    uploaded_at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const documentRequestSchema = new mongoose.Schema(
  {
    tracking_number: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    citizen_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    document_type_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DocumentType',
      required: true,
      index: true,
    },
    purpose: {
      type: String,
      required: true,
      trim: true,
    },
    copies: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      max: 10,
    },
    status: {
      type: String,
      enum: Object.values(REQUEST_STATUSES),
      default: REQUEST_STATUSES.PENDING,
      index: true,
    },
    remarks: {
      type: String,
      trim: true,
      default: '',
    },
    rejection_reason: {
      type: String,
      trim: true,
      default: '',
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    form_data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    fee: {
      type: Number,
      default: 0,
      min: 0,
    },
    payment_status: {
      type: String,
      enum: Object.values(PAYMENT_STATUSES),
      default: PAYMENT_STATUSES.FREE,
      index: true,
    },
    paid_at: {
      type: Date,
      default: null,
    },
    assigned_staff_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approved_at: {
      type: Date,
      default: null,
    },
    rejected_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    rejected_at: {
      type: Date,
      default: null,
    },
    ready_at: {
      type: Date,
      default: null,
    },
    completed_at: {
      type: Date,
      default: null,
    },
    cancelled_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Virtual for formatted reference
documentRequestSchema.index({ citizen_id: 1, status: 1 });
documentRequestSchema.index({ created_at: -1 });

module.exports = mongoose.model('DocumentRequest', documentRequestSchema);
