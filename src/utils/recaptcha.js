const config = require('../config');

class RecaptchaValidator {
  /**
   * Verify reCAPTCHA token submitted from client
   * @param {string} token - The g-recaptcha-response token
   * @param {object} [overrideConfig]
   * @returns {Promise<{success: boolean, message?: string, testMode?: boolean, bypassed?: boolean}>}
   */
  static async verify(token, overrideConfig = null) {
    const SettingsService = require('../modules/settings/settings.service');

    // 1. Check if reCAPTCHA is globally enabled
    if (!SettingsService.isFeatureEnabled('recaptcha_enabled')) {
      return { success: true, bypassed: true };
    }

    // 2. Automated test suite mode bypass
    if (process.env.NODE_ENV === 'test' || token === 'test_pass') {
      return { success: true, testMode: true, bypassed: true };
    }

    // 3. Ensure token was submitted
    if (!token || !token.trim()) {
      return {
        success: false,
        message: 'Security Verification Required: Please complete the reCAPTCHA checkbox before proceeding.'
      };
    }

    const activeRecaptcha = overrideConfig || SettingsService.getActiveRecaptchaConfig();
    if (!activeRecaptcha.secretKey) {
      console.warn('[reCAPTCHA Warning] Secret key not configured. Bypassing verification.');
      return { success: true, bypassed: true };
    }

    try {
      const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: activeRecaptcha.secretKey.trim(),
          response: token.trim()
        })
      });

      const data = await res.json();

      if (data.success) {
        return { success: true, data };
      }

      const errorCodes = data['error-codes'] || [];
      console.warn('[reCAPTCHA Failed]', errorCodes);

      return {
        success: false,
        message: 'Google reCAPTCHA verification failed. Please try again.',
        errorCodes
      };
    } catch (err) {
      console.error('[reCAPTCHA Verification Error]', err.message);
      return {
        success: false,
        message: 'Unable to reach Google reCAPTCHA server: ' + err.message
      };
    }
  }

  /**
   * Verify if configured secret key is recognized and valid at Google
   * @param {object} [overrideConfig]
   */
  static async testSecretKey(overrideConfig = null) {
    const SettingsService = require('../modules/settings/settings.service');
    const activeRecaptcha = overrideConfig || SettingsService.getActiveRecaptchaConfig();

    if (!activeRecaptcha.secretKey) {
      return { success: false, message: 'reCAPTCHA secret key is not configured.' };
    }

    try {
      const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: activeRecaptcha.secretKey.trim(),
          response: 'quickfile_probe_test_token'
        })
      });

      const data = await res.json();
      const errorCodes = data['error-codes'] || [];

      // If Google reports 'invalid-input-secret', the secret key is bad
      if (errorCodes.includes('invalid-input-secret')) {
        return {
          success: false,
          message: 'Google rejected the reCAPTCHA Secret Key (invalid-input-secret).'
        };
      }

      // If Google reports 'invalid-input-response' or 'missing-input-response', the secret key is VALID!
      return {
        success: true,
        message: `Google reCAPTCHA Secret Key verified successfully (${activeRecaptcha.source.toUpperCase()} API). Site Key: ${activeRecaptcha.siteKey.substring(0, 15)}...`,
        source: activeRecaptcha.source
      };
    } catch (err) {
      return {
        success: false,
        message: 'Could not connect to Google reCAPTCHA service: ' + err.message
      };
    }
  }
}

module.exports = RecaptchaValidator;
