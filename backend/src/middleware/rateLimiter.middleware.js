const rateLimit = require('express-rate-limit');
const {
  RATE_LIMIT_WINDOW_MS,
  AUTH_LIMIT_MAX,
  POLLING_LIMIT_MAX,
  USER_API_LIMIT_MAX,
  EXPORT_LIMIT_MAX,
  PUBLIC_LIMIT_MAX,
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
 * Rate limiter for sensitive authentication endpoints (Register, Login, Google, Password Reset)
 * 15 failed requests per 15 minutes per IP (16th failed attempt returns 429)
 * Successful requests do NOT count against the limit.
 */
const authLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: AUTH_LIMIT_MAX,
  validate: { trustProxy: false },
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many authentication attempts. Please try again after 15 minutes.'),
});

/**
 * Second login rate limiter keyed by submitted email address
 * 15 failed requests per 15 minutes per email account
 * Successful logins do NOT count against the limit.
 */
const loginEmailLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: AUTH_LIMIT_MAX,
  validate: { trustProxy: false },
  keyGenerator: emailKeyGenerator,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler(
    'Too many failed login attempts for this email address. Please try again after 15 minutes.'
  ),
});

/**
 * Rate limiter for Super Admin Key verification & settings save
 * 15 failed requests per 15 minutes per IP, skipping successful requests
 */
const suKeyLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: 15,
  validate: { trustProxy: false },
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
  validate: { trustProxy: false },
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
  validate: { trustProxy: false },
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
  validate: { trustProxy: false },
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
  validate: { trustProxy: false },
  keyGenerator: userKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many report export requests. Maximum 10 exports per 15 minutes.'),
});

/**
 * Fallback IP limiter for legacy / unauthenticated routers
 */
const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: 100,
  validate: { trustProxy: false },
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Rate limit exceeded. Please try again later.'),
});

module.exports = {
  authLimiter,
  loginEmailLimiter,
  suKeyLimiter,
  publicLimiter,
  pollingLimiter,
  userApiLimiter,
  exportLimiter,
  apiLimiter,
};
