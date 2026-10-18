const { getDatabase } = require('../../config/db');

class SettingsModel {
  static get(key) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM app_settings WHERE key = ?').get(key);
  }

  static getValue(key, defaultValue = null) {
    const row = this.get(key);
    return row ? row.value : defaultValue;
  }

  static getAll() {
    const db = getDatabase();
    return db.prepare('SELECT * FROM app_settings ORDER BY category, key').all();
  }

  static getAllAsMap() {
    const all = this.getAll();
    const map = {};
    for (const item of all) {
      map[item.key] = item.value;
    }
    return map;
  }

  static set(key, value) {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).run(key, String(value));
  }

  static setMultiple(settingsObj) {
    const db = getDatabase();
    const updateTx = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `);
      for (const [key, value] of Object.entries(settingsObj)) {
        stmt.run(key, String(value));
      }
    });
    updateTx();
  }
}

module.exports = SettingsModel;

