const mongoose = require('mongoose');

const staffDetailSchema = new mongoose.Schema(
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
    last_name: {
      type: String,
      required: true,
      trim: true,
    },
    employee_id: {
      type: String,
      trim: true,
      default: '',
    },
    position: {
      type: String,
      trim: true,
      default: 'Barangay Staff',
    },
    department: {
      type: String,
      trim: true,
      default: 'Administration',
    },
    contact_number: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

staffDetailSchema.virtual('full_name').get(function () {
  return `${this.first_name} ${this.last_name}`.trim();
});

staffDetailSchema.set('toJSON', { virtuals: true });
staffDetailSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('StaffDetail', staffDetailSchema);
