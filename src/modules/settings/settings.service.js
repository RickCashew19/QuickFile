const SettingsModel = require('./settings.model');
const AdminModel = require('../admin/admin.model');

class SettingsService {
  /**
   * Check if a specific pluggable integration or feature is enabled
   * @param {string} key 
   * @returns {boolean}
   */
  static isFeatureEnabled(key) {
    const defaultVal = key === 'api_enabled' ? '1' : '0';
    const val = SettingsModel.getValue(key, defaultVal);
    return val === '1' || val === 'true';
  }

  /**
   * Helper to specifically check if API access is enabled
   * @returns {boolean}
   */
  static isApiEnabled() {
    return this.isFeatureEnabled('api_enabled');
  }

  /**
   * Get all active integration settings formatted with booleans and strings
   */
  static getIntegrationSettings() {
    const map = SettingsModel.getAllAsMap();
    return {
      googleAuthEnabled: map['google_auth_enabled'] === '1' || map['google_auth_enabled'] === 'true',
      googleClientId: map['google_client_id'] || '',
      googleClientSecret: map['google_client_secret'] || '',
      smsNotificationsEnabled: map['sms_notifications_enabled'] === '1' || map['sms_notifications_enabled'] === 'true',
      emailSmtpEnabled: map['email_smtp_enabled'] === '1' || map['email_smtp_enabled'] === 'true',
      qrEngineEnabled: map['qr_engine_enabled'] === '1' || map['qr_engine_enabled'] === 'true',
      apiEnabled: map['api_enabled'] === undefined ? true : (map['api_enabled'] === '1' || map['api_enabled'] === 'true'),
      apiSecretKey: map['api_secret_key'] || '',
      raw: map
    };
  }

  /**
   * Update pluggable integration settings from Admin console
   * @param {object} adminUser 
   * @param {object} updates 
   */
  static updateIntegrationSettings(adminUser, updates) {
    const googleAuthEnabled = updates.google_auth_enabled === '1' || updates.google_auth_enabled === 'on' || updates.google_auth_enabled === true ? '1' : '0';
    const smsEnabled = updates.sms_notifications_enabled === '1' || updates.sms_notifications_enabled === 'on' || updates.sms_notifications_enabled === true ? '1' : '0';
    const emailEnabled = updates.email_smtp_enabled === '1' || updates.email_smtp_enabled === 'on' || updates.email_smtp_enabled === true ? '1' : '0';
    const qrEnabled = updates.qr_engine_enabled === '1' || updates.qr_engine_enabled === 'on' || updates.qr_engine_enabled === true ? '1' : '0';
    const apiEnabled = updates.api_enabled === '1' || updates.api_enabled === 'on' || updates.api_enabled === true ? '1' : '0';

    const settingsMap = {
      google_auth_enabled: googleAuthEnabled,
      google_client_id: updates.google_client_id ? updates.google_client_id.trim() : '',
      google_client_secret: updates.google_client_secret ? updates.google_client_secret.trim() : '',
      sms_notifications_enabled: smsEnabled,
      email_smtp_enabled: emailEnabled,
      qr_engine_enabled: qrEnabled,
      api_enabled: apiEnabled,
      api_secret_key: updates.api_secret_key ? updates.api_secret_key.trim() : (updates.api_secret_key === '' ? '' : (SettingsModel.getValue('api_secret_key') || ''))
    };

    SettingsModel.setMultiple(settingsMap);

    // Audit log
    if (adminUser) {
      AdminModel.logAudit(
        adminUser.id,
        adminUser.fullName || adminUser.full_name,
        'APP_SETTINGS_UPDATED',
        'app_settings',
        0,
        `Updated integrations: Google Auth=${googleAuthEnabled === '1' ? 'ENABLED' : 'DISABLED'}, REST API=${apiEnabled === '1' ? 'ENABLED' : 'DISABLED'}, SMS=${smsEnabled === '1' ? 'ENABLED' : 'DISABLED'}`
      );
    }

    return this.getIntegrationSettings();
  }
}

module.exports = SettingsService;

