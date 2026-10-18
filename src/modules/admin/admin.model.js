const { getDatabase } = require('../../config/db');

class AdminModel {
  static findAdminByEmail(email) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE AND role = ?').get(email.trim(), 'admin');
  }

  static findAdminById(id) {
    const db = getDatabase();
    return db.prepare('SELECT id, email, role, full_name, phone, is_active, created_at FROM users WHERE id = ? AND role = ?').get(id, 'admin');
  }

  static getAllStaff() {
    const db = getDatabase();
    return db.prepare(`
      SELECT 
        u.id, u.email, u.role, u.full_name, u.phone, u.is_active, u.created_at, u.updated_at,
        sd.employee_id, sd.position, sd.department,
        sp.can_review_requests, sp.can_prepare_documents, sp.can_print_documents,
        sp.can_release_documents, sp.can_verify_qr, sp.can_view_reports, sp.can_archive_records
      FROM users u
      LEFT JOIN staff_details sd ON sd.user_id = u.id
      LEFT JOIN staff_permissions sp ON sp.user_id = u.id
      WHERE u.role = 'staff'
      ORDER BY u.created_at DESC
    `).all();
  }

  static getStaffById(userId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT 
        u.id, u.email, u.role, u.full_name, u.phone, u.is_active, u.created_at,
        sd.employee_id, sd.position, sd.department,
        sp.can_review_requests, sp.can_prepare_documents, sp.can_print_documents,
        sp.can_release_documents, sp.can_verify_qr, sp.can_view_reports, sp.can_archive_records
      FROM users u
      LEFT JOIN staff_details sd ON sd.user_id = u.id
      LEFT JOIN staff_permissions sp ON sp.user_id = u.id
      WHERE u.id = ? AND u.role = 'staff'
    `).get(userId);
  }

  static createStaffUser({ email, passwordHash, fullName, phone, employeeId, position, department }) {
    const db = getDatabase();
    const createTransaction = db.transaction(() => {
      const insertUser = db.prepare(`
        INSERT INTO users (email, password_hash, role, full_name, phone, is_active)
        VALUES (?, ?, 'staff', ?, ?, 1)
      `);
      const userResult = insertUser.run(email.toLowerCase().trim(), passwordHash, fullName.trim(), phone || null);
      const userId = userResult.lastInsertRowid;

      const insertDetails = db.prepare(`
        INSERT INTO staff_details (user_id, employee_id, position, department)
        VALUES (?, ?, ?, ?)
      `);
      insertDetails.run(userId, employeeId || `STF-${Date.now().toString().slice(-4)}`, position || 'Barangay Staff', department || 'Document Services');

      const insertPerms = db.prepare(`
        INSERT INTO staff_permissions (
          user_id, can_review_requests, can_prepare_documents, can_print_documents,
          can_release_documents, can_verify_qr, can_view_reports, can_archive_records
        ) VALUES (?, 1, 1, 1, 1, 1, 0, 0)
      `);
      insertPerms.run(userId);

      return userId;
    });

    return createTransaction();
  }

  static updateStaffUser(userId, { fullName, phone, position, department }) {
    const db = getDatabase();
    const updateTransaction = db.transaction(() => {
      db.prepare(`
        UPDATE users 
        SET full_name = ?, phone = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND role = 'staff'
      `).run(fullName.trim(), phone || null, userId);

      db.prepare(`
        UPDATE staff_details
        SET position = ?, department = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(position || 'Barangay Staff', department || 'Document Services', userId);
    });

    updateTransaction();
    return this.getStaffById(userId);
  }

  static toggleStaffStatus(userId, isActive) {
    const db = getDatabase();
    db.prepare(`
      UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND role = 'staff'
    `).run(isActive ? 1 : 0, userId);
  }

  static updateStaffPermissions(userId, permissions) {
    const db = getDatabase();
    const existing = db.prepare('SELECT id FROM staff_permissions WHERE user_id = ?').get(userId);

    if (existing) {
      db.prepare(`
        UPDATE staff_permissions SET
          can_review_requests = ?,
          can_prepare_documents = ?,
          can_print_documents = ?,
          can_release_documents = ?,
          can_verify_qr = ?,
          can_view_reports = ?,
          can_archive_records = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(
        permissions.can_review_requests ? 1 : 0,
        permissions.can_prepare_documents ? 1 : 0,
        permissions.can_print_documents ? 1 : 0,
        permissions.can_release_documents ? 1 : 0,
        permissions.can_verify_qr ? 1 : 0,
        permissions.can_view_reports ? 1 : 0,
        permissions.can_archive_records ? 1 : 0,
        userId
      );
    } else {
      db.prepare(`
        INSERT INTO staff_permissions (
          user_id, can_review_requests, can_prepare_documents, can_print_documents,
          can_release_documents, can_verify_qr, can_view_reports, can_archive_records
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        permissions.can_review_requests ? 1 : 0,
        permissions.can_prepare_documents ? 1 : 0,
        permissions.can_print_documents ? 1 : 0,
        permissions.can_release_documents ? 1 : 0,
        permissions.can_verify_qr ? 1 : 0,
        permissions.can_view_reports ? 1 : 0,
        permissions.can_archive_records ? 1 : 0
      );
    }

    return this.getStaffById(userId);
  }

  static resetStaffPassword(userId, passwordHash) {
    const db = getDatabase();
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND role = "staff"').run(passwordHash, userId);
  }

  static logAudit(actorId, actorName, action, targetType, targetId, details) {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO audit_logs (actor_id, actor_name, action, target_type, target_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(actorId, actorName, action, targetType, targetId, details);
  }
}

module.exports = AdminModel;

