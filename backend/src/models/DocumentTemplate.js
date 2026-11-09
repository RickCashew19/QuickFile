const mongoose = require('mongoose');

const documentTemplateSchema = new mongoose.Schema(
  {
    document_type_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DocumentType',
      required: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
      min: 1,
    },
    original_name: {
      type: String,
      required: true,
      trim: true,
    },
    stored_filename: {
      type: String,
      required: true,
      trim: true,
    },
    file_size: {
      type: Number,
      required: true,
      min: 0,
    },
    sha256: {
      type: String,
      required: true,
      trim: true,
    },
    placeholders_found: {
      type: [String],
      default: [],
    },
    uploaded_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    uploaded_by_name: {
      type: String,
      required: true,
      trim: true,
    },
    is_active: {
      type: Boolean,
      default: false,
      index: true,
    },
    retired_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Enforce per-document-type unique integer versioning
documentTemplateSchema.index({ document_type_id: 1, version: 1 }, { unique: true });

module.exports = mongoose.model('DocumentTemplate', documentTemplateSchema);
