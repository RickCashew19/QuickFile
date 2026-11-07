const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES } = require('../config/constants');

const userSchema = new mongoose.Schema(
  {
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
        return !this.google_id;
      },
    },
    // Requirement 3: full_name and phone
    full_name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.CITIZEN,
      index: true,
    },
    // Requirement 3: Single active boolean flag
    is_active: {
      type: Boolean,
      default: true,
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
    password_changed_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

userSchema.methods.comparePassword = async function (plainPassword) {
  if (!this.password_hash) return false;
  return bcrypt.compare(plainPassword, this.password_hash);
};

userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password_hash;
  return user;
};

userSchema.statics.hashPassword = async function (plainPassword) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainPassword, salt);
};

module.exports = mongoose.model('User', userSchema);
