const { getDatabase } = require('../../config/db');

class CitizenModel {
  static createUser({ email, passwordHash, password, fullName, phone }) {
    const db = getDatabase();
    const hash = passwordHash || password || '';
    const stmt = db.prepare(`
      INSERT INTO users (email, password_hash, role, full_name, phone, is_active)
      VALUES (?, ?, 'citizen', ?, ?, 1)
    `);
    const result = stmt.run(email.toLowerCase().trim(), hash, fullName.trim(), phone || null);
    return result.lastInsertRowid;
  }

  static findUserByEmail(email) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE AND role = ?').get(email.trim(), 'citizen');
  }

  static findUserById(id) {
    const db = getDatabase();
    return db.prepare('SELECT id, email, role, full_name, phone, is_active, created_at FROM users WHERE id = ?').get(id);
  }

  static getProfileByUserId(userId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM citizen_profiles WHERE user_id = ?').get(userId);
  }

  static createProfile(userId, data) {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO citizen_profiles (
        user_id, first_name, middle_name, last_name, suffix,
        birthdate, gender, civil_status, purok_zone, street_address,
        contact_number, occupation, voter_status,
        emergency_contact_name, emergency_contact_number,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(
      userId,
      data.first_name || '',
      data.middle_name || '',
      data.last_name || '',
      data.suffix || '',
      data.birthdate || '',
      data.gender || '',
      data.civil_status || '',
      data.purok_zone || '',
      data.street_address || '',
      data.contact_number || '',
      data.occupation || '',
      data.voter_status || 'Unregistered',
      data.emergency_contact_name || '',
      data.emergency_contact_number || ''
    );
    return this.getProfileByUserId(userId);
  }

  static updateProfile(userId, data) {
    const db = getDatabase();
    const existing = this.getProfileByUserId(userId);
    if (!existing) {
      return this.createProfile(userId, data);
    }

    const stmt = db.prepare(`
      UPDATE citizen_profiles SET
        first_name = ?,
        middle_name = ?,
        last_name = ?,
        suffix = ?,
        birthdate = ?,
        gender = ?,
        civil_status = ?,
        purok_zone = ?,
        street_address = ?,
        contact_number = ?,
        occupation = ?,
        voter_status = ?,
        emergency_contact_name = ?,
        emergency_contact_number = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `);

    stmt.run(
      data.first_name !== undefined ? data.first_name : existing.first_name,
      data.middle_name !== undefined ? data.middle_name : existing.middle_name,
      data.last_name !== undefined ? data.last_name : existing.last_name,
      data.suffix !== undefined ? data.suffix : existing.suffix,
      data.birthdate !== undefined ? data.birthdate : existing.birthdate,
      data.gender !== undefined ? data.gender : existing.gender,
      data.civil_status !== undefined ? data.civil_status : existing.civil_status,
      data.purok_zone !== undefined ? data.purok_zone : existing.purok_zone,
      data.street_address !== undefined ? data.street_address : existing.street_address,
      data.contact_number !== undefined ? data.contact_number : existing.contact_number,
      data.occupation !== undefined ? data.occupation : existing.occupation,
      data.voter_status !== undefined ? data.voter_status : existing.voter_status,
      data.emergency_contact_name !== undefined ? data.emergency_contact_name : existing.emergency_contact_name,
      data.emergency_contact_number !== undefined ? data.emergency_contact_number : existing.emergency_contact_number,
      userId
    );

    return this.getProfileByUserId(userId);
  }

  static createPasswordReset(userId, token, expiresAt) {
    const db = getDatabase();
    // Invalidate existing unused tokens for this user
    db.prepare('UPDATE password_resets SET is_used = 1 WHERE user_id = ? AND is_used = 0').run(userId);

    const stmt = db.prepare(`
      INSERT INTO password_resets (user_id, token, expires_at, is_used)
      VALUES (?, ?, ?, 0)
    `);
    stmt.run(userId, token, expiresAt.toISOString());
  }

  static findValidPasswordReset(token) {
    const db = getDatabase();
    return db.prepare(`
      SELECT pr.*, u.email, u.full_name, u.role
      FROM password_resets pr
      JOIN users u ON u.id = pr.user_id
      WHERE pr.token = ? AND pr.is_used = 0 AND datetime(pr.expires_at) > datetime('now')
    `).get(token);
  }

  static markPasswordResetUsed(token) {
    const db = getDatabase();
    db.prepare('UPDATE password_resets SET is_used = 1 WHERE token = ?').run(token);
  }

  static updatePassword(userId, newPasswordHash) {
    const db = getDatabase();
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newPasswordHash, userId);
  }
}

module.exports = CitizenModel;
