const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    module: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    target_id: {
      type: String,
      trim: true,
      default: '',
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ip_address: {
      type: String,
      default: '',
    },
    user_agent: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false }, // No updatedAt on immutable audit logs
  }
);

auditLogSchema.index({ created_at: -1 });

// ============================================================================
// REQUIREMENT 6: Enforce Append-Only Immutability
// Disallow all update, modify, and delete operations on AuditLog documents
// ============================================================================

// Prevent updating an existing saved audit log document
auditLogSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error('[AuditLog] Immutability violation: Audit logs cannot be modified after creation.'));
  }
  next();
});

// Helper error generator for query hooks
function denyAuditLogMutation() {
  throw new Error('[AuditLog] Immutability violation: Audit logs are append-only. Updates and deletions are strictly prohibited.');
}

// Block query-level update operations
auditLogSchema.pre('updateOne', denyAuditLogMutation);
auditLogSchema.pre('updateMany', denyAuditLogMutation);
auditLogSchema.pre('findOneAndUpdate', denyAuditLogMutation);
auditLogSchema.pre('replaceOne', denyAuditLogMutation);

// Block query-level delete operations
auditLogSchema.pre('deleteOne', denyAuditLogMutation);
auditLogSchema.pre('deleteMany', denyAuditLogMutation);
auditLogSchema.pre('findOneAndDelete', denyAuditLogMutation);
auditLogSchema.pre('findOneAndRemove', denyAuditLogMutation);

module.exports = mongoose.model('AuditLog', auditLogSchema);
