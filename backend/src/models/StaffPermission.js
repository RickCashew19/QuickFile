const mongoose = require('mongoose');

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
    can_approve_requests: {
      type: Boolean,
      default: false,
    },
    can_issue_documents: {
      type: Boolean,
      default: false,
    },
    can_manage_residents: {
      type: Boolean,
      default: false,
    },
    can_view_reports: {
      type: Boolean,
      default: false,
    },
    can_manage_settings: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

module.exports = mongoose.model('StaffPermission', staffPermissionSchema);
