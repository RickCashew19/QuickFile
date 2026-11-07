const mongoose = require('mongoose');

const documentTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    fee: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    processing_days: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    requirements: {
      type: [String],
      default: [],
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },
    form_template: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

module.exports = mongoose.model('DocumentType', documentTypeSchema);
