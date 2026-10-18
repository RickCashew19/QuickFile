const { getDatabase } = require('../../config/db');

class DocumentModel {
  static get db() {
    return getDatabase();
  }

  static findAllActive() {
    return this.db.prepare(`
      SELECT * FROM document_types 
      WHERE is_active = 1 
      ORDER BY name ASC
    `).all();
  }

  static findAll() {
    return this.db.prepare(`
      SELECT * FROM document_types 
      ORDER BY is_active DESC, name ASC
    `).all();
  }

  static findById(id) {
    return this.db.prepare(`
      SELECT * FROM document_types 
      WHERE id = ?
    `).get(id);
  }

  static findByCode(code) {
    return this.db.prepare(`
      SELECT * FROM document_types 
      WHERE code = ? COLLATE NOCASE
    `).get(code);
  }

  static create({ code, name, description, fee, processingDays, requirementsText }) {
    const stmt = this.db.prepare(`
      INSERT INTO document_types (code, name, description, fee, processing_days, requirements_text, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    const result = stmt.run(code, name, description, Number(fee) || 0, Number(processingDays) || 1, requirementsText || '');
    return this.findById(result.lastInsertRowid);
  }

  static update(id, { name, description, fee, processingDays, requirementsText, isActive }) {
    const stmt = this.db.prepare(`
      UPDATE document_types
      SET name = ?, description = ?, fee = ?, processing_days = ?, requirements_text = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(name, description, Number(fee) || 0, Number(processingDays) || 1, requirementsText, isActive ? 1 : 0, id);
    return this.findById(id);
  }

  static delete(id) {
    return this.db.prepare(`
      DELETE FROM document_types WHERE id = ?
    `).run(id);
  }
}

module.exports = DocumentModel;

