const mongoose = require('mongoose');

const citizenProfileSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    first_name: {
      type: String,
      required: true,
      trim: true,
    },
    middle_name: {
      type: String,
      trim: true,
      default: '',
    },
    last_name: {
      type: String,
      required: true,
      trim: true,
    },
    suffix: {
      type: String,
      trim: true,
      default: '',
    },
    // Requirement 7: Change birthdate to a Date type
    birthdate: {
      type: Date,
      required: true,
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      required: true,
    },
    civil_status: {
      type: String,
      enum: ['single', 'married', 'widowed', 'separated'],
      default: 'single',
    },
    contact_number: {
      type: String,
      trim: true,
      default: '',
    },
    address: {
      street_address: { type: String, trim: true, default: '' },
      zone: { type: String, trim: true, default: '' },
      barangay: { type: String, trim: true, default: '' },
      city: { type: String, trim: true, default: '' },
      province: { type: String, trim: true, default: '' },
    },
    valid_id_type: {
      type: String,
      trim: true,
      default: '',
    },
    valid_id_number: {
      type: String,
      trim: true,
      default: '',
    },
    valid_id_image: {
      type: String,
      default: '',
    },
    proof_of_residency_type: {
      type: String,
      trim: true,
      default: '',
    },
    proof_of_residency_image: {
      type: String,
      default: '',
    },
    verification_status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
      index: true,
    },
    verified_at: {
      type: Date,
      default: null,
    },
    verified_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    rejection_reason: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Virtual for full name
citizenProfileSchema.virtual('full_name').get(function () {
  const parts = [this.first_name, this.middle_name, this.last_name, this.suffix];
  return parts.filter(Boolean).join(' ');
});

citizenProfileSchema.set('toJSON', { virtuals: true });
citizenProfileSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('CitizenProfile', citizenProfileSchema);
