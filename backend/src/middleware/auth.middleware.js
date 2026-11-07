const jwt = require('jsonwebtoken');
const config = require('../config');
const { User } = require('../models');
const { USER_STATUSES } = require('../config/constants');

/**
 * Authentication Middleware: Bearer JWT Only
 * Extracts JWT from the Authorization header (Authorization: Bearer <token>).
 * Strictly forbids cookies or server session usage.
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No Bearer token provided in Authorization header.',
      });
    }

    const token = authHeader.split(' ')[1].trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Malformed Authorization header. Missing token.',
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token has expired. Please log in again.',
          code: 'TOKEN_EXPIRED',
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token.',
        code: 'TOKEN_INVALID',
      });
    }

    // Find user by ID in MongoDB
    const user = await User.findById(decoded.id).select('-password_hash');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User account not found. Authentication rejected.',
      });
    }

    if (user.status !== USER_STATUSES.ACTIVE) {
      return res.status(403).json({
        success: false,
        message: `Your account is currently ${user.status}. Access denied.`,
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional Authentication: Attaches req.user if a valid token is present, but does not block if missing
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1].trim();
      if (token) {
        try {
          const decoded = jwt.verify(token, config.jwt.secret);
          const user = await User.findById(decoded.id).select('-password_hash');
          if (user && user.status === USER_STATUSES.ACTIVE) {
            req.user = user;
          }
        } catch {
          // Ignore invalid token in optional auth
        }
      }
    }
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  authenticate,
  optionalAuth,
};
