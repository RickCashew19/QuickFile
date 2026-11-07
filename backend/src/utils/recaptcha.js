const { config } = require('../config');
const { AppSetting } = require('../models');

/**
 * Verifies a Google reCAPTCHA v2 token
 * Bypassed when enable_recaptcha setting is false
 */
async function verifyRecaptcha(token, ipAddress) {
  // 1. Check if reCAPTCHA is enabled in application settings
  const setting = await AppSetting.findOne({ key: 'enable_recaptcha' });
  const isEnabled = setting && (setting.value === true || setting.value === 'true');

  if (!isEnabled) {
    return { success: true, bypassed: true };
  }

  // 2. Token is strictly required when enabled
  if (!token) {
    const error = new Error('reCAPTCHA token is required.');
    error.statusCode = 400;
    throw error;
  }

  // 3. In test mode, accept simulated valid token
  if (config.nodeEnv === 'test' && token === 'mock-valid-recaptcha-token') {
    return { success: true, verified: true, mock: true };
  }

  const secretKey = config.recaptcha.resolveSecretKey().value;
  if (!secretKey) {
    const error = new Error('reCAPTCHA secret key is not configured on the server.');
    error.statusCode = 500;
    throw error;
  }

  const params = new URLSearchParams({
    secret: secretKey,
    response: token,
  });

  if (ipAddress) {
    params.append('remoteip', ipAddress);
  }

  const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    body: params,
  });

  const data = await response.json();
  if (!data.success) {
    const error = new Error('reCAPTCHA verification failed. Please try again.');
    error.statusCode = 400;
    throw error;
  }

  return { success: true, verified: true };
}

module.exports = {
  verifyRecaptcha,
};
