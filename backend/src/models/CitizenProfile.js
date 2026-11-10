const mongoose = require('mongoose');
const { VERIFICATION_STATUSES, VOTER_STATUSES } = require('../config/constants');

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
    birthdate: {
      type: Date,
      default: null,
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', ''],
      default: '',
    },
    profile_complete: {
      type: Boolean,
      default: false,
      index: true,
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
    purok_zone: {
      type: String,
      trim: true,
      default: '',
    },
    street_address: {
      type: String,
      trim: true,
      default: '',
    },
    // Requirement 5: Removed hardcoded jurisdiction defaults
    barangay: {
      type: String,
      trim: true,
      default: '',
    },
    city: {
      type: String,
      trim: true,
      default: '',
    },
    province: {
      type: String,
      trim: true,
      default: '',
    },
    occupation: {
      type: String,
      trim: true,
      default: '',
    },
    voter_status: {
      type: String,
      enum: Object.values(VOTER_STATUSES),
      default: VOTER_STATUSES.REGISTERED,
    },
    emergency_contact_name: {
      type: String,
      trim: true,
      default: '',
    },
    emergency_contact_number: {
      type: String,
      trim: true,
      default: '',
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
      enum: Object.values(VERIFICATION_STATUSES),
      default: VERIFICATION_STATUSES.PENDING,
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

citizenProfileSchema.virtual('full_name').get(function () {
  const parts = [this.first_name, this.middle_name, this.last_name, this.suffix];
  return parts.filter(Boolean).join(' ');
});

citizenProfileSchema.set('toJSON', { virtuals: true });
citizenProfileSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('CitizenProfile', citizenProfileSchema);
