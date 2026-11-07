const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES, USER_STATUSES } = require('../config/constants');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      trim: true,
      minlength: 3,
      maxlength: 50,
      sparse: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password_hash: {
      type: String,
      required: function () {
        // Only required if not logging in via Google OAuth
        return !this.google_id;
      },
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.CITIZEN,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(USER_STATUSES),
      default: USER_STATUSES.ACTIVE,
      index: true,
    },
    google_id: {
      type: String,
      sparse: true,
      index: true,
    },
    last_login_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Method to verify password with bcrypt
userSchema.methods.comparePassword = async function (plainPassword) {
  if (!this.password_hash) return false;
  return bcrypt.compare(plainPassword, this.password_hash);
};

// Method to return clean user object (exclude sensitive password hash)
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password_hash;
  return user;
};

// Static helper to hash passwords
userSchema.statics.hashPassword = async function (plainPassword) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainPassword, salt);
};

module.exports = mongoose.model('User', userSchema);
