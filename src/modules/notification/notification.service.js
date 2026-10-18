const { getDatabase } = require('../../config/db');
const SettingsService = require('../settings/settings.service');

class NotificationService {
  static get db() {
    return getDatabase();
  }

  static send(userId, title, message, link = null) {
    const stmt = this.db.prepare(`
      INSERT INTO notifications (user_id, title, message, link, is_read)
      VALUES (?, ?, ?, ?, 0)
    `);
    const res = stmt.run(userId, title, message, link);

    // Integrated notifications check (SMS / Email)
    const settings = SettingsService.getIntegrationSettings();
    if (settings.smsNotificationsEnabled) {
      console.log(`[SMS Gateway Pluggable Dispatch] To User #${userId}: "${title} - ${message}"`);
    }
    if (settings.emailSmtpEnabled) {
      console.log(`[SMTP Email Pluggable Dispatch] To User #${userId}: "${title}"`);
    }

    return res.lastInsertRowid;
  }

  static getForUser(userId, limit = 20) {
    return this.db.prepare(`
      SELECT * FROM notifications 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(userId, limit);
  }

  static getUserNotifications(userId, limit = 20) {
    return this.getForUser(userId, limit);
  }

  static getUnreadCount(userId) {
    const row = this.db.prepare(`
      SELECT COUNT(*) as count FROM notifications 
      WHERE user_id = ? AND is_read = 0
    `).get(userId);
    return row ? row.count : 0;
  }

  static markAllAsRead(userId) {
    this.db.prepare(`
      UPDATE notifications SET is_read = 1 WHERE user_id = ?
    `).run(userId);
  }
}

module.exports = NotificationService;
