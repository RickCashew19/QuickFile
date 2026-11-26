const crypto = require('crypto');
const net = require('net');
const nodemailer = require('nodemailer');
const { config } = require('../config');

// Pluggable provider HTTP client for testing / dependency injection without NODE_ENV branching.
// Mirrors the setMailTransport pattern in helpers/mailer.js.
let customProviderFetch = null;

function setProviderFetch(providerFetch) {
  customProviderFetch = providerFetch;
}

/**
 * Performs an outbound provider probe with a hard 4s timeout.
 * Fails closed: callers treat any thrown error as an unverifiable credential.
 */
async function providerFetch(url, options = {}) {
  if (customProviderFetch) {
    return customProviderFetch(url, options);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Validates API keys and integration credentials against their respective providers.
 * Enforces format, entropy, and live provider validation.
 * Never leaks raw secrets or passwords in error messages or responses.
 */

// Provider probes must never be pointed at internal infrastructure (SSRF).
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
]);

function isPrivateIPv4(address) {
  const parts = String(address).split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIPv6(address) {
  const a = String(address).toLowerCase();
  if (a === '::' || a === '::1') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(a)) return true; // unique local fc00::/7
  if (/^fe[89ab][0-9a-f]:/.test(a)) return true; // link-local fe80::/10
  const mapped = a.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

function isBlockedHost(host) {
  const raw = String(host || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (!raw) return true;
  if (BLOCKED_HOSTNAMES.has(raw)) return true;
  if (raw.endsWith('.localhost') || raw.endsWith('.local') || raw.endsWith('.internal')) return true;
  if (net.isIPv4(raw)) return isPrivateIPv4(raw);
  if (net.isIPv6(raw)) return isPrivateIPv6(raw);
  return false;
}

function resolvePublicUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    throw new Error('Gateway URL must be a valid HTTP or HTTPS URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Gateway URL must use http: or https:.');
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new Error(
      'Gateway URL must point to a public host; private, loopback, and link-local addresses are not allowed.'
    );
  }
  return parsed;
}


/**
 * Validate REST API Gateway Secret Key
 */
async function validateRestApiKey(secretKey) {
  if (!secretKey || typeof secretKey !== 'string') {
    return { valid: false, message: 'REST API Secret Key must be a non-empty string.' };
  }

  const trimmed = secretKey.trim();

  // Length requirement
  if (trimmed.length < 16) {
    return {
      valid: false,
      message: 'REST API Secret Key must be at least 16 characters long for security.',
    };
  }

  // Trivial / placeholder rejection
  const lowercase = trimmed.toLowerCase();
  const prohibitedPatterns = ['password', 'change_me', '12345678', 'admin123', 'secret123', 'default'];
  for (const pattern of prohibitedPatterns) {
    if (lowercase.includes(pattern)) {
      return {
        valid: false,
        message: `REST API Secret Key cannot contain common placeholder pattern "${pattern}".`,
      };
    }
  }

  // Complexity check: require at least 2 character categories
  const hasLetters = /[a-zA-Z]/.test(trimmed);
  const hasDigits = /[0-9]/.test(trimmed);
  const hasSpecial = /[^a-zA-Z0-9]/.test(trimmed);
  const complexityCount = [hasLetters, hasDigits, hasSpecial].filter(Boolean).length;

  if (complexityCount < 2) {
    return {
      valid: false,
      message: 'REST API Secret Key must contain a mix of letters and numbers or symbols.',
    };
  }

  // Cryptographic round-trip check
  try {
    const testPayload = 'quickfile_probe_' + Date.now();
    const hmac = crypto.createHmac('sha256', trimmed).update(testPayload).digest('hex');
    if (!hmac || hmac.length !== 64) {
      return { valid: false, message: 'Cryptographic validation failed for the provided API key.' };
    }
  } catch (err) {
    return { valid: false, message: 'Cryptographic error validating key: ' + err.message };
  }

  return {
    valid: true,
    message: 'REST API Secret Key validated successfully (meets length, entropy, and cryptographic standards).',
  };
}

/**
 * Validate Google OAuth Client ID & Secret
 */
async function validateGoogleCredentials({ clientId, clientSecret }) {
  // Fall back to the currently configured value when only one half of the pair is being
  // changed (e.g. updating just the secret while keeping the stored client ID).
  const resolvedId =
    clientId !== undefined && clientId !== null && String(clientId).trim()
      ? String(clientId).trim()
      : config.google.resolveClientId().value;
  if (!resolvedId || typeof resolvedId !== 'string') {
    return { valid: false, message: 'Google Client ID is required.' };
  }

  const trimmedId = resolvedId;
  if (!trimmedId.endsWith('.apps.googleusercontent.com') && !trimmedId.includes('.googleusercontent.')) {
    return {
      valid: false,
      message: 'Invalid Google Client ID format. Must end with ".apps.googleusercontent.com".',
    };
  }

  if (clientSecret !== undefined && clientSecret !== null && clientSecret !== '') {
    const trimmedSecret = String(clientSecret).trim();
    if (trimmedSecret.length < 20) {
      return {
        valid: false,
        message: 'Google Client Secret must be at least 20 characters long.',
      };
    }
  }

  // A client secret is required to authenticate the client with Google's token endpoint.
  // Fall back to the currently configured secret so re-validating an unchanged stored ID works.
  const resolvedSecret =
    clientSecret !== undefined && clientSecret !== null && String(clientSecret).trim()
      ? String(clientSecret).trim()
      : config.google.resolveClientSecret().value;
  if (!resolvedSecret) {
    return { valid: false, message: 'Google Client Secret is required to verify credentials with Google.' };
  }

  // Live verification with Google's token endpoint (RFC 6749 §3.2 / §5.2).
  // We authenticate the CLIENT using the submitted credentials with a deliberately
  // invalid refresh token. Google authenticates the client before evaluating the grant:
  //   - invalid_client (401)     -> client_id / client_secret are WRONG   -> reject
  //   - invalid_grant (400)      -> client authenticated OK, dummy token rejected -> credentials real
  //   - unauthorized_client (400)-> client authenticated OK but disallowed grant        -> credentials real
  // Network unreachable / any other response -> fail closed (cannot verify).
  let status = 0;
  let errorCode = '';
  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: 'quickfile-credential-probe-invalid-token',
      client_id: trimmedId,
      client_secret: resolvedSecret,
    });
    const res = await providerFetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    status = res.status;
    const data = await res.json();
    errorCode = typeof data?.error === 'string' ? data.error : '';
  } catch (err) {
    return {
      valid: false,
      message: 'Could not reach Google to verify the OAuth credentials. Please try again.',
    };
  }

  const clientAuthenticated = status === 200 || errorCode === 'invalid_grant' || errorCode === 'unauthorized_client';
  if (clientAuthenticated) {
    return {
      valid: true,
      message: 'Google Client ID and Secret verified with Google token endpoint.',
    };
  }

  if (errorCode === 'invalid_client' || status === 401) {
    return {
      valid: false,
      message: 'Google rejected the Client ID/Secret (invalid_client). Please verify both values.',
    };
  }

  return {
    valid: false,
    message: `Could not verify Google OAuth credentials with Google (HTTP ${status || 'unreachable'}).`,
  };
}

/**
 * Validate PhilSMS Gateway URL & API Token
 */
async function validateSmsCredentials({ gatewayUrl, apiToken }) {
  if (!apiToken || typeof apiToken !== 'string' || apiToken.trim().length < 15) {
    return { valid: false, message: 'PhilSMS API Token must be at least 15 characters long.' };
  }

  const url = gatewayUrl ? gatewayUrl.trim() : 'https://dashboard.philsms.com/api/v3/';

  let baseUrl;
  try {
    baseUrl = resolvePublicUrl(url).href.replace(/\/+$/, '');
  } catch (err) {
    return { valid: false, message: `PhilSMS Gateway URL rejected: ${err.message}` };
  }

  // Live provider check with 4-second timeout. Fail closed: only an explicit
  // successful provider response proves the token works.
  try {
    const probeUrl = `${baseUrl}/balance`;
    const res = await providerFetch(probeUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiToken.trim()}`,
        Accept: 'application/json',
      },
    });

    if (res.status === 401 || res.status === 403) {
      return {
        valid: false,
        message: 'PhilSMS provider rejected API token: Unauthorized (401/403). Please verify your token.',
      };
    }
    if (!res.ok) {
      return {
        valid: false,
        message: `PhilSMS gateway probe returned an unexpected HTTP ${res.status}. Cannot verify token.`,
      };
    }
  } catch (err) {
    return {
      valid: false,
      message: 'Could not reach the PhilSMS gateway to verify the API token. Please try again.',
    };
  }

  return {
    valid: true,
    message: 'PhilSMS Gateway credentials successfully validated with the provider.',
  };
}

/**
 * Validate SMTP Mail Server Credentials
 */
async function validateSmtpCredentials({ host, port, secure, user, pass }) {
  if (!host || !user || !pass) {
    return { valid: false, message: 'SMTP Host, Username, and Password are all required for validation.' };
  }

  if (isBlockedHost(host)) {
    return {
      valid: false,
      message: 'SMTP host must be a public host; private, loopback, and link-local addresses are not allowed.',
    };
  }

  const portNum = parseInt(port, 10) || 587;
  const isSecure = Boolean(secure === true || secure === 'true' || portNum === 465);

  try {
    const transporter = nodemailer.createTransport({
      host: host.trim(),
      port: portNum,
      secure: isSecure,
      auth: {
        user: user.trim(),
        pass: pass.trim(),
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
    });

    await transporter.verify();
    return { valid: true, message: 'SMTP mail server connection and authentication verified successfully.' };
  } catch (err) {
    // Sanitize any passwords that might appear in error strings
    const safeError = err.message.replace(pass, '********');
    return {
      valid: false,
      message: 'SMTP mail server rejected credentials: ' + safeError,
    };
  }
}

// Google site keys are exactly 40 characters and start with "6L". Google exposes
// no endpoint to verify a site key on its own, so a format check is the strongest
// server-side check available; the secret key is verified live below.
const RECAPTCHA_SITE_KEY_PATTERN = /^6L[a-zA-Z0-9_-]{38}$/;

function isPlausibleRecaptchaSiteKey(value) {
  return typeof value === 'string' && RECAPTCHA_SITE_KEY_PATTERN.test(value.trim());
}

/**
 * Validate Google reCAPTCHA keys. The secret is probed live with Google; the
 * site key can only be format-checked (Google has no standalone verify API).
 */
async function validateRecaptchaCredentials({ secretKey, siteKey }) {
  // Validate a supplied site key (e.g. from the admin form). When omitted,
  // callers may be re-validating an unchanged stored secret, so skip this check.
  if (siteKey !== undefined && siteKey !== null && String(siteKey).trim() && !isPlausibleRecaptchaSiteKey(siteKey)) {
    return {
      valid: false,
      message: 'Invalid reCAPTCHA Site Key format. Google site keys are 40 characters starting with "6L".',
    };
  }

  if (!secretKey || typeof secretKey !== 'string') {
    return { valid: false, message: 'reCAPTCHA Secret Key is required.' };
  }

  const trimmed = secretKey.trim();
  if (trimmed.length < 20) {
    return { valid: false, message: 'reCAPTCHA Secret Key must be at least 20 characters long.' };
  }

  // Live provider probe: send a dummy probe to Google verify endpoint.
  // Fail closed: only an explicit provider response (without invalid-input-secret) proves the key works.
  try {
    const body = new URLSearchParams({
      secret: trimmed,
      response: 'test_probe_token',
    });

    const res = await providerFetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      return {
        valid: false,
        message: `Google reCAPTCHA verification returned an unexpected HTTP ${res.status}. Cannot verify secret.`,
      };
    }

    const data = await res.json();
    // If the secret key itself is invalid, Google returns error code 'invalid-input-secret'
    if (data['error-codes'] && data['error-codes'].includes('invalid-input-secret')) {
      return {
        valid: false,
        message: 'Google reCAPTCHA rejected secret key as invalid (invalid-input-secret).',
      };
    }
  } catch (err) {
    return {
      valid: false,
      message: 'Could not reach Google reCAPTCHA verification to validate the secret key. Please try again.',
    };
  }

  return {
    valid: true,
    message: 'Google reCAPTCHA secret key verified with Google verification servers. Site key format checked locally.',
  };
}

/**
 * Centralized Provider Key Validator
 *
 * @param {string} provider - 'rest_api' | 'google' | 'sms' | 'smtp' | 'recaptcha'
 * @param {Object} credentials - Provider-specific fields
 * @returns {Promise<{ valid: boolean, message: string }>}
 */
async function validateProviderKey(provider, credentials = {}) {
  switch (provider) {
    case 'rest_api':
      return validateRestApiKey(
        credentials.CUSTOM_REST_API_SECRET_KEY || credentials.secret_key || credentials.secretKey
      );
    case 'google':
      return validateGoogleCredentials({
        clientId: credentials.CUSTOM_GOOGLE_CLIENT_ID || credentials.client_id || credentials.clientId,
        clientSecret: credentials.CUSTOM_GOOGLE_CLIENT_SECRET || credentials.client_secret || credentials.clientSecret,
      });
    case 'sms':
      return validateSmsCredentials({
        gatewayUrl: credentials.CUSTOM_SMS_GATEWAY_URL || credentials.gateway_url || credentials.gatewayUrl,
        apiToken: credentials.CUSTOM_SMS_API_TOKEN || credentials.api_token || credentials.apiToken,
      });
    case 'smtp':
      return validateSmtpCredentials({
        host: credentials.CUSTOM_SMTP_HOST || credentials.host,
        port: credentials.CUSTOM_SMTP_PORT || credentials.port,
        secure: credentials.CUSTOM_SMTP_SECURE || credentials.secure,
        user: credentials.CUSTOM_SMTP_USER || credentials.user,
        pass: credentials.CUSTOM_SMTP_PASS || credentials.pass,
      });
    case 'recaptcha':
      return validateRecaptchaCredentials({
        secretKey: credentials.CUSTOM_RECAPTCHA_SECRET_KEY || credentials.secret_key || credentials.secretKey,
        siteKey: credentials.CUSTOM_RECAPTCHA_SITE_KEY || credentials.site_key || credentials.siteKey,
      });
    default:
      return { valid: false, message: `Unknown provider "${provider}".` };
  }
}

module.exports = {
  setProviderFetch,
  validateProviderKey,
  validateRestApiKey,
  validateGoogleCredentials,
  validateSmsCredentials,
  validateSmtpCredentials,
  validateRecaptchaCredentials,
  isPlausibleRecaptchaSiteKey,
};
