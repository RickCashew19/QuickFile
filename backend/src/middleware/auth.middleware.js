const jwt = require('jsonwebtoken');
const { config } = require('../config');
const { User } = require('../models');

/**
 * Authentication Middleware: Bearer JWT Only
 * Extracts JWT from the Authorization header (Authorization: Bearer <token>)
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No Bearer token provided in Authorization header.',
        data: null,
      });
    }

    const token = authHeader.split(' ')[1].trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Malformed Authorization header. Missing token.',
        data: null,
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.getSecret());
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token has expired. Please log in again.',
          code: 'TOKEN_EXPIRED',
          data: null,
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token.',
        code: 'TOKEN_INVALID',
        data: null,
      });
    }

    const user = await User.findById(decoded.id).select('-password_hash');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User account not found. Authentication rejected.',
        data: null,
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Your account is deactivated. Access denied.',
        data: null,
      });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional Authentication: Attaches req.user if valid token is provided
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1].trim();
      if (token) {
        try {
          const decoded = jwt.verify(token, config.jwt.getSecret());
          const user = await User.findById(decoded.id).select('-password_hash');
          if (user && user.is_active) {
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
