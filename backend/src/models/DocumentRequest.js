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
    created_by_staff_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    purpose: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
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
    unit_fee: {
      type: Number,
      default: 0,
      min: 0,
    },
    fee: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Requirement 6: Includes 'waived' in PAYMENT_STATUSES (free, unpaid, paid, waived)
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
    // Item 5: Explicit payment auditing fields
    payment_reference: {
      type: String,
      default: '',
      maxlength: 50,
      trim: true,
    },
    waiver_reason: {
      type: String,
      default: '',
      maxlength: 200,
      trim: true,
    },
    payment_recorded_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    form_data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    attachment_name: {
      type: String,
      default: '',
    },
    attachment_path: {
      type: String,
      default: '',
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    rejection_reason: {
      type: String,
      default: '',
      maxlength: 500,
      trim: true,
    },
    cancellation_reason: {
      type: String,
      default: '',
      maxlength: 500,
      trim: true,
    },
    processing_notes: {
      type: String,
      default: '',
      maxlength: 1000,
    },
    reviewed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewed_at: {
      type: Date,
      default: null,
    },
    prepared_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    prepared_at: {
      type: Date,
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
    ready_at: {
      type: Date,
      default: null,
    },
    rejected_at: {
      type: Date,
      default: null,
    },
    released_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    released_at: {
      type: Date,
      default: null,
    },
    archived_at: {
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

documentRequestSchema.index({ citizen_id: 1, status: 1 });
documentRequestSchema.index({ created_at: -1 });

module.exports = mongoose.model('DocumentRequest', documentRequestSchema);
