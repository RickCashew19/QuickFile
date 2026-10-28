const SettingsModel = require('./settings.model');
const AdminModel = require('../admin/admin.model');
const config = require('../../config');

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
   * Resolve the active SMTP configuration based on config source ('default' vs 'custom')
   */
  static getActiveSmtpConfig() {
    const map = SettingsModel.getAllAsMap();
    const source = map['smtp_config_source'] || 'default';

    const defaultCfg = {
      host: config.defaultSmtp.host,
      port: config.defaultSmtp.port,
      secure: config.defaultSmtp.secure,
      user: config.defaultSmtp.user,
      pass: config.defaultSmtp.pass,
      from: config.defaultSmtp.from,
      source: 'default'
    };

    if (source === 'custom') {
      const customUser = map['custom_smtp_user'] !== undefined && map['custom_smtp_user'] !== '' 
        ? map['custom_smtp_user'] 
        : config.customSmtp.user;
      const customPass = map['custom_smtp_pass'] !== undefined && map['custom_smtp_pass'] !== '' 
        ? (map['custom_smtp_pass'] || '').replace(/\s+/g, '') 
        : config.customSmtp.pass;
      const customHost = map['custom_smtp_host'] !== undefined && map['custom_smtp_host'] !== '' 
        ? map['custom_smtp_host'] 
        : config.customSmtp.host;
      const customPort = map['custom_smtp_port'] !== undefined && map['custom_smtp_port'] !== '' 
        ? parseInt(map['custom_smtp_port'], 10) 
        : config.customSmtp.port;
      const customSecure = map['custom_smtp_secure'] !== undefined && map['custom_smtp_secure'] !== ''
        ? (map['custom_smtp_secure'] === '1' || map['custom_smtp_secure'] === 'true')
        : config.customSmtp.secure;
      const customFrom = map['custom_smtp_from'] !== undefined && map['custom_smtp_from'] !== '' 
        ? map['custom_smtp_from'] 
        : (config.customSmtp.from || (customUser ? `"QuickFile Barangay Central" <${customUser}>` : ''));

      // If client custom credentials exist, use them
      if (customHost && customUser) {
        return {
          host: customHost,
          port: customPort || 465,
          secure: customSecure !== undefined ? customSecure : true,
          user: customUser,
          pass: customPass || '',
          from: customFrom || `"QuickFile Barangay Central" <${customUser}>`,
          source: 'custom',
          isFallback: false
        };
      }

      // If custom is selected but no custom credentials supplied, gracefully fallback to default
      return {
        ...defaultCfg,
        source: 'default',
        isFallback: true
      };
    }

    return defaultCfg;
  }

  /**
   * Resolve the active Google OAuth configuration ('default' vs 'custom')
   */
  static getActiveGoogleConfig() {
    const map = SettingsModel.getAllAsMap();
    const source = map['google_config_source'] || 'default';

    const defaultCfg = {
      clientId: config.defaultGoogle.clientId,
      clientSecret: config.defaultGoogle.clientSecret,
      source: 'default'
    };

    if (source === 'custom') {
      const customClientId = map['custom_google_client_id'] || map['google_client_id'] || config.customGoogle.clientId;
      const customClientSecret = map['custom_google_client_secret'] || map['google_client_secret'] || config.customGoogle.clientSecret;

      if (customClientId) {
        return {
          clientId: customClientId,
          clientSecret: customClientSecret || '',
          source: 'custom',
          isFallback: false
        };
      }

      return {
        ...defaultCfg,
        source: 'default',
        isFallback: true
      };
    }

    return defaultCfg;
  }

  /**
   * Resolve the active SMS configuration ('default' vs 'custom')
   */
  static getActiveSmsConfig() {
    const map = SettingsModel.getAllAsMap();
    const source = map['sms_config_source'] || 'default';

    const defaultCfg = {
      provider: config.defaultSms.provider,
      apiEndpoint: config.defaultSms.apiEndpoint,
      apiKey: config.defaultSms.apiKey,
      senderId: config.defaultSms.senderId,
      source: 'default'
    };

    if (source === 'custom') {
      const customProvider = map['custom_sms_provider'] || config.customSms.provider;
      const customApiEndpoint = map['custom_sms_api_endpoint'] || config.customSms.apiEndpoint;
      const customApiKey = map['custom_sms_api_key'] || config.customSms.apiKey;
      const customSenderId = map['custom_sms_sender_id'] || config.customSms.senderId;

      if (customApiKey) {
        return {
          provider: customProvider || 'PhilSMS',
          apiEndpoint: customApiEndpoint || config.defaultSms.apiEndpoint,
          apiKey: customApiKey,
          senderId: customSenderId || 'PhilSMS',
          source: 'custom',
          isFallback: false
        };
      }

      return {
        ...defaultCfg,
        source: 'default',
        isFallback: true
      };
    }

    return defaultCfg;
  }

  /**
   * Resolve the active REST API secret key configuration ('default' vs 'custom')
   */
  static getActiveApiConfig() {
    const map = SettingsModel.getAllAsMap();
    const source = map['api_config_source'] || 'default';

    const defaultCfg = {
      secretKey: config.defaultApi.secretKey,
      source: 'default'
    };

    if (source === 'custom') {
      const customSecretKey = map['custom_api_secret_key'] || map['api_secret_key'] || config.customApi.secretKey;

      if (customSecretKey) {
        return {
          secretKey: customSecretKey,
          source: 'custom',
          isFallback: false
        };
      }

      return {
        ...defaultCfg,
        source: 'default',
        isFallback: true
      };
    }

    return defaultCfg;
  }

  /**
   * Resolve active Google reCAPTCHA v2 configuration ('default' vs 'custom')
   */
  static getActiveRecaptchaConfig() {
    const map = SettingsModel.getAllAsMap();
    const source = map['recaptcha_config_source'] || 'default';

    const defaultCfg = {
      siteKey: config.defaultRecaptcha.siteKey,
      secretKey: config.defaultRecaptcha.secretKey,
      source: 'default'
    };

    if (source === 'custom') {
      const customSiteKey = map['custom_recaptcha_site_key'] || config.customRecaptcha.siteKey;
      const customSecretKey = map['custom_recaptcha_secret_key'] || config.customRecaptcha.secretKey;

      if (customSiteKey) {
        return {
          siteKey: customSiteKey,
          secretKey: customSecretKey || '',
          source: 'custom',
          isFallback: false
        };
      }

      return {
        ...defaultCfg,
        source: 'default',
        isFallback: true
      };
    }

    return defaultCfg;
  }

  /**
   * Get all active integration settings formatted with Default vs Custom tiers
   */
  static getIntegrationSettings() {
    const map = SettingsModel.getAllAsMap();

    const activeSmtp = this.getActiveSmtpConfig();
    const activeGoogle = this.getActiveGoogleConfig();
    const activeSms = this.getActiveSmsConfig();
    const activeApi = this.getActiveApiConfig();
    const activeRecaptcha = this.getActiveRecaptchaConfig();

    const defaultSmtp = {
      host: config.defaultSmtp.host,
      port: config.defaultSmtp.port,
      secure: config.defaultSmtp.secure,
      user: config.defaultSmtp.user,
      pass: config.defaultSmtp.pass,
      from: config.defaultSmtp.from
    };

    const customSmtp = {
      host: map['custom_smtp_host'] !== undefined && map['custom_smtp_host'] !== '' ? map['custom_smtp_host'] : config.customSmtp.host,
      port: map['custom_smtp_port'] !== undefined && map['custom_smtp_port'] !== '' ? parseInt(map['custom_smtp_port'], 10) : config.customSmtp.port,
      secure: map['custom_smtp_secure'] !== undefined && map['custom_smtp_secure'] !== '' ? (map['custom_smtp_secure'] === '1' || map['custom_smtp_secure'] === 'true') : config.customSmtp.secure,
      user: map['custom_smtp_user'] !== undefined && map['custom_smtp_user'] !== '' ? map['custom_smtp_user'] : config.customSmtp.user,
      pass: map['custom_smtp_pass'] !== undefined && map['custom_smtp_pass'] !== '' ? map['custom_smtp_pass'] : config.customSmtp.pass,
      from: map['custom_smtp_from'] !== undefined && map['custom_smtp_from'] !== '' ? map['custom_smtp_from'] : config.customSmtp.from
    };

    const defaultGoogle = {
      clientId: config.defaultGoogle.clientId,
      clientSecret: config.defaultGoogle.clientSecret
    };

    const customGoogle = {
      clientId: map['custom_google_client_id'] !== undefined && map['custom_google_client_id'] !== '' ? map['custom_google_client_id'] : (map['google_client_id'] || config.customGoogle.clientId),
      clientSecret: map['custom_google_client_secret'] !== undefined && map['custom_google_client_secret'] !== '' ? map['custom_google_client_secret'] : (map['google_client_secret'] || config.customGoogle.clientSecret)
    };

    const defaultSms = {
      provider: config.defaultSms.provider,
      apiEndpoint: config.defaultSms.apiEndpoint,
      apiKey: config.defaultSms.apiKey,
      senderId: config.defaultSms.senderId
    };

    const customSms = {
      provider: map['custom_sms_provider'] !== undefined && map['custom_sms_provider'] !== '' ? map['custom_sms_provider'] : config.customSms.provider,
      apiEndpoint: map['custom_sms_api_endpoint'] !== undefined && map['custom_sms_api_endpoint'] !== '' ? map['custom_sms_api_endpoint'] : config.customSms.apiEndpoint,
      apiKey: map['custom_sms_api_key'] !== undefined && map['custom_sms_api_key'] !== '' ? map['custom_sms_api_key'] : config.customSms.apiKey,
      senderId: map['custom_sms_sender_id'] !== undefined && map['custom_sms_sender_id'] !== '' ? map['custom_sms_sender_id'] : config.customSms.senderId
    };

    const defaultApi = {
      secretKey: config.defaultApi.secretKey
    };

    const customApi = {
      secretKey: map['custom_api_secret_key'] !== undefined && map['custom_api_secret_key'] !== '' ? map['custom_api_secret_key'] : (map['api_secret_key'] || config.customApi.secretKey)
    };

    const defaultRecaptcha = {
      siteKey: config.defaultRecaptcha.siteKey,
      secretKey: config.defaultRecaptcha.secretKey
    };

    const customRecaptcha = {
      siteKey: map['custom_recaptcha_site_key'] !== undefined && map['custom_recaptcha_site_key'] !== '' ? map['custom_recaptcha_site_key'] : config.customRecaptcha.siteKey,
      secretKey: map['custom_recaptcha_secret_key'] !== undefined && map['custom_recaptcha_secret_key'] !== '' ? map['custom_recaptcha_secret_key'] : config.customRecaptcha.secretKey
    };

    return {
      // Feature toggles
      googleAuthEnabled: map['google_auth_enabled'] === '1' || map['google_auth_enabled'] === 'true',
      smsNotificationsEnabled: map['sms_notifications_enabled'] === '1' || map['sms_notifications_enabled'] === 'true',
      emailSmtpEnabled: map['email_smtp_enabled'] === '1' || map['email_smtp_enabled'] === 'true',
      qrEngineEnabled: map['qr_engine_enabled'] === '1' || map['qr_engine_enabled'] === 'true',
      apiEnabled: map['api_enabled'] === undefined ? true : (map['api_enabled'] === '1' || map['api_enabled'] === 'true'),
      recaptchaEnabled: map['recaptcha_enabled'] === undefined ? true : (map['recaptcha_enabled'] === '1' || map['recaptcha_enabled'] === 'true'),

      // Configuration sources
      smtpConfigSource: map['smtp_config_source'] || 'default',
      googleConfigSource: map['google_config_source'] || 'default',
      smsConfigSource: map['sms_config_source'] || 'default',
      apiConfigSource: map['api_config_source'] || 'default',
      recaptchaConfigSource: map['recaptcha_config_source'] || 'default',

      // Default presets
      defaultSmtp,
      defaultGoogle,
      defaultSms,
      defaultApi,
      defaultRecaptcha,

      // Custom presets
      customSmtp,
      customGoogle,
      customSms,
      customApi,
      customRecaptcha,

      // Resolved active configurations
      activeSmtp,
      activeGoogle,
      activeSms,
      activeApi,
      activeRecaptcha,

      // Legacy direct access helpers
      googleClientId: activeGoogle.clientId,
      googleClientSecret: activeGoogle.clientSecret,
      apiSecretKey: activeApi.secretKey,
      smtpUser: activeSmtp.user,
      smtpHost: activeSmtp.host,
      smtpPort: String(activeSmtp.port),
      raw: map
    };
  }

  /**
   * Update pluggable integration settings and custom API credentials from Admin console
   * @param {object} adminUser 
   * @param {object} updates 
   */
  static updateIntegrationSettings(adminUser, updates) {
    const current = SettingsModel.getAllAsMap();

    const googleAuthEnabled = updates.google_auth_enabled !== undefined 
      ? (updates.google_auth_enabled === '1' || updates.google_auth_enabled === 'on' || updates.google_auth_enabled === true ? '1' : '0')
      : (current['google_auth_enabled'] || '0');

    const smsEnabled = updates.sms_notifications_enabled !== undefined
      ? (updates.sms_notifications_enabled === '1' || updates.sms_notifications_enabled === 'on' || updates.sms_notifications_enabled === true ? '1' : '0')
      : (current['sms_notifications_enabled'] || '1');

    const emailEnabled = updates.email_smtp_enabled !== undefined
      ? (updates.email_smtp_enabled === '1' || updates.email_smtp_enabled === 'on' || updates.email_smtp_enabled === true ? '1' : '0')
      : (current['email_smtp_enabled'] || '1');

    const qrEnabled = updates.qr_engine_enabled !== undefined
      ? (updates.qr_engine_enabled === '1' || updates.qr_engine_enabled === 'on' || updates.qr_engine_enabled === true ? '1' : '0')
      : (current['qr_engine_enabled'] || '1');

    const apiEnabled = updates.api_enabled !== undefined
      ? (updates.api_enabled === '1' || updates.api_enabled === 'on' || updates.api_enabled === true ? '1' : '0')
      : (current['api_enabled'] !== undefined ? current['api_enabled'] : '1');

    const recaptchaEnabled = updates.recaptcha_enabled !== undefined
      ? (updates.recaptcha_enabled === '1' || updates.recaptcha_enabled === 'on' || updates.recaptcha_enabled === true ? '1' : '0')
      : (current['recaptcha_enabled'] !== undefined ? current['recaptcha_enabled'] : '1');

    const settingsMap = {
      google_auth_enabled: googleAuthEnabled,
      sms_notifications_enabled: smsEnabled,
      email_smtp_enabled: emailEnabled,
      qr_engine_enabled: qrEnabled,
      api_enabled: apiEnabled,
      recaptcha_enabled: recaptchaEnabled
    };

    // Config Sources ('default' vs 'custom')
    if (updates.smtp_config_source !== undefined) {
      settingsMap.smtp_config_source = updates.smtp_config_source === 'custom' ? 'custom' : 'default';
    }
    if (updates.google_config_source !== undefined) {
      settingsMap.google_config_source = updates.google_config_source === 'custom' ? 'custom' : 'default';
    }
    if (updates.sms_config_source !== undefined) {
      settingsMap.sms_config_source = updates.sms_config_source === 'custom' ? 'custom' : 'default';
    }
    if (updates.api_config_source !== undefined) {
      settingsMap.api_config_source = updates.api_config_source === 'custom' ? 'custom' : 'default';
    }
    if (updates.recaptcha_config_source !== undefined) {
      settingsMap.recaptcha_config_source = updates.recaptcha_config_source === 'custom' ? 'custom' : 'default';
    }

    // Custom SMTP fields
    if (updates.custom_smtp_host !== undefined) settingsMap.custom_smtp_host = updates.custom_smtp_host.trim();
    if (updates.custom_smtp_port !== undefined) settingsMap.custom_smtp_port = updates.custom_smtp_port.trim();
    if (updates.custom_smtp_secure !== undefined) settingsMap.custom_smtp_secure = updates.custom_smtp_secure === '1' || updates.custom_smtp_secure === 'true' || updates.custom_smtp_secure === true ? '1' : '0';
    if (updates.custom_smtp_user !== undefined) settingsMap.custom_smtp_user = updates.custom_smtp_user.trim();
    if (updates.custom_smtp_pass !== undefined && updates.custom_smtp_pass !== '') settingsMap.custom_smtp_pass = updates.custom_smtp_pass.replace(/\s+/g, '');
    if (updates.custom_smtp_from !== undefined) settingsMap.custom_smtp_from = updates.custom_smtp_from.trim();

    // Custom Google OAuth fields
    if (updates.custom_google_client_id !== undefined) {
      settingsMap.custom_google_client_id = updates.custom_google_client_id.trim();
      settingsMap.google_client_id = settingsMap.custom_google_client_id;
    } else if (updates.google_client_id !== undefined) {
      settingsMap.custom_google_client_id = updates.google_client_id.trim();
      settingsMap.google_client_id = updates.google_client_id.trim();
    }

    if (updates.custom_google_client_secret !== undefined && updates.custom_google_client_secret !== '') {
      settingsMap.custom_google_client_secret = updates.custom_google_client_secret.trim();
      settingsMap.google_client_secret = settingsMap.custom_google_client_secret;
    } else if (updates.google_client_secret !== undefined && updates.google_client_secret !== '') {
      settingsMap.custom_google_client_secret = updates.google_client_secret.trim();
      settingsMap.google_client_secret = updates.google_client_secret.trim();
    }

    // Custom SMS Gateway fields
    if (updates.custom_sms_provider !== undefined) settingsMap.custom_sms_provider = updates.custom_sms_provider.trim();
    if (updates.custom_sms_api_endpoint !== undefined) settingsMap.custom_sms_api_endpoint = updates.custom_sms_api_endpoint.trim();
    if (updates.custom_sms_api_key !== undefined) settingsMap.custom_sms_api_key = updates.custom_sms_api_key.trim();
    if (updates.custom_sms_sender_id !== undefined) settingsMap.custom_sms_sender_id = updates.custom_sms_sender_id.trim();

    // Custom REST API fields
    if (updates.custom_api_secret_key !== undefined && updates.custom_api_secret_key !== '') {
      settingsMap.custom_api_secret_key = updates.custom_api_secret_key.trim();
      settingsMap.api_secret_key = settingsMap.custom_api_secret_key;
    } else if (updates.api_secret_key !== undefined && updates.api_secret_key !== '') {
      settingsMap.custom_api_secret_key = updates.api_secret_key.trim();
      settingsMap.api_secret_key = updates.api_secret_key.trim();
    }

    // Custom reCAPTCHA fields
    if (updates.custom_recaptcha_site_key !== undefined) settingsMap.custom_recaptcha_site_key = updates.custom_recaptcha_site_key.trim();
    if (updates.custom_recaptcha_secret_key !== undefined && updates.custom_recaptcha_secret_key !== '') {
      settingsMap.custom_recaptcha_secret_key = updates.custom_recaptcha_secret_key.trim();
    }

    SettingsModel.setMultiple(settingsMap);

    // Audit log
    if (adminUser) {
      const activeSmtpSrc = settingsMap.smtp_config_source || current['smtp_config_source'] || 'default';
      const activeGoogleSrc = settingsMap.google_config_source || current['google_config_source'] || 'default';
      AdminModel.logAudit(
        adminUser.id,
        adminUser.fullName || adminUser.full_name,
        'APP_SETTINGS_UPDATED',
        'app_settings',
        0,
        `Updated integrations: Google Auth=${googleAuthEnabled === '1' ? 'ENABLED' : 'DISABLED'} (${activeGoogleSrc}), REST API=${apiEnabled === '1' ? 'ENABLED' : 'DISABLED'}, SMTP Email=${emailEnabled === '1' ? 'ENABLED' : 'DISABLED'} (${activeSmtpSrc}), SMS=${smsEnabled === '1' ? 'ENABLED' : 'DISABLED'}`
      );
    }

    return this.getIntegrationSettings();
  }
}

module.exports = SettingsService;
