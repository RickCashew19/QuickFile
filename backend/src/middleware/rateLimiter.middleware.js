const rateLimit = require('express-rate-limit');

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
const userKeyGenerator = (req) => (req.user && req.user._id ? req.user._id.toString() : req.ip || 'unknown');

/**
 * Rate limiter for sensitive authentication endpoints (Login, Register, Password Reset)
 * 15 requests per 15 minutes per IP (16th attempt returns 429)
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  validate: { trustProxy: false },
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many authentication attempts. Please try again after 15 minutes.'),
});

/**
 * Rate limiter for Super Admin Key verification & settings save
 * 15 requests per 15 minutes per IP, skipping successful requests
 */
const suKeyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  validate: { trustProxy: false },
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many Super Admin Key verification attempts. Please try again after 15 minutes.'),
});

/**
 * Rate limiter for public endpoints (Public QR verification, config, etc.)
 * 60 requests per 15 minutes per IP
 */
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  validate: { trustProxy: false },
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many requests. Please slow down.'),
});

/**
 * Unauthenticated API limiter (per IP)
 * 100 requests per 15 minutes per IP
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  validate: { trustProxy: false },
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Rate limit exceeded. Please try again later.'),
});

/**
 * Authenticated user API limiter (placed AFTER authenticate middleware)
 * 100 requests per 15 minutes per user ID
 */
const userApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  validate: { trustProxy: false },
  keyGenerator: userKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('User rate limit exceeded. Please try again later.'),
});

/**
 * High-frequency limiter for live status polling endpoints (8-second citizen polling)
 * 300 requests per 15 minutes per user
 */
const pollingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  validate: { trustProxy: false },
  keyGenerator: userKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many status polling requests. Please reduce polling frequency.'),
});

module.exports = {
  authLimiter,
  suKeyLimiter,
  publicLimiter,
  apiLimiter,
  userApiLimiter,
  pollingLimiter,
};
