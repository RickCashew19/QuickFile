const mongoose = require('mongoose');

// Requirement 7: Removed duplicated name fields (uses User.full_name)
const staffDetailSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
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

module.exports = mongoose.model('StaffDetail', staffDetailSchema);
