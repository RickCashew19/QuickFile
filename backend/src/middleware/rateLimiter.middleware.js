const rateLimit = require('express-rate-limit');

/**
 * Standard JSON response handler for rate limit exceeded
 */
const rateLimitHandler = (message) => (req, res) => {
  res.status(429).json({
    success: false,
    message,
    retryAfter: res.getHeader('Retry-After') || 60,
  });
};

/**
 * Rate limiter for sensitive authentication endpoints (Login, Register, Password Reset)
 * 15 requests per 15 minutes per IP
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many authentication attempts. Please try again after 15 minutes.'),
});

/**
 * Rate limiter for Super Admin PIN verification
 * 5 attempts per 15 minutes per IP
 */
const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many PIN verification attempts. Please try again after 15 minutes.'),
});

/**
 * Rate limiter for public endpoints (Public QR verification, etc.)
 * 60 requests per 15 minutes per IP
 */
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many requests. Please slow down.'),
});

/**
 * General API limiter for all /api endpoints
 * 200 requests per 15 minutes per IP
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Rate limit exceeded. Please try again later.'),
});

module.exports = {
  authLimiter,
  pinLimiter,
  publicLimiter,
  apiLimiter,
};
