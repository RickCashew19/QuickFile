const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { SUPER_ADMIN_PIN } = require('../config/constants');

const superAdminPinSchema = new mongoose.Schema(
  {
    pin_hash: {
      type: String,
      required: true,
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
    last_changed_at: {
      type: Date,
      default: Date.now,
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Method to verify PIN with lockout protection
superAdminPinSchema.methods.verifyPin = async function (plainPin) {
  // Check if currently locked out
  if (this.locked_until && new Date() < this.locked_until) {
    const remainingMs = this.locked_until.getTime() - Date.now();
    const remainingMinutes = Math.ceil(remainingMs / 60000);
    return {
      success: false,
      isLocked: true,
      remainingMinutes,
      message: `Super Admin PIN is locked due to too many failed attempts. Try again in ${remainingMinutes} minute(s).`,
    };
  }

  const isMatch = await bcrypt.compare(String(plainPin), this.pin_hash);

  if (isMatch) {
    // Reset failed attempts on success
    this.failed_attempts = 0;
    this.locked_until = null;
    this.last_verified_at = new Date();
    await this.save();
    return { success: true };
  } else {
    // Increment failed attempts
    this.failed_attempts += 1;
    let message = 'Invalid Super Admin PIN.';

    if (this.failed_attempts >= SUPER_ADMIN_PIN.MAX_ATTEMPTS) {
      this.locked_until = new Date(Date.now() + SUPER_ADMIN_PIN.LOCKOUT_MINUTES * 60 * 1000);
      message = `Too many failed attempts. Super Admin PIN locked for ${SUPER_ADMIN_PIN.LOCKOUT_MINUTES} minutes.`;
    } else {
      const remaining = SUPER_ADMIN_PIN.MAX_ATTEMPTS - this.failed_attempts;
      message = `Invalid PIN. ${remaining} attempt(s) remaining before lockout.`;
    }

    await this.save();
    return { success: false, isLocked: !!this.locked_until, message };
  }
};

// Static helper to hash PIN
superAdminPinSchema.statics.hashPin = async function (plainPin) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(String(plainPin), salt);
};

module.exports = mongoose.model('SuperAdminPin', superAdminPinSchema);
