const { config } = require('../config');
const { AppSetting } = require('../models');

// Pluggable verifier for testing / dependency injection without NODE_ENV branching
let customVerifier = null;

function setRecaptchaVerifier(fn) {
  customVerifier = fn;
}

function getRecaptchaVerifier() {
  return customVerifier;
}

/**
 * Verifies a Google reCAPTCHA v2 token
 * Bypassed when enable_recaptcha setting is false
 * Uses a 5-second timeout and fails closed with 503 if the verification service is unreachable
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

  // 3. Delegate to injected verifier if configured (used in automated tests)
  if (typeof customVerifier === 'function') {
    const res = await customVerifier(token, ipAddress);
    if (!res || res.success === false) {
      const error = new Error('reCAPTCHA verification failed. Please try again.');
      error.statusCode = 400;
      throw error;
    }
    return res;
  }

  // 4. Resolve secret key from environment configuration
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

  // 5. Call Google API with 5-second timeout via AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  let response;
  try {
    response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      body: params,
      signal: controller.signal,
    });
  } catch {
    const error = new Error('reCAPTCHA verification service unavailable.');
    error.statusCode = 503;
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const error = new Error('reCAPTCHA verification service unavailable.');
    error.statusCode = 503;
    throw error;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    const error = new Error('reCAPTCHA verification service unavailable.');
    error.statusCode = 503;
    throw error;
  }

  if (!data.success) {
    const error = new Error('reCAPTCHA verification failed. Please try again.');
    error.statusCode = 400;
    throw error;
  }

  return { success: true, verified: true };
}

module.exports = {
  verifyRecaptcha,
  setRecaptchaVerifier,
  getRecaptchaVerifier,
};
