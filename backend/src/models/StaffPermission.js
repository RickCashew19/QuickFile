const mongoose = require('mongoose');

// Requirement 2: Strictly updated staff permissions (settings are admin-only)
const staffPermissionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    can_review_requests: {
      type: Boolean,
      default: false,
    },
    can_prepare_documents: {
      type: Boolean,
      default: false,
    },
    can_print_documents: {
      type: Boolean,
      default: false,
    },
    can_release_documents: {
      type: Boolean,
      default: false,
    },
    can_verify_qr: {
      type: Boolean,
      default: false,
    },
    can_view_reports: {
      type: Boolean,
      default: false,
    },
    can_archive_records: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

module.exports = mongoose.model('StaffPermission', staffPermissionSchema);
