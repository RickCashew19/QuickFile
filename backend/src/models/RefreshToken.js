const mongoose = require('mongoose');

/**
 * Opaque refresh-token records used by the access/refresh session model.
 *
 * - Only a SHA-256 hash of the token is stored (raw token lives solely in the
 *   httpOnly cookie), so a database leak cannot be replayed as a session.
 * - Tokens form a "family" (one login -> one family). Every rotation issues a
 *   new token in the same family and marks the previous one as used.
 * - Presenting an already-used token means it was stolen and replayed: the
 *   entire family is revoked (reuse detection, RFC 9700 section 4.14.2).
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    family_id: {
      type: String,
      required: true,
      index: true,
    },
    token_hash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    expires_at: {
      type: Date,
      required: true,
      // MongoDB removes expired sessions automatically (sliding idle window).
      index: { expires: 0 },
    },
    absolute_expires_at: {
      type: Date,
      required: true,
    },
    used_at: {
      type: Date,
      default: null,
    },
    revoked_at: {
      type: Date,
      default: null,
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
    timestamps: { createdAt: 'created_at', updatedAt: false },
  }
);

refreshTokenSchema.index({ family_id: 1, revoked_at: 1 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
