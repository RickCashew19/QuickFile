const { config } = require('../../config');
const { AppSetting } = require('../../models');

/**
 * Returns safe public configuration for frontend initialization
 * Section C: Never returns secrets. Returns only public client IDs, site keys, and feature flags.
 */
async function getPublicConfig() {
  const activeGoogleClientId = config.google.resolveClientId().value;
  const activeRecaptchaSiteKey = config.recaptcha.resolveSiteKey().value;
  const activeSmsToken = config.sms.resolveApiToken().value;
  const activeSmtpUser = config.smtp.resolveUser().value;

  const appSettings = await AppSetting.find({
    key: {
      $in: [
        'enable_google_login',
        'enable_recaptcha',
        'enable_sms_notifications',
        'enable_email_notifications',
        'enable_rest_api_gateway',
        'system_name',
        'barangay_name',
        'city_municipality',
        'province',
      ],
    },
  }).lean();

  const settingsMap = {};
  for (const s of appSettings) {
    settingsMap[s.key] = s.value;
  }

  return {
    system_name: settingsMap['system_name'] || 'QuickFile Barangay Portal',
    barangay_name: settingsMap['barangay_name'] || config.jurisdiction.barangayName(),
    city_municipality: settingsMap['city_municipality'] || config.jurisdiction.cityMunicipality(),
    province: settingsMap['province'] || config.jurisdiction.province(),
    google_client_id: activeGoogleClientId,
    recaptcha_site_key: activeRecaptchaSiteKey,
    integrations: {
      google_login_enabled: Boolean(settingsMap['enable_google_login'] && activeGoogleClientId),
      recaptcha_enabled: Boolean(settingsMap['enable_recaptcha'] && activeRecaptchaSiteKey),
      sms_notifications_enabled: Boolean(settingsMap['enable_sms_notifications'] && activeSmsToken),
      email_notifications_enabled: Boolean(settingsMap['enable_email_notifications'] && activeSmtpUser),
      rest_api_gateway_enabled: Boolean(settingsMap['enable_rest_api_gateway']),
    },
  };
}

module.exports = {
  getPublicConfig,
};
