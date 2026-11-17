const mongoose = require('mongoose');

// Lockout state is tracked per (admin, IP) scope so one actor cannot lock out every administrator.
const superAdminLockoutSchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      default: null,
    },
    failed_attempts: {
      type: Number,
      default: 0,
    },
    locked_until: {
      type: Date,
      default: null,
    },
    last_verified_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Only one state document per concrete scope; legacy/null-scope bootstrap rows are ignored.
superAdminLockoutSchema.index(
  { scope: 1 },
  { unique: true, partialFilterExpression: { scope: { $type: 'string' } } }
);

module.exports = mongoose.model('SuperAdminLockout', superAdminLockoutSchema);

