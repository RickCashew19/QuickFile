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
 * Helper to identify request by authenticated user ID if available, otherwise by IP
 */
const userOrIpKey = (req) => (req.user && req.user._id ? req.user._id.toString() : req.ip || 'unknown');

/**
 * Rate limiter for sensitive authentication endpoints (Login, Register, Password Reset)
 * 15 requests per 15 minutes per IP
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
 * Rate limiter for public endpoints (Public QR verification, etc.)
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
 * General API limiter for authenticated & general routes
 * 600 requests per 15 minutes per authenticated user (or per IP for unauthenticated)
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  validate: { trustProxy: false },
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Rate limit exceeded. Please try again later.'),
});

/**
 * High-frequency limiter for live status polling endpoints (8-second citizen polling)
 * 1200 requests per 15 minutes per user
 */
const pollingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1200,
  validate: { trustProxy: false },
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many status polling requests. Please reduce polling frequency.'),
});

module.exports = {
  authLimiter,
  suKeyLimiter,
  publicLimiter,
  apiLimiter,
  pollingLimiter,
};
