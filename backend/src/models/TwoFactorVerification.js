const mongoose = require('mongoose');

/**
 * TwoFactorVerification Schema
 * Manages one-time 2FA verification codes sent via email for sensitive operations
 * Enforces attempt limits, 10-minute expiration via MongoDB native TTL index, and SHA-256 hashing.
 */
const twoFactorVerificationSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    action: {
      type: String,
      required: true,
      default: 'API_KEY_UPDATE',
      enum: ['API_KEY_UPDATE', 'SETTINGS_RESET', 'SUPER_ADMIN_ACTION'],
    },
    code_hash: {
      type: String,
      required: true,
    },
    pending_updates: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    pending_reset_keys: {
      type: [String],
      default: [],
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    max_attempts: {
      type: Number,
      default: 3,
    },
    expires_at: {
      type: Date,
      required: true,
      index: { expires: 0 }, // Native MongoDB TTL index purges expired verification records
    },
    verified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
  }
);

twoFactorVerificationSchema.index({ user_id: 1, action: 1 });
twoFactorVerificationSchema.index({ created_at: -1 });

module.exports = mongoose.model('TwoFactorVerification', twoFactorVerificationSchema);
