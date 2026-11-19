const mongoose = require('mongoose');

const passwordResetSchema = new mongoose.Schema(
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
    token_hash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    // Set after the 6-digit PIN is verified in the first step of the two-step
    // reset flow. The hash of a short-lived single-use token is stored here;
    // the raw token is returned to the client and required to set a new password.
    verification_token_hash: {
      type: String,
      default: null,
      index: true,
    },
    verification_expires_at: {
      type: Date,
      default: null,
    },
    expires_at: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
    used: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
  }
);

module.exports = mongoose.model('PasswordReset', passwordResetSchema);
