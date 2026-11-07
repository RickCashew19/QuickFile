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

superAdminPinSchema.methods.verifyPin = async function (plainPin) {
  if (this.locked_until && new Date() < this.locked_until) {
    const remainingMs = this.locked_until.getTime() - Date.now();
    const remainingMinutes = Math.ceil(remainingMs / 60000);
    return {
      success: false,
      is_locked: true,
      remaining_minutes: remainingMinutes,
      message: `Super Admin PIN is locked. Try again in ${remainingMinutes} minute(s).`,
    };
  }

  const isMatch = await bcrypt.compare(String(plainPin), this.pin_hash);

  if (isMatch) {
    this.failed_attempts = 0;
    this.locked_until = null;
    this.last_verified_at = new Date();
    await this.save();
    return { success: true };
  }

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
  return {
    success: false,
    is_locked: !!this.locked_until,
    remaining_attempts: Math.max(0, SUPER_ADMIN_PIN.MAX_ATTEMPTS - this.failed_attempts),
    message,
  };
};

superAdminPinSchema.statics.hashPin = async function (plainPin) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(String(plainPin), salt);
};

module.exports = mongoose.model('SuperAdminPin', superAdminPinSchema);
