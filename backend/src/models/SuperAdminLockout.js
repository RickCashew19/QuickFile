const mongoose = require('mongoose');

// Requirement 1: SuperAdminLockout tracking only lockout state and verification timestamps
const superAdminLockoutSchema = new mongoose.Schema(
  {
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

module.exports = mongoose.model('SuperAdminLockout', superAdminLockoutSchema);
