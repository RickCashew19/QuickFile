const rateLimit = require('express-rate-limit');
const {
  RATE_LIMIT_WINDOW_MS,
  ONE_HOUR_MS,
  AUTH_LIMIT_MAX,
  REGISTER_LIMIT_MAX,
  FORGOT_PASSWORD_IP_LIMIT_MAX,
  FORGOT_PASSWORD_EMAIL_LIMIT_MAX,
  RESET_PASSWORD_LIMIT_MAX,
  SU_KEY_LIMIT_MAX,
  POLLING_LIMIT_MAX,
  USER_API_LIMIT_MAX,
  EXPORT_LIMIT_MAX,
  PUBLIC_LIMIT_MAX,
  TEMPLATE_UPLOAD_LIMIT_MAX,
  CERTIFICATE_DOWNLOAD_LIMIT_MAX,
} = require('../config/constants');

/**
 * Standard JSON response handler for rate limit exceeded
 */
const rateLimitHandler = (message) => (req, res) => {
  res.status(429).json({
    success: false,
    message,
    retryAfter: res.getHeader('Retry-After') || 60,
    data: null,
  });
};

/**
 * Key generator for authenticated users (falls back to IP if unauthenticated)
 */
const userKeyGenerator = (req) =>
  req.user && req.user._id ? req.user._id.toString() : req.ip || 'unknown';

/**
 * Key generator by submitted email address (falls back to IP if email missing)
 */
const emailKeyGenerator = (req) => {
  if (req.body && typeof req.body.email === 'string' && req.body.email.trim()) {
    return req.body.email.toLowerCase().trim();
  }
  return req.ip || 'unknown';
};

/**
 * Key generator by email and IP composite so an external attacker cannot lock the owner out
 */
const loginEmailIpKeyGenerator = (req) => {
  const email =
    req.body && typeof req.body.email === 'string' && req.body.email.trim()
      ? req.body.email.toLowerCase().trim()
      : 'unknown';
  const ip = req.ip || 'unknown';
  return `${email}|${ip}`;
};

/**
 * Rate limiter for sensitive authentication endpoints (Login, Google login)
 * 15 failed requests per 15 minutes per IP (16th failed attempt returns 429)
 * Successful requests do NOT count against the limit.
 */
const authLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: AUTH_LIMIT_MAX,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many authentication attempts. Please try again after 15 minutes.'),
});

/**
 * Login rate limiter keyed by submitted email AND IP composite
 * 15 failed requests per 15 minutes per `${email}|${ip}`
 * Prevents account lockout by third parties while blocking targeted brute force.
 * Successful logins do NOT count against the limit.
 */
const loginEmailLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: AUTH_LIMIT_MAX,
  keyGenerator: loginEmailIpKeyGenerator,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler(
    'Too many failed login attempts for this email address. Please try again after 15 minutes.'
  ),
});

/**
 * Registration rate limiter: counts EVERY request (5 per hour per IP)
 */
const registerLimiter = rateLimit({
  windowMs: ONE_HOUR_MS,
  max: REGISTER_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many registration requests. Please try again after an hour.'),
});

/**
 * Forgot password IP limiter: counts EVERY request (5 per hour per IP)
 */
const forgotPasswordIpLimiter = rateLimit({
  windowMs: ONE_HOUR_MS,
  max: FORGOT_PASSWORD_IP_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many password reset requests from this IP. Please try again after an hour.'),
});

/**
 * Forgot password email limiter: counts EVERY request (3 per hour per email)
 */
const forgotPasswordEmailLimiter = rateLimit({
  windowMs: ONE_HOUR_MS,
  max: FORGOT_PASSWORD_EMAIL_LIMIT_MAX,
  keyGenerator: emailKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many password reset requests for this email address. Please try again after an hour.'),
});

/**
 * Password reset execution limiter: counts EVERY request (10 per hour per IP)
 */
const resetPasswordLimiter = rateLimit({
  windowMs: ONE_HOUR_MS,
  max: RESET_PASSWORD_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many password reset execution attempts. Please try again after an hour.'),
});

/**
 * Rate limiter for Super Admin Key verification & settings save
 * 15 failed requests per 15 minutes per IP, skipping successful requests
 */
const suKeyLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: SU_KEY_LIMIT_MAX,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler(
    'Too many Super Admin Key verification attempts. Please try again after 15 minutes.'
  ),
});

/**
 * Rate limiter for public endpoints (Public QR verification, config, etc.)
 * 60 requests per 15 minutes per IP
 */
const publicLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: PUBLIC_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many requests. Please slow down.'),
});

/**
 * High-frequency limiter for live status polling endpoints
 * (Citizen tracking status, staff live-stats, admin live-stats)
 * 600 requests per 15 minutes per user ID (allows continuous 8-sec polling)
 */
const pollingLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: POLLING_LIMIT_MAX,
  keyGenerator: userKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many status polling requests. Please reduce polling frequency.'),
});

/**
 * Authenticated user API limiter (placed AFTER authenticate middleware)
 * 300 requests per 15 minutes per user ID
 */
const userApiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: USER_API_LIMIT_MAX,
  keyGenerator: userKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('User rate limit exceeded. Please try again later.'),
});

/**
 * Report export rate limiter
 * 10 export requests per 15 minutes per user ID
 */
const exportLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: EXPORT_LIMIT_MAX,
  keyGenerator: userKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many report export requests. Maximum 10 exports per 15 minutes.'),
});

/**
 * Template upload rate limiter
 * 10 template uploads per 1 hour per user ID
 */
const templateUploadLimiter = rateLimit({
  windowMs: ONE_HOUR_MS,
  max: TEMPLATE_UPLOAD_LIMIT_MAX,
  keyGenerator: userKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many template upload requests. Maximum 10 template uploads per hour.'),
});

/**
 * Official certificate download rate limiter
 * 30 certificate downloads per 15 minutes per user ID
 */
const certificateDownloadLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: CERTIFICATE_DOWNLOAD_LIMIT_MAX,
  keyGenerator: userKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many certificate download requests. Maximum 30 downloads per 15 minutes.'),
});

module.exports = {
  authLimiter,
  loginEmailLimiter,
  registerLimiter,
  forgotPasswordIpLimiter,
  forgotPasswordEmailLimiter,
  resetPasswordLimiter,
  suKeyLimiter,
  publicLimiter,
  pollingLimiter,
  userApiLimiter,
  exportLimiter,
  templateUploadLimiter,
  certificateDownloadLimiter,
};
