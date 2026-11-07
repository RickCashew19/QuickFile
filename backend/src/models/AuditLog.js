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
    timestamps: { createdAt: 'created_at', updatedAt: false }, // Append-only immutable log
  }
);

auditLogSchema.index({ created_at: -1 });

// Enforce append-only immutability: block all mutation operations
auditLogSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error('[AuditLog] Immutability violation: Audit logs cannot be modified after creation.'));
  }
  next();
});

function denyAuditLogMutation() {
  throw new Error('[AuditLog] Immutability violation: Audit logs are append-only. Updates and deletions are strictly prohibited.');
}

auditLogSchema.pre('updateOne', denyAuditLogMutation);
auditLogSchema.pre('updateMany', denyAuditLogMutation);
auditLogSchema.pre('findOneAndUpdate', denyAuditLogMutation);
auditLogSchema.pre('replaceOne', denyAuditLogMutation);
auditLogSchema.pre('deleteOne', denyAuditLogMutation);
auditLogSchema.pre('deleteMany', denyAuditLogMutation);
auditLogSchema.pre('findOneAndDelete', denyAuditLogMutation);
auditLogSchema.pre('findOneAndRemove', denyAuditLogMutation);

module.exports = mongoose.model('AuditLog', auditLogSchema);
