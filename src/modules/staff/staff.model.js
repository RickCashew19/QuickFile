const { getDatabase } = require('../../config/db');

class StaffModel {
  static findStaffByEmail(email) {
    const db = getDatabase();
    return db.prepare(`
      SELECT u.id, u.email, u.password_hash, u.role, u.full_name, u.phone, u.is_active,
             sd.employee_id, sd.position, sd.department
      FROM users u
      LEFT JOIN staff_details sd ON sd.user_id = u.id
      WHERE u.email = ? COLLATE NOCASE AND u.role = 'staff'
    `).get(email.trim());
  }

  static findStaffById(id) {
    const db = getDatabase();
    return db.prepare(`
      SELECT u.id, u.email, u.role, u.full_name, u.phone, u.is_active, u.created_at,
             sd.employee_id, sd.position, sd.department
      FROM users u
      LEFT JOIN staff_details sd ON sd.user_id = u.id
      WHERE u.id = ? AND u.role = 'staff'
    `).get(id);
  }

  static getStaffPermissions(userId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM staff_permissions WHERE user_id = ?').get(userId);
  }
}

module.exports = StaffModel;

