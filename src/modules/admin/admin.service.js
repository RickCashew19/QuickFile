const AdminModel = require('./admin.model');
const CitizenModel = require('../citizen/citizen.model');
const { comparePassword, hashPassword, generateToken } = require('../auth/auth.helper');

class AdminService {
  /**
   * ADM-IAM-01: Administrator Login
   */
  static async login(email, password) {
    if (!email || !password) {
      throw new Error('Administrator email and password are required.');
    }

    const admin = AdminModel.findAdminByEmail(email);
    if (!admin) {
      throw new Error('Invalid administrator credentials.');
    }

    if (!admin.is_active) {
      throw new Error('This administrator account has been disabled.');
    }

    const isMatch = comparePassword(password, admin.password_hash);
    if (!isMatch) {
      throw new Error('Invalid administrator credentials.');
    }

    const token = generateToken({
      id: admin.id,
      email: admin.email,
      role: 'admin',
      fullName: admin.full_name
    });

    AdminModel.logAudit(admin.id, admin.full_name, 'ADMIN_LOGIN', 'users', admin.id, 'Administrator logged in successfully');

    return {
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        fullName: admin.full_name,
        phone: admin.phone
      },
      token
    };
  }

  /**
   * ADM-URM-01: Staff Account Creation
   */
  static async createStaffAccount(adminUser, staffData) {
    const { email, password, fullName, phone, employeeId, position, department } = staffData;

    if (!email || !password || !fullName) {
      throw new Error('Full Name, Email, and Password are required for staff creation.');
    }

    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    // Check if email already in use across system
    const existing = CitizenModel.findUserByEmail(email) || AdminModel.findAdminByEmail(email);
    if (existing) {
      throw new Error('An account with this email already exists.');
    }

    const passwordHash = hashPassword(password);
    const userId = AdminModel.createStaffUser({
      email,
      passwordHash,
      fullName,
      phone,
      employeeId,
      position,
      department
    });

    AdminModel.logAudit(
      adminUser.id,
      adminUser.fullName || adminUser.full_name,
      'STAFF_CREATED',
      'users',
      userId,
      `Created staff account for ${fullName} (${email})`
    );

    return AdminModel.getStaffById(userId);
  }

  /**
   * ADM-URM-02: Staff Account Management (Edit Details & Reset Password)
   */
  static async updateStaffAccount(adminUser, staffId, updateData) {
    const existing = AdminModel.getStaffById(staffId);
    if (!existing) {
      throw new Error('Staff member not found.');
    }

    const updated = AdminModel.updateStaffUser(staffId, updateData);

    if (updateData.newPassword && updateData.newPassword.trim().length >= 6) {
      const passwordHash = hashPassword(updateData.newPassword.trim());
      AdminModel.resetStaffPassword(staffId, passwordHash);
    }

    AdminModel.logAudit(
      adminUser.id,
      adminUser.fullName || adminUser.full_name,
      'STAFF_UPDATED',
      'users',
      staffId,
      `Updated staff information for ${existing.full_name}`
    );

    return updated;
  }

  /**
   * ADM-URM-03: Staff Account Deactivation / Activation
   */
  static async toggleStaffStatus(adminUser, staffId, isActive) {
    const existing = AdminModel.getStaffById(staffId);
    if (!existing) {
      throw new Error('Staff member not found.');
    }

    AdminModel.toggleStaffStatus(staffId, isActive);

    const actionText = isActive ? 'ACTIVATED' : 'DEACTIVATED';
    AdminModel.logAudit(
      adminUser.id,
      adminUser.fullName || adminUser.full_name,
      `STAFF_${actionText}`,
      'users',
      staffId,
      `${actionText} staff account for ${existing.full_name}`
    );

    return {
      success: true,
      message: `Staff account for ${existing.full_name} has been ${actionText.toLowerCase()}.`
    };
  }

  /**
   * ADM-URM-04: Access Control Management (Permissions)
   */
  static async updateStaffAccessControl(adminUser, staffId, permissions) {
    const existing = AdminModel.getStaffById(staffId);
    if (!existing) {
      throw new Error('Staff member not found.');
    }

    const updatedStaff = AdminModel.updateStaffPermissions(staffId, permissions);

    AdminModel.logAudit(
      adminUser.id,
      adminUser.fullName || adminUser.full_name,
      'PERMISSIONS_UPDATED',
      'staff_permissions',
      staffId,
      `Updated access control permissions for ${existing.full_name}`
    );

    return updatedStaff;
  }

  static async getAllStaff() {
    return AdminModel.getAllStaff();
  }

  static async getStaffById(staffId) {
    const staff = AdminModel.getStaffById(staffId);
    if (!staff) {
      throw new Error('Staff member not found.');
    }
    return staff;
  }
}

module.exports = AdminService;

