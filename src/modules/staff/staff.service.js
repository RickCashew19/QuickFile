const StaffModel = require('./staff.model');
const { comparePassword, generateToken } = require('../auth/auth.helper');

class StaffService {
  /**
   * STF-IAM-01: Staff Login
   * Authenticates barangay staff members and returns authorized session & permissions
   */
  static async login(email, password) {
    if (!email || !password) {
      throw new Error('Staff email and password are required.');
    }

    const staff = StaffModel.findStaffByEmail(email);
    if (!staff) {
      throw new Error('Invalid staff credentials.');
    }

    // Check account status (e.g. deactivated by Administrator ADM-URM-03)
    if (!staff.is_active) {
      throw new Error('Your staff account has been deactivated by the Barangay Administrator.');
    }

    const isMatch = comparePassword(password, staff.password_hash);
    if (!isMatch) {
      throw new Error('Invalid staff credentials.');
    }

    const permissions = StaffModel.getStaffPermissions(staff.id) || {};
    const token = generateToken({
      id: staff.id,
      email: staff.email,
      role: 'staff',
      fullName: staff.full_name,
      employeeId: staff.employee_id
    });

    return {
      user: {
        id: staff.id,
        email: staff.email,
        role: staff.role,
        fullName: staff.full_name,
        phone: staff.phone,
        employeeId: staff.employee_id,
        position: staff.position,
        department: staff.department
      },
      permissions,
      token
    };
  }

  static async getStaffProfile(userId) {
    const staff = StaffModel.findStaffById(userId);
    if (!staff) {
      throw new Error('Staff account not found.');
    }
    const permissions = StaffModel.getStaffPermissions(userId);
    return { staff, permissions };
  }
}

module.exports = StaffService;

